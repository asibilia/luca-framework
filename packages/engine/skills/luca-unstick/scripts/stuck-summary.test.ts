import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import {
    engineRunning,
    formatSummary,
    KINDS_READ,
    openStuck,
    parseArgs,
    readRecords,
    registryEntry,
    replyOutcome,
    repoRuns,
    runState,
    type LooseRecord,
} from './stuck-summary'

import {
    GateTargetSchema,
    JOURNAL_KINDS,
} from '../../../src/journal/journal-record'
import type { JournalEntry } from '../../../src/journal/journal-record'
import {
    commentRead,
    gatesRun,
    implemented,
    intakePassed,
    practiceTicket,
    replyReceived,
    runBranchCreated,
    stepStarted,
    stuckReported,
    ticketPath,
    ticketRetried,
    ticketSkipped,
    ticketStuck,
    ticketWorktreeCreated,
    pullRequestOpened,
    testsSentBack,
    billingStopped,
} from '../../../src/testing/build-fixtures'
import {
    finalReviewRetried,
    finalReviewStuck,
    lensFinding,
    lensReviewed,
} from '../../../src/testing/final-review-fixtures'
import { recordsFrom } from '../../../src/testing/intake-fixtures'

/**
 * The `/luca-unstick` helper against journals built with the engine's own
 * fixtures, written to disk as the engine writes them, so the helper's loose
 * reading can't drift from the journal's real shape unseen.
 */

let dir = ''

beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'luca-unstick-'))
})

afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
})

/** Writes a run's journal to the runs folder and reads it back loosely. */
const writeRun = async ({
    run_id = 'run-1',
    entries,
    repo = '/repos/app',
}: {
    run_id?: string
    entries: JournalEntry[]
    repo?: string
}): Promise<LooseRecord[]> => {
    const records = recordsFrom({ entries }).map((record) =>
        record.kind === 'run_started'
            ? { ...record, content: { ...record.content, repo } }
            : record
    )
    await mkdir(join(dir, run_id), { recursive: true })
    const file = join(dir, run_id, 'journal.jsonl')
    await Bun.write(
        file,
        records.map((record) => JSON.stringify(record)).join('\n') + '\n'
    )
    return readRecords({ file })
}

const TICKETS = [
    practiceTicket({ number: 11, title: 'Add sum' }),
    practiceTicket({ number: 12, title: 'Add product' }),
]

/** Ticket #11 stuck on a bad test, reported on the spec. */
const stuckOnBadTest = (): JournalEntry[] => [
    ...intakePassed({ tickets: TICKETS }),
    runBranchCreated(),
    ticketWorktreeCreated({ ticket: 11 }),
    implemented({
        ticket: 11,
        outcome: 'bad_test',
        reason: 'It pins build addresses.',
    }),
    gatesRun({ ticket: 11, target: 'ticket', ok: false }),
    ticketStuck({ ticket: 11, reason: 'bad_test', detail: 'Sent back twice.' }),
    stuckReported({ ticket: 11 }),
]

describe('the helper reads only real journal kinds', () => {
    test('every kind it reads is a kind the journal has', () => {
        const known = new Set<string>(JOURNAL_KINDS)
        expect(KINDS_READ.filter((kind) => !known.has(kind))).toEqual([])
    })

    test('every snake_case word in its code is a kind it reads, or a known value', async () => {
        const source = await Bun.file(
            join(import.meta.dir, 'stuck-summary.ts')
        ).text()
        const words = [...source.matchAll(/'([a-z]+(?:_[a-z]+)+)'/g)].map(
            (match) => match[1] ?? ''
        )
        // A gate target, and the helper's own name for the final review.
        const values = new Set<string>([
            ...GateTargetSchema.options,
            'final_review',
        ])
        const read = new Set<string>(KINDS_READ)
        expect(words.length).toBeGreaterThan(20)
        expect(
            words.filter((word) => !read.has(word) && !values.has(word))
        ).toEqual([])
    })
})

