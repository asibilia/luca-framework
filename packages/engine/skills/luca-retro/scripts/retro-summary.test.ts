import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import {
    durationText,
    formatRepeats,
    formatRunSummary,
    isFinished,
    KINDS_READ,
    newestFinished,
    parseArgs,
    readRecords,
    repeatsAcross,
    repoRuns,
    stepTimes,
    summarizeJournal,
    tokensText,
    type LooseRecord,
} from './retro-summary'

import { FindingResponseSchema } from '../../../src/agents/role-results'
import {
    GateTargetSchema,
    JOURNAL_KINDS,
    RunStuckReasonSchema,
    StuckReasonSchema,
} from '../../../src/journal/journal-record'
import type { JournalEntry } from '../../../src/journal/journal-record'
import {
    agentFailed,
    agentSession,
    implemented,
    intakePassed,
    joinClashed,
    joined,
    leftoverScan,
    practiceTicket,
    pullRequestOpened,
    replyReceived,
    reviewed,
    stepEnded,
    stepStarted,
    testsSentBack,
    ticketRebased,
    ticketStuck,
} from '../../../src/testing/build-fixtures'
import { recordsFrom } from '../../../src/testing/intake-fixtures'

/**
 * The `/luca-retro` helper against journals built with the engine's own
 * fixtures, written to disk as the engine writes them, so the helper's loose
 * reading can't drift from the journal's real shape unseen.
 */

let dir = ''

beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'luca-retro-'))
})

afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
})

/** When the fixture runs start; record n is n minutes after. */
const START = Date.parse('2026-01-01T00:00:00.000Z')

/**
 * Writes a run's journal to the runs folder and reads it back loosely.
 * Record n is stamped n minutes after `start`, so steps take time.
 */
