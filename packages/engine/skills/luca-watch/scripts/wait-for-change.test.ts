import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { LIVE_STALE_MS, waitForChange } from './wait-for-change'

import type { JournalEntry } from '../../../src/journal/journal-record'
import {
    billingStopped,
    commentRead,
    intakePassed,
    practiceTicket,
    pullRequestOpened,
    replyReceived,
    runBranchCreated,
    stuckReported,
    ticketRetried,
} from '../../../src/testing/build-fixtures'
import { recordsFrom } from '../../../src/testing/intake-fixtures'

/**
 * The `/luca-watch` wait helper against journals built with the engine's
 * own fixtures, written to disk as the engine writes them. Its process
 * list, clock and sleep are fakes handed to `waitForChange`: nothing
 * really waits, and `ps` never runs.
 */

let dir = ''

beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'luca-watch-'))
})

afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
})

const SCRIPT = join(import.meta.dir, 'wait-for-change.ts')

const TICKETS = [
    practiceTicket({ number: 11, title: 'Add sum' }),
    practiceTicket({ number: 12, title: 'Add product' }),
]

/** The run's start, intake, and its run branch: four records and one. */
const STARTED: JournalEntry[] = [
    ...intakePassed({ tickets: TICKETS }),
    runBranchCreated(),
]

/**
 * Writes run `run_id`'s journal: `before` with its last record at seq 40,
 * then `after` from seq 41 on.
 */
const writeRun = async ({
    run_id = 'run-1',
    before = STARTED,
    after,
}: {
    run_id?: string
    before?: JournalEntry[]
    after: JournalEntry[]
}): Promise<void> => {
    const shift = 40 - before.length
    const records = recordsFrom({ entries: [...before, ...after] }).map(
        (record) => ({ ...record, seq: record.seq + shift })
    )
    await mkdir(join(dir, run_id), { recursive: true })
    await Bun.write(
        join(dir, run_id, 'journal.jsonl'),
        records.map((record) => JSON.stringify(record)).join('\n') + '\n'
    )
}

/** A live engine on run-1, and the board beside it. */
const LIVE = [
    {
        pid: 500,
        ppid: 1,
        command: 'bun /luca/engine/luca-run.ts --resume run-1',
    },
    { pid: 600, ppid: 1, command: 'bun /luca/board/server.ts' },
]

/**
 * A fake clock that moves only when slept, and what was slept. Its
 * process list gives `rows`, or rejects with `failing`.
 */
const fakes = ({
    rows = LIVE,
    failing,
}: {
    rows?: { pid: number; ppid: number; command: string }[]
    failing?: string
} = {}) => {
    let now = Date.parse('2026-10-29T12:00:00.000Z')
    const slept: number[] = []
    return {
        slept,
        list_process_rows: async () => {
            if (failing !== undefined) throw new Error(failing)
            return rows
        },
        now: () => now,
        sleep: async (ms: number) => {
            slept.push(ms)
            now += ms
        },
    }
}

/** The helper on run-1 after `last_seq`, with these fakes. */
const waitOn = ({
    last_seq = 40,
    run_id = 'run-1',
    ...given
}: Parameters<typeof fakes>[0] & {
    last_seq?: number
    run_id?: string
} = {}) => {
    const { slept, ...deps } = fakes(given)
    return {
        slept,
        result: waitForChange({ run_id, last_seq, runs_dir: dir, ...deps }),
    }
}

describe('the helper reads the journal after its cursor, oldest first', () => {
    test('an answered stuck at seq 41 comes first, then the open one at seq 42, so neither is skipped', async () => {
        await writeRun({
            after: [
                stuckReported({ ticket: 11 }),
                stuckReported({ ticket: 12 }),
                commentRead({ comment_id: 200, body: 'retry #11' }),
                replyReceived({ word: 'retry', ticket: 11, comment_id: 200 }),
                ticketRetried({ ticket: 11, mode: 'resume' }),
            ],
        })

        const first = await waitOn({ last_seq: 40 }).result
        expect(first).toMatchObject({ event: 'stuck', last_seq: 41 })
        const next = await waitOn({ last_seq: first.last_seq }).result
        expect(next).toMatchObject({ event: 'stuck', last_seq: 42 })
    })

    test('a stuck report prints as one JSON line with its body as the detail', async () => {
        // A comment at seq 41, then the stuck report at seq 42.
        await writeRun({
            after: [
                commentRead({ comment_id: 299, body: 'looking into it' }),
                {
                    kind: 'stuck_reported',
                    ticket: 12,
                    role: null,
                    content: { comment_id: 300, body: 'Ticket #12 is stuck' },
                },
            ],
        })

        const line = JSON.stringify(await waitOn({ last_seq: 40 }).result)
        expect(line).toContain('"event":"stuck"')
        expect(line).toContain('"last_seq":42')
        expect(line).toContain('"detail":"Ticket #12 is stuck"')
    })
})

