import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import type { AgentLauncher } from '../agents/agent-launcher'
import type { AgentRole } from '../agents/role-results'
import { createScriptedLauncher } from '../agents/scripted-launcher'
import {
    createPracticeRepo,
    EMPTY_LEARNER_TURN,
    HAPPY_TURNS,
} from '../testing/practice-repo'

/**
 * The live file (#628), end to end on the practice repo, with scripted
 * agents: while an agent works, the engine keeps `live.json` in the run
 * folder with what it is doing, from the progress its launcher hears
 * (`on_progress`). A launch here reports progress, then watches the file,
 * all before its scripted turn plays, so before the turn ends.
 */

/** The live file as the board reads it. */
type Live = {
    written_at: string
    plan_usage: unknown
    agents: Record<string, unknown>[]
}

/** The progress a launcher hears in a turn, as it hands it on. */
type Progress = {
    tokens: number
    action: { tool: string; target: string; at: string } | null
    open_call: { tool: string; target: string; started_at: string } | null
    rate_limit_events: Record<string, unknown>[]
}

type LaunchArgs = Parameters<AgentLauncher['launch']>[0] & {
    on_progress?: (progress: Progress) => void
}

let root = ''

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'luca-live-file-'))
})

afterEach(async () => {
    await rm(root, { recursive: true, force: true })
})

/** The run folder's live file of the practice run in `dir`. */
const liveFileIn = (dir: string): string =>
    join(dir, 'runs', 'run-1', 'live.json')

const readLive = (file: string): Live | null => {
    try {
        return JSON.parse(readFileSync(file, 'utf8')) as Live
    } catch {
        return null
    }
}

/** The live file once `until` holds for it, or `null` after `ms`. */
const waitForLive = async ({
    file,
    until,
    ms = 3000,
}: {
    file: string
    until: (live: Live) => boolean
    ms?: number
}): Promise<Live | null> => {
    const deadline = Date.now() + ms
    while (Date.now() < deadline) {
        const live = readLive(file)
        if (live !== null && until(live)) return live
        await Bun.sleep(20)
    }
    return null
}

/**
 * The happy path's scripted launcher; each launch of `role` runs `during`
 * first, with the launch's arguments.
 */
const watching = ({
    role,
    during,
}: {
    role: AgentRole
    during: (args: LaunchArgs) => Promise<void>
}): AgentLauncher => {
    const scripted = createScriptedLauncher({
        turns: [...HAPPY_TURNS, EMPTY_LEARNER_TURN(10)],
    })
    return {
        ...scripted,
        launch: async (args) => {
            if (args.role === role) await during(args)
            return scripted.launch(args)
        },
    }
}

const progress = (fields: Partial<Progress>): Progress => ({
    tokens: 0,
    action: null,
    open_call: null,
    rate_limit_events: [],
    ...fields,
})

/**
 * A journal's lines with what differs between any two runs masked (times,
 * shas, the temp folder, durations, the order lenses start in), so two
 * runs that did the same compare the same.
 */
const comparable = ({ text, dir }: { text: string; dir: string }) =>
    text
        .split('\n')
        .filter((line) => line !== '')
        .map((line) =>
            line
                .replaceAll(realpathSync(dir), '<dir>')
                .replaceAll(dir, '<dir>')
                .replace(/"(seq|first_seq)":\d+/g, '"$1":0')
                .replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z/g, '<time>')
                .replace(/\b[0-9a-f]{7,40}\b/g, '<sha>')
                .replace(/"(\w*_ms)":\d+(\.\d+)?/g, '"$1":0')
                .replace(/\d+(\.\d+)?ms\b/g, '<ms>')
                .replace(/scripted-([a-z-]+)-(\d+)-\d+/g, 'scripted-$1-$2')
        )
        .toSorted()