const writeRun = async ({
    run_id = 'run-1',
    entries,
    repo = '/repos/app',
    start = START,
}: {
    run_id?: string
    entries: JournalEntry[]
    repo?: string
    start?: number
}): Promise<LooseRecord[]> => {
    const records = recordsFrom({ entries }).map((record) => ({
        ...(record.kind === 'run_started'
            ? { ...record, content: { ...record.content, repo } }
            : record),
        time: new Date(start + record.seq * 60_000).toISOString(),
    }))
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

const MAX_TURNS =
    "The agent's turn ended with error_max_turns: Reached maximum number of turns (120)"

const NO_SESSION = 'No open agent session s-1: it closed or never started.'

const AN_ADR = 'docs/adr/0023-a-decision.md'

/** A gate whose test check failed on `tests`, as bun test prints them. */
const testsFailed = ({
    ticket,
    tests,
}: {
    ticket: number | null
    tests: string[]
}): JournalEntry => ({
    kind: 'gates_run',
    ticket,
    role: null,
    content: {
        target: 'ticket',
        ok: false,
        checks: [
            {
                name: 'test',
                command: 'bun test',
                ok: false,
                exit_code: 1,
                // Bun prints each failure as it goes, then again at the end.
                output: [
                    ...tests.map((name) => `(fail) ${name} [0.40ms]`),
                    '',
                    `${tests.length} tests failed:`,
                    ...tests.map((name) => `(fail) ${name} [0.40ms]`),
                ].join('\n'),
            },
        ],
    },
})

const jevMissedKey = ({ asked_seq }: { asked_seq: number }): JournalEntry[] => [
    {
        kind: 'jev_asked',
        ticket: 11,
        role: null,
        content: {
            job: 'agent_skills',
            request: { state: {}, questions: {} },
            fixed: {},
        },
    },
    {
        kind: 'jev_failed',
        ticket: 11,
        role: null,
        content: {
            job: 'agent_skills',
            asked_seq,
            reason: 'missing_key',
            error: 'TYPESAFE_API_KEY is not set.',
            ms: 1,
        },
    },
]

const NOTES = {
    assumption: 'The sum lives in src/sum.ts.',
    declined: 'It needs a new module the test-writer may not write.',
}

/**
 * A finished run that went wrong in every way the helper looks for. Its
 * seqs are fixed: `seqOf` finds them.
 */
const messyRun = (): JournalEntry[] => [
    ...intakePassed({ tickets: TICKETS }),
    stepStarted({ ticket: 11, step: 'launch_agent:implementer' }),
    agentFailed({
        ticket: 11,
        role: 'implementer',
        failure: 'agent',
        error: MAX_TURNS,
    }),
    stepEnded({ ticket: 11, step: 'launch_agent:implementer' }),
    agentFailed({
        ticket: 11,
        role: 'test-writer',
        failure: 'engine',
        error: NO_SESSION,
    }),
    agentFailed({
        ticket: 12,
        role: 'implementer',
        failure: 'guard',
        error: 'It wrote report.md.',
    }),
    ...jevMissedKey({ asked_seq: 9 }),
    ...jevMissedKey({ asked_seq: 11 }),
    implemented({ ticket: 11, assumptions: [NOTES.assumption] }),
    leftoverScan({
        ticket: 11,
        stage: 'green',
        hits: [
            {
                path: AN_ADR,
                reason: 'a new markdown file the spec and ticket do not name',
            },
        ],
    }),
    ticketStuck({
        ticket: 11,
        reason: 'leftovers_found',
        detail: `${AN_ADR}: a new markdown file`,
    }),
    replyReceived({ word: 'retry', ticket: 11, comment_id: 1 }),
    testsFailed({
        ticket: 11,
        tests: ['sum > adds two numbers', 'sum > (unnamed)'],
    }),
    testsFailed({ ticket: 12, tests: ['sum > adds two numbers'] }),
    {
        kind: 'gates_run',
        ticket: 12,
        role: null,
        content: {
            target: 'run_branch',
            ok: false,
            checks: [
                {
                    name: 'prepare',
                    command: 'make',
                    ok: false,
                    exit_code: null,
                    output: '',
                },
            ],
        },
    },
    ticketStuck({
        ticket: 12,
        reason: 'gates_failed',
        detail: 'The gates still fail after 3 fix rounds:\ntest failed',
    }),
    {
        kind: 'agent_finished',
        ticket: 12,
        role: 'implementer',
        content: {
            role: 'implementer',
            result: {
                outcome: 'needs_setup_change',
                setup_change: {
                    file: 'test/setup.ts',
                    reason: 'It needs a fake clock.',
                },
            },
        },
    },
    joined({ ticket: 11 }),
    joinClashed({ ticket: 12 }),
    ticketRebased({ ticket: 12, cause: 'clash' }),
    testsSentBack({ ticket: 12 }),
    {
        kind: 'join_undone',
        ticket: 12,
        role: null,
        content: { shas: ['a', 'b'] },
    },
    {
        kind: 'run_stuck',
        ticket: null,
        role: null,
        content: {
            reason: 'run_budget',
            detail: 'The run used 9,100,000 tokens.',
        },
    },
    replyReceived({ word: 'retry', ticket: null, comment_id: 2 }),
    {
        kind: 'reply_ignored',
        ticket: null,
        role: null,
        content: { comment_id: 3, reason: 'not_stuck', answer_id: 4 },
    },
    implemented({
        ticket: 12,
        finding_responses: [
            FindingResponseSchema.parse({
                finding_id: 'F1',
                response: 'wont_fix',
                reason: NOTES.declined,
            }),
        ],
    }),
    reviewed({
        ticket: 12,
        rulings: [{ finding_id: 'F1', ruling: 'accepted', reason: 'Fair.' }],
    }),
    agentSession({ ticket: 11, role: 'implementer', output_tokens: 1000 }),
    {
        kind: 'usage_recorded',
        ticket: 11,
        role: null,
        content: {
            scope: 'ticket',
            ticket: 11,
            agent_turns: 2,
            tokens: {
                input_tokens: 10,
                output_tokens: 1000,
                cache_read_input_tokens: 5000,
                cache_creation_input_tokens: 0,
            },
            windows: {},
        },
    },
    {
        kind: 'usage_recorded',
        ticket: null,
        role: null,
        content: {
            scope: 'run',
            ticket: null,
            agent_turns: 3,
            tokens: {
                input_tokens: 100,
                output_tokens: 2000,
                cache_read_input_tokens: 9000,
                cache_creation_input_tokens: 900,
            },
            windows: {},
        },
    },
    pullRequestOpened(),
]

describe('the helper reads only real journal kinds', () => {
    test('every kind it reads is a kind the journal has', () => {
        const known = new Set<string>(JOURNAL_KINDS)
        expect(KINDS_READ.filter((kind) => !known.has(kind))).toEqual([])
    })

    test('every snake_case word in its code is a kind it reads, or a known value', async () => {
        const source = await Bun.file(
            join(import.meta.dir, 'retro-summary.ts')
        ).text()
        const words = [...source.matchAll(/'([a-z]+(?:_[a-z]+)+)'/g)].map(
            (match) => match[1] ?? ''
        )
        const values = new Set<string>([
            ...GateTargetSchema.options,
            ...StuckReasonSchema.options,
            ...RunStuckReasonSchema.options,
            ...FindingResponseSchema.shape.response.options,
            // The SDK's result for an agent out of turns, in its error text.
            'error_max_turns',
        ])
        const read = new Set<string>(KINDS_READ)
        expect(words.length).toBeGreaterThan(20)
        expect(
            words.filter((word) => !read.has(word) && !values.has(word))
        ).toEqual([])
    })
})

describe('summing up a run', () => {
    /** The seq of the first record of `kind` that `where` picks. */
    const seqOf = (
        records: LooseRecord[],
        kind: string,
        where: (record: LooseRecord) => boolean = () => true
    ): number =>
        records.find((record) => record.kind === kind && where(record))?.seq ??
        -1

    test('the header: spec, repo, how it ended, its tickets', async () => {
        const records = await writeRun({ entries: messyRun() })
        const summary = summarizeJournal({ records })
        expect(summary).toMatchObject({
            spec: { number: 10, title: 'Practice spec' },
            repo: '/repos/app',
            over: true,
        })
        expect(summary.tickets.size).toBe(2)
        const text = formatRunSummary({ run_id: 'run-1', summary })
        expect(text).toContain('== Run run-1: spec #10 "Practice spec"')
        expect(text).toContain('Repo: /repos/app (acme/app)')
        expect(text).toContain(
            `Ended: opened PR #99 https://github.com/acme/app/pull/99 (#${seqOf(records, 'pull_request_opened')})`
        )
    })

    test('what got stuck, the reply to it, and fix loops at their cap', async () => {
        const records = await writeRun({ entries: messyRun() })
        const { stuck } = summarizeJournal({ records })
        const leftover = seqOf(records, 'ticket_stuck')
        expect(stuck).toMatchObject([
            {
                seq: leftover,
                ticket: 11,
                reason: 'leftovers_found',
                cap: null,
                reply: { word: 'retry', seq: leftover + 1, wait_ms: 60_000 },
            },
            {
                ticket: 12,
                reason: 'gates_failed',
                cap: '3 fix rounds',
                reply: null,
            },
            {
                kind: 'run_stuck',
                ticket: null,
                reason: 'run_budget',
                reply: { word: 'retry' },
            },
        ])
        const text = formatRunSummary({
            run_id: 'run-1',
            summary: summarizeJournal({ records }),
        })
        expect(text).toContain(
            `#${leftover} ticket_stuck #11 "Add sum": leftovers_found -> retry (#${leftover + 1}, after 1m 00s)`
        )
        expect(text).toContain('Fix loops that hit their cap:')
        expect(text).toMatch(/#\d+ #12 gates_failed after 3 fix rounds/)
        expect(text).toContain('run_stuck run: run_budget -> retry')
    })

    test('leftover scan hits, by path', async () => {
        const records = await writeRun({ entries: messyRun() })
        const { leftovers } = summarizeJournal({ records })
        expect(leftovers.scans).toBe(1)
        expect(leftovers.by_path).toEqual([
            { key: AN_ADR, count: 1, seqs: [seqOf(records, 'leftover_scan')] },
        ])
    })

    test('agents out of turns, lost sessions, and other failed turns', async () => {
        const records = await writeRun({ entries: messyRun() })
        const summary = summarizeJournal({ records })
        expect(summary.out_of_turns).toMatchObject([
            { ticket: 11, role: 'implementer', text: '120' },
        ])
        expect(summary.no_session).toMatchObject([
            { ticket: 11, role: 'test-writer' },
        ])
        expect(summary.other_failures).toMatchObject([
            { ticket: 12, text: 'guard: It wrote report.md.' },
        ])
        const text = formatRunSummary({ run_id: 'run-1', summary })
        expect(text).toContain('#11 implementer: max 120 turns')
        expect(text).toContain('"No open agent session" (1)')
    })

    test('Jev calls that failed, grouped by reason', async () => {
        const records = await writeRun({ entries: messyRun() })
        const { jev } = summarizeJournal({ records })
        expect(jev.asked).toBe(2)
        expect(jev.failed).toMatchObject([
            { key: 'missing_key: TYPESAFE_API_KEY is not set.', count: 2 },
        ])
        expect(jev.jobs).toMatchObject([{ key: 'agent_skills', count: 2 }])
    })

    test('failing checks, and the tests that failed again and again', async () => {
        const records = await writeRun({ entries: messyRun() })
        const { gates } = summarizeJournal({ records })
        expect(gates.failed).toBe(3)
        expect(gates.by_check).toMatchObject([
            { key: 'test', count: 2 },
            { key: 'prepare (timed out)', count: 1 },
        ])
        // Bun prints a failure twice; it counts once per gate.
        expect(gates.by_test).toMatchObject([
            { key: 'sum > adds two numbers', count: 2 },
            { key: 'sum > (unnamed)', count: 1 },
        ])
    })

    test('setup changes agents asked for', async () => {
        const records = await writeRun({ entries: messyRun() })
        expect(summarizeJournal({ records }).setup_changes).toMatchObject([
            {
                ticket: 12,
                role: 'implementer',
                text: 'test/setup.ts: It needs a fake clock.',
            },
        ])
    })

    test('joins that clashed, rebases, undone joins, and tests sent back', async () => {
        const records = await writeRun({ entries: messyRun() })
        const { joins } = summarizeJournal({ records })
        expect(joins.ok).toBe(1)
        expect(joins.failed).toEqual([
            {
                seq: seqOf(
                    records,
                    'ticket_joined',
                    ({ content }) => content.ok === false
                ),
                ticket: 12,
            },
        ])
        expect(joins.rebases).toMatchObject([{ key: 'clash', count: 1 }])
        expect(joins.undone).toMatchObject([{ ticket: 12, shas: 2 }])
        expect(joins.tests_sent_back).toMatchObject([
            {
                ticket: 12,
                text: 'round 1: src/sum.test.ts > sum adds two numbers',
            },
        ])
    })

    test('replies, and the replies the engine ignored', async () => {
        const records = await writeRun({ entries: messyRun() })
        const { replies } = summarizeJournal({ records })
        expect(replies.words).toMatchObject([{ key: 'retry', count: 2 }])
        expect(replies.ignored).toMatchObject([{ key: 'not_stuck', count: 1 }])
    })

    test("the agents' assumptions, and the findings fixers declined", async () => {
        const records = await writeRun({ entries: messyRun() })
        const summary = summarizeJournal({ records })
        expect(summary.assumptions).toMatchObject({
            total: 1,
            by_role: [{ key: 'implementer', count: 1 }],
            notes: [{ ticket: 11, text: NOTES.assumption }],
        })
        expect(summary.declined.wont_fix).toMatchObject([
            { ticket: 12, role: 'implementer', text: `F1: ${NOTES.declined}` },
        ])
        expect(summary.declined.accepted).toMatchObject([
            { ticket: 12, role: 'ticket-reviewer', text: 'F1: Fair.' },
        ])
    })

    test('tokens, as the run budget counts them', async () => {
        const records = await writeRun({ entries: messyRun() })
        const { usage } = summarizeJournal({ records })
        expect(usage.agent_turns).toBe(3)
        expect(usage.by_ticket).toEqual([{ ticket: 11, counted: 1010 }])
        expect(usage.by_role).toMatchObject([
            { role: 'implementer', sessions: 1, counted: 1010 },
        ])
        const text = formatRunSummary({
            run_id: 'run-1',
            summary: summarizeJournal({ records }),
        })
        expect(text).toContain('run: 3k counted, 9k cache reads, 3 agent turns')
    })

    test('slow steps: from a step_started to the step_ended with its key', async () => {
        const records = await writeRun({
            entries: [
                ...intakePassed({ tickets: TICKETS }),
                stepStarted({ ticket: 11, step: 'run_gates' }),
                stepStarted({ ticket: 12, step: 'run_gates' }),
                stepEnded({ ticket: 12, step: 'run_gates' }),
                stepEnded({ ticket: 11, step: 'run_gates' }),
                // Cut off by a crash: it never ended, so it doesn't count.
                stepStarted({ ticket: 11, step: 'launch_agent:implementer' }),
            ],
        })
        expect(stepTimes({ records })).toEqual([
            {
                step: 'run_gates',
                count: 2,
                total_ms: 4 * 60_000,
                max_ms: 3 * 60_000,
                max_seq: seqOf(records, 'step_started'),
                max_ticket: 11,
            },
        ])
    })

    test('a run with no PR, stop, or refusal is not finished', async () => {
        const records = await writeRun({
            entries: [
                ...intakePassed({ tickets: TICKETS }),
                joined({ ticket: 11 }),
            ],
        })
        expect(isFinished({ records })).toBe(false)
        expect(
            formatRunSummary({
                run_id: 'run-1',
                summary: summarizeJournal({ records }),
            })
        ).toContain('Ended: not over yet')
    })
})

describe('several runs', () => {
    test('the patterns two runs share, and not the ones only one has', async () => {
        const first = await writeRun({ run_id: 'run-1', entries: messyRun() })
        const second = await writeRun({
            run_id: 'run-2',
            entries: [
                ...intakePassed({ tickets: TICKETS }),
                ...jevMissedKey({ asked_seq: 4 }),
                leftoverScan({
                    ticket: 12,
                    stage: 'green',
                    hits: [
                        {
                            path: 'docs/adr/0024-another.md',
                            reason: 'a new markdown file the spec and ticket do not name',
                        },
                    ],
                }),
                ticketStuck({ ticket: 12, reason: 'leftovers_found' }),
                pullRequestOpened(),
            ],
        })
        const repeats = repeatsAcross({
            runs: [
                {
                    run_id: 'run-1',
                    summary: summarizeJournal({ records: first }),
                },
                {
                    run_id: 'run-2',
                    summary: summarizeJournal({ records: second }),
                },
            ],
        })
        const keys = repeats.map(({ key }) => key)
        expect(keys).toContain('stuck: leftovers_found')
        expect(keys).toContain('leftover in folder: docs/adr/')
        expect(keys).toContain(
            'jev_failed missing_key: TYPESAFE_API_KEY is not set.'
        )
        expect(keys).not.toContain('stuck: run_budget')
        expect(
            repeats.find(({ key }) => key === 'stuck: leftovers_found')?.runs
        ).toEqual([
            { run_id: 'run-1', count: 1 },
            { run_id: 'run-2', count: 1 },
        ])
        expect(formatRepeats({ repeats })).toContain(
            'stuck: leftovers_found: run-1 ×1, run-2 ×1'
        )
        expect(formatRepeats({ repeats: [] })).toContain('none')
    })
})

describe('finding the run', () => {
    test('with no id, the newest finished run of the repo, from any of its checkouts', async () => {
        const finished = [
            ...intakePassed({ tickets: TICKETS }),
            pullRequestOpened(),
        ]
        await writeRun({ run_id: 'old', entries: finished })
        await writeRun({
            run_id: 'newer',
            entries: finished,
            start: START + 3_600_000,
        })
        await writeRun({
            run_id: 'newest-going',
            entries: intakePassed({ tickets: TICKETS }),
            start: START + 7_200_000,
        })
        await writeRun({
            run_id: 'other-repo',
            entries: finished,
            repo: '/repos/other',
            start: START + 9_000_000,
        })
        const runs = repoRuns({
            runs_dir: dir,
            repos: ['/worktrees/x', '/repos/app'],
        })
        expect(runs.map(({ run_id }) => run_id)).toEqual([
            'newest-going',
            'newer',
            'old',
        ])
        expect(newestFinished({ runs })?.run_id).toBe('newer')
        expect(newestFinished({ runs: runs.slice(0, 1) })).toBeNull()
        expect(
            repoRuns({ runs_dir: join(dir, 'nope'), repos: ['/repos/app'] })
        ).toEqual([])
    })

    test('the arguments: any number of run ids, and flags', () => {
        expect(
            parseArgs({
                argv: ['run-1', 'run-2', '--repo', '/r'],
                env: {},
                home: '/home/me',
            })
        ).toEqual({
            run_ids: ['run-1', 'run-2'],
            repo: '/r',
            runs_dir: '/home/me/.local/state/luca/runs',
        })
        expect(
            parseArgs({
                argv: [],
                env: { LUCA_RUNS_DIR: '/runs' },
                home: '/home/me',
            })
        ).toEqual({ run_ids: [], repo: null, runs_dir: '/runs' })
    })

    test('durations and token counts read short', () => {
        expect(durationText(3_725_000)).toBe('1h 02m')
        expect(durationText(245_000)).toBe('4m 05s')
        expect(durationText(12_000)).toBe('12s')
        expect(tokensText(9_476_629)).toBe('9.48M')
        expect(tokensText(820_400)).toBe('820k')
        expect(tokensText(512)).toBe('512')
    })
})