describe('the run ends', () => {
    test('a run_ended with its PR is ended, with the URL in the detail', async () => {
        const url = 'https://github.com/asibilia/luca-framework/pull/707'
        await writeRun({
            after: [
                {
                    kind: 'run_ended',
                    ticket: null,
                    role: null,
                    content: {
                        outcome: 'pull_request',
                        detail: 'PR opened',
                        url,
                    },
                },
            ],
        })

        const line = JSON.stringify(await waitOn({ rows: [] }).result)
        expect(line).toContain('"event":"ended"')
        expect(line).toContain(url)
    })

    test('the legacy endings are ended: an opened PR, a stop reply, a refusal, nothing to do, a billing or crash stop', async () => {
        const legacy: [string, JournalEntry[]][] = [
            ['pr', [pullRequestOpened()]],
            [
                'stop',
                [replyReceived({ word: 'stop', ticket: null, comment_id: 9 })],
            ],
            [
                'refused',
                [
                    {
                        kind: 'intake_refused',
                        ticket: null,
                        role: null,
                        content: {
                            problems: [
                                {
                                    ticket: 12,
                                    missing: ['Acceptance criteria'],
                                },
                            ],
                        },
                    },
                ],
            ],
            [
                'nothing',
                [
                    {
                        kind: 'nothing_to_do',
                        ticket: null,
                        role: null,
                        content: {
                            closed_tickets: [11, 12],
                            already_done: [],
                            left_out: [],
                        },
                    },
                ],
            ],
            ['billing', [billingStopped({ reason: 'overage in use' })]],
            [
                'crashed',
                [
                    {
                        kind: 'run_stopped',
                        ticket: null,
                        role: null,
                        content: {
                            reason: 'it crashed',
                            role: null,
                            billing: false,
                            crashed: true,
                        },
                    },
                ],
            ],
        ]
        for (const [run_id, after] of legacy) {
            await writeRun({ run_id, after })
            const { result } = waitOn({ run_id, rows: [] })
            expect({ run_id, event: (await result).event }).toEqual({
                run_id,
                event: 'ended',
            })
        }
    })

    test('a resumable run_stopped with no live engine is engine_gone, not an ending', async () => {
        await writeRun({
            after: [
                {
                    kind: 'run_stopped',
                    ticket: 11,
                    role: 'test-writer',
                    content: {
                        reason: 'the wrong model',
                        role: 'test-writer',
                        billing: false,
                        crashed: false,
                    },
                },
            ],
        })

        expect(await waitOn({ rows: LIVE.slice(1) }).result).toMatchObject({
            event: 'engine_gone',
            last_seq: 41,
        })
    })
})

describe('the engine is gone', () => {
    test('after a network wait that gave up, engine_gone names the network wait', async () => {
        await writeRun({
            after: [
                {
                    kind: 'network_wait_started',
                    ticket: null,
                    role: null,
                    content: {
                        step: 'read_replies',
                        error: 'getaddrinfo ENOTFOUND',
                    },
                },
                {
                    kind: 'network_wait_ended',
                    ticket: null,
                    role: null,
                    content: { step: 'read_replies', tries: 15, gave_up: true },
                },
            ],
        })

        const result = await waitOn({ rows: LIVE.slice(1) }).result
        expect(result).toMatchObject({ event: 'engine_gone', last_seq: 42 })
        expect(result.detail).toMatch(/network.wait/i)
    })

    test('a process list that fails is an error, never engine_gone', async () => {
        await writeRun({
            after: [
                {
                    kind: 'network_wait_ended',
                    ticket: null,
                    role: null,
                    content: { step: 'read_replies', tries: 15, gave_up: true },
                },
            ],
        })

        const result = await waitOn({ failing: 'ps: operation not permitted' })
            .result
        expect(result.event).toBe('error')
    })
})