describe('what waits on a reply', () => {
    test('a stuck ticket waits until it is retried', async () => {
        const records = await writeRun({ entries: stuckOnBadTest() })
        expect(openStuck({ records })).toMatchObject([
            { ticket: 11, what: 'ticket', reason: 'bad_test' },
        ])

        const retried = await writeRun({
            entries: [
                ...stuckOnBadTest(),
                commentRead({ comment_id: 200, body: 'retry #11' }),
                replyReceived({ word: 'retry', ticket: 11, comment_id: 200 }),
                ticketRetried({ ticket: 11, mode: 'resume' }),
            ],
        })
        expect(openStuck({ records: retried })).toEqual([])
    })

    test('a refused retry keeps the ticket stuck, with why', async () => {
        const records = await writeRun({
            entries: [
                ...stuckOnBadTest(),
                ticketRetried({ ticket: 11, mode: 'refused' }),
            ],
        })
        expect(openStuck({ records })).toMatchObject([
            { ticket: 11, refused: ['no criteria'] },
        ])
    })

    test('a skipped ticket no longer waits', async () => {
        const records = await writeRun({
            entries: [...stuckOnBadTest(), ticketSkipped({ ticket: 11 })],
        })
        expect(openStuck({ records })).toEqual([])
    })

    test('a stuck final review waits until it is retried', async () => {
        const stuck = [
            ...intakePassed({ tickets: TICKETS }),
            ...lensReviewed({
                lens: 'security',
                round: 4,
                findings: [
                    lensFinding({ id: 'security-1', title: 'Token in a log' }),
                ],
            }),
            finalReviewStuck({ reason: 'changes_requested' }),
        ]
        const records = await writeRun({ entries: stuck })
        expect(openStuck({ records })).toMatchObject([
            { ticket: null, what: 'final_review', reason: 'changes_requested' },
        ])
        expect(formatSummary({ run_id: 'run-1', records })).toContain(
            "security-lens's open findings"
        )
        expect(formatSummary({ run_id: 'run-1', records })).toContain(
            'Token in a log'
        )

        const retried = await writeRun({
            entries: [...stuck, finalReviewRetried()],
        })
        expect(openStuck({ records: retried })).toEqual([])
    })

    test('a run stuck on its budget waits for a bare retry', async () => {
        const stuck: JournalEntry[] = [
            ...intakePassed({ tickets: TICKETS }),
            {
                kind: 'run_stuck',
                ticket: null,
                role: null,
                content: { reason: 'run_budget', detail: '9M tokens used' },
            },
        ]
        expect(
            openStuck({ records: await writeRun({ entries: stuck }) })
        ).toMatchObject([{ what: 'run', reason: 'run_budget' }])
        const records = await writeRun({
            entries: [
                ...stuck,
                replyReceived({ word: 'retry', ticket: null, comment_id: 300 }),
            ],
        })
        expect(openStuck({ records })).toEqual([])
    })
})

describe('how the run stands', () => {
    test('an opened PR is over', async () => {
        const records = await writeRun({
            entries: [
                ...intakePassed({ tickets: TICKETS }),
                pullRequestOpened(),
            ],
        })
        expect(runState({ records })).toMatchObject({ over: true })
    })

    test('a billing stop is over for good', async () => {
        const records = await writeRun({
            entries: [
                ...intakePassed({ tickets: TICKETS }),
                billingStopped({ reason: 'overage in use' }),
            ],
        })
        const state = runState({ records })
        expect(state.over).toBe(true)
        expect(state.line).toContain('billing')
    })

    test('an intake refusal names what is missing', async () => {
        const records = await writeRun({
            entries: [
                ...intakePassed({ tickets: TICKETS }).slice(0, 1),
                {
                    kind: 'intake_refused',
                    ticket: null,
                    role: null,
                    content: {
                        problems: [
                            { ticket: 12, missing: ['Acceptance criteria'] },
                        ],
                    },
                },
            ],
        })
        expect(runState({ records })).toEqual({
            over: true,
            line: 'Intake refused it: #12 misses Acceptance criteria.',
        })
    })
})