describe('the live file, with scripted agents', () => {
    test("during an agent's turn, the live file holds its ticket, role, model, tokens so far and latest action, and not its prompt", async () => {
        const practice = await createPracticeRepo({ root })
        const file = liveFileIn(root)
        let seen: Live | null = null
        let model = ''
        const at = new Date().toISOString()
        const launcher = watching({
            role: 'test-writer',
            during: async (args) => {
                model = args.model
                args.on_progress?.(
                    progress({
                        tokens: 4321,
                        action: { tool: 'Edit', target: 'src/sum.test.ts', at },
                    })
                )
                seen = await waitForLive({
                    file,
                    until: (live) =>
                        live.agents.some((agent) => agent.ticket === 11),
                })
            },
        })

        await practice.run({
            launcher,
            live_file: file,
            stop_before: ['run_red_check'],
        })

        expect(seen).not.toBeNull()
        const live = seen as unknown as Live
        expect(Number.isNaN(Date.parse(live.written_at))).toBe(false)
        expect(live.agents).toContainEqual(
            expect.objectContaining({
                ticket: 11,
                role: 'test-writer',
                model,
                tokens: 4321,
                action: expect.objectContaining({
                    tool: 'Edit',
                    target: 'src/sum.test.ts',
                    at,
                }),
            })
        )
        // A line of the test-writer's prompt: the ticket's criteria.
        expect(JSON.stringify(live)).not.toContain('sum of no numbers is zero')
    }, 60_000)

    test('the live file is replaced whole, at most once a second, and rewritten at least every 5 seconds when nothing changed', async () => {
        const practice = await createPracticeRepo({ root })
        const file = liveFileIn(root)
        const writes: { written_at: number; ino: number }[] = []
        let unreadable = 0
        let lastChange = 0
        const launcher = watching({
            role: 'test-writer',
            during: async (args) => {
                let polling = true
                let last = ''
                const poll = (async () => {
                    while (polling) {
                        let text = ''
                        let ino = 0
                        try {
                            text = readFileSync(file, 'utf8')
                            ino = statSync(file).ino
                        } catch {
                            text = ''
                        }
                        if (text !== '' && text !== last) {
                            last = text
                            const live = (() => {
                                try {
                                    return JSON.parse(text) as Live
                                } catch {
                                    return null
                                }
                            })()
                            if (live === null) unreadable += 1
                            else {
                                writes.push({
                                    written_at: Date.parse(live.written_at),
                                    ino,
                                })
                            }
                        }
                        await Bun.sleep(10)
                    }
                })()
                // 2.5 seconds of changes, 20 a second, then 6.5 quiet ones.
                for (let n = 1; n <= 50; n += 1) {
                    args.on_progress?.(progress({ tokens: n * 100 }))
                    await Bun.sleep(50)
                }
                lastChange = Date.now()
                await Bun.sleep(6500)
                polling = false
                await poll
            },
        })

        await practice.run({
            launcher,
            live_file: file,
            stop_before: ['run_red_check'],
        })

        expect(unreadable).toBe(0)
        expect(writes.length).toBeGreaterThanOrEqual(3)
        const gaps = writes
            .slice(1)
            .map(
                (write, index) =>
                    write.written_at - (writes[index]?.written_at ?? 0)
            )
        expect(Math.min(...gaps)).toBeGreaterThanOrEqual(950)
        expect(Math.max(...gaps)).toBeLessThanOrEqual(5600)
        // Each write is a new file, renamed into place over the last one.
        const sameFile = writes
            .slice(1)
            .filter((write, index) => write.ino === writes[index]?.ino)
        expect(sameFile).toEqual([])
        // With nothing new, it is still rewritten.
        expect(
            writes.filter(({ written_at }) => written_at > lastChange + 1100)
                .length
        ).toBeGreaterThanOrEqual(1)
    }, 60_000)

    test('the first plan-usage reading reaches the live file before the first turn ends', async () => {
        const practice = await createPracticeRepo({ root })
        const file = liveFileIn(root)
        const reading = {
            status: 'allowed',
            rateLimitType: 'seven_day',
            isUsingOverage: false,
            unifiedWindows: {
                seven_day: { utilization: 0.42, resetsAt: 1790179800 },
            },
            arrived_at: new Date().toISOString(),
        }
        let seen: Live | null = null
        const launcher = watching({
            role: 'test-writer',
            during: async (args) => {
                args.on_progress?.(progress({ rate_limit_events: [reading] }))
                seen = await waitForLive({
                    file,
                    until: (live) =>
                        live.plan_usage !== null &&
                        live.plan_usage !== undefined,
                })
            },
        })

        await practice.run({
            launcher,
            live_file: file,
            stop_before: ['run_red_check'],
        })

        expect(seen).not.toBeNull()
        expect((seen as unknown as Live).plan_usage).toMatchObject(reading)
    }, 60_000)

    test("a scripted run's journal is the same, byte for byte, with the live file on or off; the live file ends with no agents", async () => {
        const journals: string[][] = []
        let ended: Live | null = null
        for (const on of [false, true]) {
            const dir = join(root, on ? 'on' : 'off')
            await mkdir(dir)
            const practice = await createPracticeRepo({ root: dir })
            const file = liveFileIn(dir)
            const launcher = watching({
                role: 'implementer',
                during: async (args) => {
                    args.on_progress?.(
                        progress({
                            tokens: 900,
                            action: {
                                tool: 'Edit',
                                target: 'src/sum.ts',
                                at: new Date().toISOString(),
                            },
                        })
                    )
                    await Bun.sleep(1200)
                },
            })

            const { action } = await practice.run({
                launcher,
                ...(on ? { live_file: file } : {}),
            })

            expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
            journals.push(
                comparable({
                    text: readFileSync(practice.journal.file, 'utf8'),
                    dir,
                })
            )
            if (on) ended = readLive(file)
            else expect(existsSync(file)).toBe(false)
        }

        expect(journals[1]).toEqual(journals[0] ?? [])
        expect(ended).toMatchObject({
            written_at: expect.any(String),
            agents: [],
        })
    }, 120_000)
})

