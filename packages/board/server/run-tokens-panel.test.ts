import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, test } from 'bun:test'

import { createHarness, type Harness } from './testing/board-harness'
import {
    agentSession,
    intakeOfThree,
    rateLimit,
    stamp,
    ticketWorktreeCreated,
    unifiedRateLimit,
    usageRecorded,
    wholeTicket,
    type Entry,
} from './testing/journal-fixtures'

/**
 * Exact tokens on the board (#433), at `board.read`: the run card's tokens,
 * summed from each agent turn's tokens per model; plan-window numbers
 * labelled as account-wide; and older journals, with no tokens per model,
 * still shown.
 */

let harness: Harness | null = null
const dirs: string[] = []

afterEach(async () => {
    await harness?.cleanup()
    harness = null
    for (const dir of dirs.splice(0)) {
        await rm(dir, { recursive: true, force: true })
    }
})

/** Starts a run and sends intake plus `entries` in one go. */
const runWith = async ({ entries }: { entries: Entry[] }) => {
    harness = await createHarness()
    const { run_id, token } = await harness.start()
    await harness.send({
        run_id,
        token,
        entries: [...intakeOfThree(), ...entries],
    })
    return harness
}

type Tokens = {
    input_tokens: number
    output_tokens: number
    cache_read_input_tokens: number
    cache_creation_input_tokens: number
}

const tokens = (
    input: number,
    output: number,
    cache_read: number,
    cache_creation: number
): Tokens => ({
    input_tokens: input,
    output_tokens: output,
    cache_read_input_tokens: cache_read,
    cache_creation_input_tokens: cache_creation,
})

const OPUS = 'claude-opus-5-5'
const HAIKU = 'claude-haiku-4-5-20251001'

/**
 * An agent turn's session with its tokens per model, as the launcher now
 * journals them, and a main loop's usage that leaves subagents out.
 */
const sessionWithModels = ({
    ticket,
    role,
    model_usage,
}: {
    ticket: number | null
    role: string
    model_usage: Record<string, Tokens>
}): Entry => {
    const base = agentSession({
        ticket,
        role,
        input: 1,
        output: 1,
        cache_read: 1,
        cache_creation: 1,
    })
    const content = base.content as { role: string; session: object }
    return {
        ...base,
        content: {
            ...content,
            session: { ...content.session, model_usage },
        },
    }
}

describe("the run card: the run's exact tokens", () => {
    test("the run's tokens are every agent turn's input, output, and cache-creation tokens per model, the final review's included; cache reads are not counted", async () => {
        const board = await runWith({
            entries: [
                ticketWorktreeCreated({ ticket: 11 }),
                sessionWithModels({
                    ticket: 11,
                    role: 'test-writer',
                    model_usage: {
                        [OPUS]: tokens(1000, 2000, 50_000, 3000),
                        [HAIKU]: tokens(100, 200, 400, 300),
                    },
                }),
                ticketWorktreeCreated({ ticket: 13 }),
                sessionWithModels({
                    ticket: 13,
                    role: 'implementer',
                    model_usage: { [OPUS]: tokens(1500, 4000, 80_000, 5000) },
                }),
                sessionWithModels({
                    ticket: null,
                    role: 'architecture-lens',
                    model_usage: { [OPUS]: tokens(200, 300, 10_000, 100) },
                }),
            ],
        })

        expect((await board.state()).run_tokens).toBe(17_700)
    })

    test("a session from an older journal, with no tokens per model, counts its usage's input, output, and cache-creation tokens", async () => {
        const board = await runWith({
            entries: [
                ticketWorktreeCreated({ ticket: 11 }),
                agentSession({
                    ticket: 11,
                    role: 'test-writer',
                    input: 10,
                    output: 100,
                    cache_read: 5000,
                    cache_creation: 40,
                }),
                agentSession({
                    ticket: 11,
                    role: 'implementer',
                    input: 20,
                    output: 200,
                    cache_read: 7000,
                    cache_creation: 60,
                }),
            ],
        })

        expect((await board.state()).run_tokens).toBe(430)
    })

    test('a run with no agent session yet shows no tokens', async () => {
        const board = await runWith({ entries: [] })
        expect((await board.state()).run_tokens).toBe(0)
    })
})

describe('plan-window numbers are account-wide', () => {
    test('the panel labels the plan usage as account-wide, so it is not read as one run', async () => {
        const board = await runWith({
            entries: [
                ticketWorktreeCreated({ ticket: 11 }),
                agentSession({
                    ticket: 11,
                    role: 'implementer',
                    rate_limits: [
                        unifiedRateLimit({
                            windows: {
                                five_hour: { utilization: 0.03 },
                                seven_day: { utilization: 0.17 },
                            },
                        }),
                    ],
                }),
            ],
        })

        const state = await board.state()
        expect(state.usage).toMatchObject({
            five_hour_percent: 3,
            weekly_percent: 17,
        })
        expect(state.usage_label).toContain('account-wide')
    })

    test("the chat's header row labels the plan usage as account-wide too", async () => {
        const board = await runWith({
            entries: [
                ticketWorktreeCreated({ ticket: 11 }),
                agentSession({
                    ticket: 11,
                    role: 'implementer',
                    rate_limits: [
                        rateLimit({ type: 'five_hour', utilization: 0.4 }),
                    ],
                }),
            ],
        })

        const header = board
            .latestRows()
            .find(({ row }) => row.kind === 'luca-board-run')?.row
        expect(header).toMatchObject({
            data: {
                usage: { five_hour_percent: 40 },
                usage_label: expect.stringContaining('account-wide'),
            },
        })
    })
})

describe('older journals without tokens per model', () => {
    const REPO = '/repo'

    test('an older journal on disk, with no tokens per model and a run usage record with no total, still rebuilds and shows its tokens and plan used', async () => {
        const runs_dir = await mkdtemp(join(tmpdir(), 'luca-board-tokens-'))
        dirs.push(runs_dir)
        const run_id = 'luca-20260924-150639-ovty'
        const entries: Entry[] = [
            ...intakeOfThree(),
            ...wholeTicket({ ticket: 11 }),
            usageRecorded({
                ticket: null,
                windows: { five_hour: { from: 0, to: 3, used: 3 } },
            }),
        ].map((entry) =>
            entry.kind === 'run_started'
                ? {
                      ...entry,
                      content: { ...(entry.content as object), repo: REPO },
                  }
                : entry
        )
        await mkdir(join(runs_dir, run_id), { recursive: true })
        await writeFile(
            join(runs_dir, run_id, 'journal.jsonl'),
            `${stamp({ entries })
                .map((record) => JSON.stringify(record))
                .join('\n')}\n`
        )
        harness = await createHarness({ runs_dir })

        const { selected } = await harness.board.readBoard({
            workspace_id: 'ws-1',
            directory: REPO,
            run_id,
        })

        expect(selected?.run.run_id).toBe(run_id)
        expect(selected?.tickets.find((t) => t.number === 11)?.stage).toBe(
            'done'
        )
        // wholeTicket's three sessions: 100 + 400, 200 + 800, 50 + 150.
        expect(selected?.run_tokens).toBe(1700)
        expect(selected?.run_plan_used).toEqual([
            { window: 'five-hour', percent: 3 },
        ])
    })
})