describe('the summary', () => {
    test('it names the ticket, its reason, worktree, bad test, failed gates, and replies', async () => {
        const records = await writeRun({
            entries: [
                ...stuckOnBadTest(),
                commentRead({ comment_id: 200, body: 'looking into it' }),
            ],
        })
        const summary = formatSummary({
            run_id: 'run-1',
            records,
            running: true,
        })

        expect(summary).toContain('spec #10 "Practice spec"')
        expect(summary).toContain('(acme/app)')
        expect(summary).toContain('Spec owner: spec-owner')
        expect(summary).toContain('Ticket #11 "Add sum": bad_test')
        expect(summary).toContain('Sent back twice.')
        expect(summary).toContain(`Worktree: ${ticketPath(11)}`)
        expect(summary).toContain(
            'bad_test: src/sum.test.ts > sum adds two numbers'
        )
        expect(summary).toContain('It pins build addresses.')
        expect(summary).toContain('test `bun test` exit 1')
        expect(summary).toContain('stuck_reported: comment 111')
        expect(summary).toContain('comment_read by spec-owner: looking into it')
        expect(summary).toContain('running now')
    })

    test('it names the tests sent back after a rebase', async () => {
        const records = await writeRun({
            entries: [
                ...stuckOnBadTest(),
                testsSentBack({ ticket: 11, round: 2 }),
            ],
        })
        expect(formatSummary({ run_id: 'run-1', records })).toContain(
            'joined since: #12 Add product'
        )
    })

    test('with a ticket named, it leaves the other stuck tickets out', async () => {
        const records = await writeRun({
            entries: [
                ...stuckOnBadTest(),
                ticketStuck({ ticket: 12, reason: 'prepare_failed' }),
            ],
        })
        const summary = formatSummary({ run_id: 'run-1', records, ticket: 12 })
        expect(summary).toContain('Ticket #12 "Add product": prepare_failed')
        expect(summary).not.toContain('Ticket #11')
    })

    test('a crashed engine shows its log and the step it cut off', async () => {
        const records = await writeRun({
            entries: [
                ...intakePassed({ tickets: TICKETS }),
                stepStarted({ ticket: null, step: 'create_run_branch' }),
            ],
        })
        const summary = formatSummary({
            run_id: 'run-1',
            records,
            running: false,
            registry: {
                spec: 10,
                repo: '/repos/app',
                log_path: '/tmp/run-1.log',
                ended: {
                    ok: false,
                    message:
                        'The engine crashed: Directories cannot be read like files',
                },
                restarts: 0,
            },
            log_tail: '[luca-run] stopped: The engine crashed',
        })
        expect(summary).toContain('not running')
        expect(summary).toContain('The engine crashed: Directories')
        expect(summary).toContain('create_run_branch on run')
        expect(summary).toContain('[luca-run] stopped')
    })
})