/** An agent's `activity` in the live file: 30 counts, one per second, oldest first. */
const activityOf = (agent: Record<string, unknown> | undefined): number[] =>
    Array.isArray(agent?.activity) ? (agent.activity as number[]) : []

const sum = (counts: number[]): number =>
    counts.reduce((total, count) => total + count, 0)

describe('the heartbeat in the live file (#631)', () => {
    test("each agent's entry holds an activity count for each of the last 30 seconds, one tick for every progress the engine hears, newest last", async () => {
        const practice = await createPracticeRepo({ root })
        const file = liveFileIn(root)
        const BURST = 10
        let seen: Live | null = null
        const launcher = watching({
            role: 'test-writer',
            during: async (args) => {
                for (let n = 1; n <= BURST; n += 1) {
                    args.on_progress?.(progress({ tokens: n * 10 }))
                }
                seen = await waitForLive({
                    file,
                    until: (live) =>
                        sum(
                            activityOf(
                                live.agents.find((one) => one.ticket === 11)
                            )
                        ) >= BURST,
                })
            },
        })

        await practice.run({
            launcher,
            live_file: file,
            stop_before: ['run_red_check'],
        })

        expect(seen).not.toBeNull()
        const agent = (seen as unknown as Live).agents.find(
            (one) => one.ticket === 11
        )
        const activity = activityOf(agent)
        expect(activity).toHaveLength(30)
        expect(activity.every((count) => Number.isInteger(count))).toBe(true)
        expect(activity.every((count) => count >= 0)).toBe(true)
        // The burst just happened: it is in the newest seconds, and nothing is older.
        expect(sum(activity.slice(0, 27))).toBe(0)
        expect(sum(activity.slice(-3))).toBeGreaterThanOrEqual(BURST)
    }, 60_000)

    test('while a tool call is open, each second adds one low tick, with no other progress heard', async () => {
        const practice = await createPracticeRepo({ root })
        const file = liveFileIn(root)
        let seen: Live | null = null
        const launcher = watching({
            role: 'test-writer',
            during: async (args) => {
                // One progress opens the call; then nothing else is heard.
                args.on_progress?.(
                    progress({
                        open_call: {
                            tool: 'Bash',
                            target: 'bun test',
                            started_at: new Date().toISOString(),
                        },
                    })
                )
                seen = await waitForLive({
                    file,
                    ms: 8000,
                    until: (live) =>
                        activityOf(
                            live.agents.find((one) => one.ticket === 11)
                        ).filter((count) => count > 0).length >= 3,
                })
            },
        })

        await practice.run({
            launcher,
            live_file: file,
            stop_before: ['run_red_check'],
        })

        expect(seen).not.toBeNull()
        const activity = activityOf(
            (seen as unknown as Live).agents.find((one) => one.ticket === 11)
        )
        const busy = activity.filter((count) => count > 0)
        // A steady ripple: three or more seconds with a tick, none of them loud.
        expect(busy.length).toBeGreaterThanOrEqual(3)
        expect(Math.max(...activity)).toBeLessThanOrEqual(2)
    }, 60_000)
})