describe('an engine started with --spec and no --run-id (#727)', () => {
    /** The engine's own command line: the run id it made is not on it. */
    const SPEC_ONLY = [
        {
            pid: 56973,
            ppid: 1,
            command: 'bun /luca/engine/luca-run.ts --spec 720',
        },
        { pid: 600, ppid: 1, command: 'bun /luca/board/server.ts' },
    ]

    /** Run-1's live file, written at `written_at`, by engine `pid` if given. */
    const writeLiveFile = async (
        written_at: string,
        pid?: number
    ): Promise<void> => {
        await Bun.write(
            join(dir, 'run-1', 'live.json'),
            JSON.stringify({ written_at, pid, agents: [], waits: [], feed: [] })
        )
    }

    test("the live file's pid in the process list is a live engine, however old the file (a laptop asleep)", async () => {
        await writeRun({ after: [] })
        await writeLiveFile('2026-10-29T11:50:00.000Z', 56973)

        expect(await waitOn({ rows: SPEC_ONLY }).result).toMatchObject({
            event: 'quiet',
        })
    })

    test("the live file's pid not in the process list is no live engine, however fresh the file (it just stopped)", async () => {
        await writeRun({ after: [] })
        await writeLiveFile('2026-10-29T11:59:58.000Z', 99999)

        expect(await waitOn({ rows: SPEC_ONLY }).result).toMatchObject({
            event: 'engine_gone',
        })
    })

    test('a live file with no pid written in the future is no live engine', async () => {
        await writeRun({ after: [] })
        await writeLiveFile('2026-10-29T12:30:00.000Z')

        expect(await waitOn({ rows: SPEC_ONLY }).result).toMatchObject({
            event: 'engine_gone',
        })
    })

    test("the stale window is the board's", async () => {
        const board = await Bun.file(
            join(
                import.meta.dir,
                '../../../../board/shared/board-state-live.ts'
            )
        ).text()
        const match = board.match(/LIVE_STALE_MS = ([\d_]+)/)
        expect(Number(match?.[1]?.replaceAll('_', ''))).toBe(LIVE_STALE_MS)
    })

    test('a fresh live file is a live engine: five quiet minutes, never engine_gone', async () => {
        await writeRun({ after: [] })
        const { slept, sleep, now, ...deps } = fakes({ rows: SPEC_ONLY })
        // The engine writes its live file every few seconds while it runs.
        const writeNow = () =>
            writeLiveFile(new Date(now() - 3_000).toISOString())
        await writeNow()

        const result = await waitForChange({
            run_id: 'run-1',
            last_seq: 40,
            runs_dir: dir,
            ...deps,
            now,
            sleep: async (ms) => {
                await sleep(ms)
                await writeNow()
            },
        })

        expect(result).toMatchObject({ event: 'quiet', last_seq: 40 })
        expect(slept.length).toBeGreaterThan(0)
    })

    test('a live file not written for over a minute is no live engine', async () => {
        await writeRun({ after: [] })
        await writeLiveFile('2026-10-29T11:58:00.000Z')

        expect(await waitOn({ rows: SPEC_ONLY }).result).toMatchObject({
            event: 'engine_gone',
        })
    })

    test('an unreadable live file is no live engine', async () => {
        await writeRun({ after: [] })
        await Bun.write(join(dir, 'run-1', 'live.json'), '{ half')

        expect(await waitOn({ rows: SPEC_ONLY }).result).toMatchObject({
            event: 'engine_gone',
        })
    })
})

describe('nothing happens', () => {
    test('five quiet minutes return quiet and the highest seq read, polling every five seconds', async () => {
        await writeRun({
            after: [
                {
                    kind: 'step_started',
                    ticket: 11,
                    role: 'implementer',
                    content: {
                        key: '11',
                        step: 'launch_agent:implementer',
                        first_seq: null,
                    },
                },
            ],
        })

        const { slept, result } = waitOn({ last_seq: 40 })
        expect(await result).toMatchObject({ event: 'quiet', last_seq: 41 })
        expect(slept.length).toBeGreaterThan(0)
        expect(slept.every((ms) => ms === 5_000)).toBe(true)
        const total = slept.reduce((sum, ms) => sum + ms, 0)
        expect(total).toBeGreaterThanOrEqual(5 * 60_000)
        expect(total).toBeLessThan(5 * 60_000 + 10_000)
    })
})

describe('the command line', () => {
    const cli = async (args: string[]) => {
        const child = Bun.spawn(
            [process.execPath, SCRIPT, ...args, '--runs-dir', dir],
            { stdout: 'pipe', stderr: 'pipe' }
        )
        const [stdout, exit_code] = await Promise.all([
            new Response(child.stdout).text(),
            child.exited,
        ])
        const lines = stdout.trim().split('\n')
        return { exit_code, last: JSON.parse(lines.at(-1) ?? '{}') }
    }

    test('a missing journal prints an error line and exits 2', async () => {
        const { exit_code, last } = await cli(['no-such-run', '40'])
        expect(exit_code).toBe(2)
        expect(last).toMatchObject({ event: 'error' })
    })

    test('an invalid cursor prints an error line and exits 2', async () => {
        await writeRun({ after: [] })
        const { exit_code, last } = await cli(['run-1', 'forty'])
        expect(exit_code).toBe(2)
        expect(last).toMatchObject({ event: 'error' })
    })
})

describe('the helper ships alone', () => {
    test('it imports only Bun and Node built-ins', async () => {
        const source = await Bun.file(SCRIPT).text()
        const imported = [
            ...source.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g),
        ].map((match) => match[1] ?? '')
        expect(imported.length).toBeGreaterThan(0)
        expect(
            imported.filter(
                (name) => !name.startsWith('node:') && !name.startsWith('bun')
            )
        ).toEqual([])
    })
})