describe('checking the engine took a reply', () => {
    test('waiting, then taken, then done once the ticket is retried', async () => {
        const before = await writeRun({ entries: stuckOnBadTest() })
        const after = before.at(-1)?.seq ?? 0
        expect(replyOutcome({ records: before, after }).status).toBe('waiting')

        const taken = await writeRun({
            entries: [
                ...stuckOnBadTest(),
                commentRead({ comment_id: 200, body: 'retry #11' }),
                replyReceived({ word: 'retry', ticket: 11, comment_id: 200 }),
            ],
        })
        expect(replyOutcome({ records: taken, after }).status).toBe('taken')

        const done = await writeRun({
            entries: [
                ...stuckOnBadTest(),
                commentRead({ comment_id: 200, body: 'retry #11' }),
                replyReceived({ word: 'retry', ticket: 11, comment_id: 200 }),
                ticketRetried({ ticket: 11, mode: 'resume' }),
            ],
        })
        const outcome = replyOutcome({ records: done, after })
        expect(outcome.status).toBe('done')
        expect(outcome.lines.join('\n')).toContain('ticket_retried #11: resume')
    })

    test('an ignored reply is done, with why', async () => {
        const records = await writeRun({
            entries: [
                ...stuckOnBadTest(),
                {
                    kind: 'reply_ignored',
                    ticket: null,
                    role: null,
                    content: {
                        comment_id: 200,
                        reason: 'no_ticket_named',
                        answer_id: 201,
                    },
                },
            ],
        })
        const outcome = replyOutcome({ records, after: 9 })
        expect(outcome.status).toBe('done')
        expect(outcome.lines.join('\n')).toContain(
            'reply_ignored: no_ticket_named'
        )
    })

    test('a stop is done once taken', async () => {
        const records = await writeRun({
            entries: [
                ...stuckOnBadTest(),
                replyReceived({ word: 'stop', ticket: null, comment_id: 200 }),
            ],
        })
        expect(replyOutcome({ records, after: 9 }).status).toBe('done')
    })
})

describe('finding the run', () => {
    test("the repo's runs, newest first, with what waits in each", async () => {
        await writeRun({ run_id: 'old', entries: stuckOnBadTest() })
        await writeRun({
            run_id: 'other-repo',
            entries: stuckOnBadTest(),
            repo: '/repos/other',
        })
        const runs = repoRuns({ runs_dir: dir, repo: '/repos/app' })
        expect(runs.map(({ run_id }) => run_id)).toEqual(['old'])
        expect(runs[0]).toMatchObject({ spec: 10, over: false, stuck: 1 })
    })

    test('the registry gives how the board saw the run end, never its token', async () => {
        const registry = join(dir, 'runs.json')
        await Bun.write(
            registry,
            JSON.stringify({
                version: 1,
                runs: [
                    {
                        run_id: 'run-1',
                        token: 'secret-token',
                        repo: '/repos/app',
                        spec: 10,
                        log_path: '/tmp/run-1.log',
                        ended: { ok: false, message: 'The engine crashed: x' },
                        restarts: 1,
                    },
                ],
            })
        )
        const entry = registryEntry({ registry, run_id: 'run-1' })
        expect(entry).toEqual({
            spec: 10,
            repo: '/repos/app',
            log_path: '/tmp/run-1.log',
            ended: { ok: false, message: 'The engine crashed: x' },
            restarts: 1,
        })
        expect(JSON.stringify(entry)).not.toContain('secret-token')
        expect(registryEntry({ registry, run_id: 'nope' })).toBeNull()
    })

    test('an engine is running when a command line names the run as a whole word', () => {
        const command_lines = [
            'bun luca-run.ts --resume run-10 --repo /x',
            'bun luca-run.ts --run-id=run-2',
        ]
        expect(engineRunning({ run_id: 'run-1', command_lines })).toBe(false)
        expect(engineRunning({ run_id: 'run-10', command_lines })).toBe(true)
        expect(engineRunning({ run_id: 'run-2', command_lines })).toBe(true)
        expect(engineRunning({ run_id: 'run-1', command_lines: null })).toBe(
            null
        )
    })

    test('the arguments: a run id, a ticket with or without #, and flags', () => {
        const args = parseArgs({
            argv: ['run-1', '#134', '--watch', '42'],
            env: {},
            home: '/home/me',
        })
        expect(args).toMatchObject({
            run_id: 'run-1',
            ticket: 134,
            watch: 42,
            runs_dir: '/home/me/.local/state/luca/runs',
            registry: '/home/me/.local/state/luca/board/runs.json',
        })
        expect(
            parseArgs({
                argv: ['139'],
                env: { LUCA_RUNS_DIR: '/runs', LUCA_BOARD_STATE_DIR: '/b' },
                home: '/home/me',
            })
        ).toMatchObject({
            run_id: null,
            ticket: 139,
            runs_dir: '/runs',
            registry: '/b/runs.json',
        })
    })
})
