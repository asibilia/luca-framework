import type { EngineRecord } from '../../shared/board-rpc'

/**
 * Small builders for journal records shaped like the engine's
 * (`packages/engine/src/journal/journal-record.ts`), for the board's tests.
 * They are written here on purpose: the plugin never imports the engine.
 */

/** A record before the journal stamps its `seq` and `time`. */
export type Entry = Omit<EngineRecord, 'seq' | 'time'>

const BASE_TIME = Date.parse('2026-09-23T12:00:00.000Z')

/**
 * Stamps entries with `seq` 1, 2, 3, ... (from `first_seq`) and a time one
 * second apart, the way the engine's journal does.
 */
export const stamp = ({
    entries,
    first_seq = 1,
}: {
    entries: Entry[]
    first_seq?: number
}): EngineRecord[] =>
    entries.map((entry, index) => ({
        ...entry,
        seq: first_seq + index,
        time: new Date(BASE_TIME + (first_seq + index) * 1000).toISOString(),
    }))

const entry = ({
    kind,
    content,
    ticket = null,
    role = null,
}: {
    kind: string
    content: unknown
    ticket?: number | null
    role?: string | null
}): Entry => ({ kind, content, ticket, role })

export const runStarted = ({ spec }: { spec: number }): Entry =>
    entry({
        kind: 'run_started',
        content: {
            spec_number: spec,
            base_branch: 'main',
            config: { checks: { test: 'bun test' } },
        },
    })

export const intakeRead = ({ spec }: { spec: number }): Entry =>
    entry({
        kind: 'intake_read',
        ticket: spec,
        content: { spec: { number: spec, title: 'Spec' }, sub_tickets: [] },
    })

export const intakeRefused = ({
    problems,
}: {
    problems: { ticket: number | null; missing: string[] }[]
}): Entry => entry({ kind: 'intake_refused', content: { problems } })

export const nothingToDo = (): Entry =>
    entry({ kind: 'nothing_to_do', content: { closed_tickets: [3, 4] } })

export const specSnapshot = ({
    spec,
    title,
    order,
}: {
    spec: number
    title: string
    order: number[]
}): Entry =>
    entry({
        kind: 'spec_snapshot',
        ticket: spec,
        content: {
            spec: {
                number: spec,
                title,
                body: '## Testing Decisions\n...',
                labels: [],
                url: `https://github.com/o/r/issues/${spec}`,
            },
            ticket_order: order,
            closed_tickets: [],
        },
    })

export const ticketSnapshot = ({
    number,
    title,
    blockers = [],
    labels = ['ready-for-agent'],
}: {
    number: number
    title: string
    blockers?: number[]
    labels?: string[]
}): Entry =>
    entry({
        kind: 'ticket_snapshot',
        ticket: number,
        content: {
            number,
            title,
            body: '## What to build\n...',
            labels,
            url: `https://github.com/o/r/issues/${number}`,
            criteria: [{ id: 'AC1', text: 'It works' }],
            blockers,
        },
    })

export const runBranchCreated = ({ branch }: { branch: string }): Entry =>
    entry({
        kind: 'run_branch_created',
        content: { branch, path: '/tmp/run', base_sha: 'abc123' },
    })

export const ticketWorktreeCreated = ({ ticket }: { ticket: number }): Entry =>
    entry({
        kind: 'ticket_worktree_created',
        ticket,
        content: {
            branch: `luca/${ticket}`,
            path: `/tmp/t${ticket}`,
            base_sha: 'abc123',
        },
    })

const testRun = ({ passed, failed }: { passed: number; failed: number }) => ({
    command: 'bun test',
    ok: failed === 0,
    exit_code: failed === 0 ? 0 : 1,
    no_test_files: false,
    cases: [
        ...Array.from({ length: passed }, (_, index) => ({
            file: 'a.test.ts',
            full_name: `passes ${index}`,
            status: 'passed',
        })),
        ...Array.from({ length: failed }, (_, index) => ({
            file: 'a.test.ts',
            full_name: `fails ${index}`,
            status: 'failed',
        })),
    ],
    files_without_results: [],
    output: '',
})

export const baselineTests = ({
    ticket,
    passed,
}: {
    ticket: number
    passed: number
}): Entry =>
    entry({
        kind: 'baseline_tests',
        ticket,
        content: testRun({ passed, failed: 0 }),
    })

export const agentStarted = ({
    ticket,
    role,
}: {
    ticket: number | null
    role: string
}): Entry =>
    entry({
        kind: 'agent_started',
        ticket,
        role,
        content: { role, prompt: `You are the ${role}.` },
    })

const RESULTS: Record<string, unknown> = {
    'test-writer': {
        outcome: 'tests_written',
        criteria: [{ criterion_id: 'AC1', tests: [] }],
        summary: '',
        assumptions: [],
        run_notes: [],
    },
    implementer: {
        outcome: 'done',
        bad_test: null,
        summary: '',
        assumptions: [],
        run_notes: [],
    },
    'ticket-reviewer': {
        verdict: 'approve',
        findings: [],
        summary: '',
        assumptions: [],
    },
}

export const agentFinished = ({
    ticket,
    role,
    result,
    usage,
}: {
    ticket: number | null
    role: string
    result?: unknown
    usage?: { total_tokens: number }
}): Entry =>
    entry({
        kind: 'agent_finished',
        ticket,
        role,
        content: {
            role,
            result: result ?? RESULTS[role],
            ...(usage ? { usage } : {}),
        },
    })

export const agentFailed = ({
    ticket,
    role,
    error,
}: {
    ticket: number
    role: string
    error: string
}): Entry =>
    entry({ kind: 'agent_failed', ticket, role, content: { role, error } })

export const redCheck = ({
    ticket,
    ok,
    failing,
    passing,
}: {
    ticket: number
    ok: boolean
    failing: number
    passing: number
}): Entry =>
    entry({
        kind: 'red_check',
        ticket,
        content: {
            ok,
            problems: ok ? [] : ['A new test passes before any code'],
            notes: [],
            tests: testRun({ passed: passing, failed: failing }),
        },
    })

export const leftoverScan = ({
    ticket,
    stage,
    hits = [],
}: {
    ticket: number
    stage: 'red' | 'green'
    hits?: { path: string; reason: string }[]
}): Entry => entry({ kind: 'leftover_scan', ticket, content: { stage, hits } })

export const commitMade = ({
    ticket,
    stage,
}: {
    ticket: number
    stage: 'red' | 'green'
}): Entry =>
    entry({
        kind: 'commit_made',
        ticket,
        content: {
            stage,
            sha: `${stage}-${ticket}`,
            message: `${stage} #${ticket}`,
            files: ['a.ts'],
        },
    })

export const gatesRun = ({
    ticket,
    ok,
    target = 'ticket',
}: {
    ticket: number
    ok: boolean
    target?: 'ticket' | 'run_branch'
}): Entry =>
    entry({
        kind: 'gates_run',
        ticket,
        content: {
            target,
            ok,
            checks: [
                {
                    name: 'test',
                    command: 'bun test',
                    ok,
                    exit_code: ok ? 0 : 1,
                    output: '',
                },
                {
                    name: 'types',
                    command: 'tsc',
                    ok: true,
                    exit_code: 0,
                    output: '',
                },
            ],
        },
    })

export const ticketJoined = ({ ticket }: { ticket: number }): Entry =>
    entry({
        kind: 'ticket_joined',
        ticket,
        content: { ok: true, shas: ['r1', 'g1'] },
    })

export const runBranchPushed = ({ ticket }: { ticket: number }): Entry =>
    entry({
        kind: 'run_branch_pushed',
        ticket,
        content: { branch: 'luca/run-10', sha: 'g1' },
    })

export const ticketStuck = ({
    ticket,
    reason,
    detail,
}: {
    ticket: number
    reason: string
    detail: string
}): Entry => entry({ kind: 'ticket_stuck', ticket, content: { reason, detail } })

export const pullRequestOpened = ({
    number,
    url,
}: {
    number: number
    url: string
}): Entry =>
    entry({
        kind: 'pull_request_opened',
        content: {
            number,
            url,
            head: 'luca/run-10',
            base: 'main',
            title: 'Spec',
            body: '',
        },
    })

export const usageReading = ({
    five_hour,
    weekly,
    resets_at,
}: {
    five_hour: number
    weekly: number
    resets_at?: string
}): Entry =>
    entry({
        kind: 'usage_reading',
        content: {
            five_hour_percent: five_hour,
            weekly_percent: weekly,
            ...(resets_at ? { resets_at } : {}),
        },
    })

export const limitWaitStarted = ({ resets_at }: { resets_at: string }): Entry =>
    entry({ kind: 'limit_wait_started', content: { resets_at } })

export const limitWaitEnded = (): Entry =>
    entry({ kind: 'limit_wait_ended', content: {} })

export const fixRound = ({
    ticket,
    loop,
    round,
}: {
    ticket: number
    loop: 'red_check' | 'gates' | 'review'
    round: number
}): Entry => entry({ kind: 'fix_round', ticket, content: { loop, round } })

export const reviewFinished = ({
    ticket,
    round,
    findings,
}: {
    ticket: number
    round: number
    findings: { blocker: number; should_fix: number; nit: number }
}): Entry =>
    entry({ kind: 'review_finished', ticket, content: { round, findings } })

export const replyReceived = ({
    word,
    ticket,
}: {
    word: 'retry' | 'skip' | 'stop' | 'ship'
    ticket: number | null
}): Entry =>
    entry({ kind: 'reply_received', ticket, content: { word, ticket } })

export const ticketSkipped = ({ ticket }: { ticket: number }): Entry =>
    entry({ kind: 'ticket_skipped', ticket, content: {} })

export const finalReviewStarted = (): Entry =>
    entry({ kind: 'final_review_started', content: {} })

export const lensStarted = ({ lens }: { lens: string }): Entry =>
    entry({ kind: 'lens_started', content: { lens } })

export const lensFinished = ({
    lens,
    findings,
}: {
    lens: string
    findings: { blocker: number; should_fix: number; nit: number }
}): Entry => entry({ kind: 'lens_finished', content: { lens, findings } })

export const finalReviewFixing = ({ round }: { round: number }): Entry =>
    entry({ kind: 'final_review_fixing', content: { round } })

export const finalReviewStuck = ({
    reason,
    detail,
}: {
    reason: string
    detail: string
}): Entry => entry({ kind: 'final_review_stuck', content: { reason, detail } })

export const finalReviewPassed = (): Entry =>
    entry({ kind: 'final_review_passed', content: {} })

/** Every step of one feature ticket, from its worktree to the push. */
export const wholeTicket = ({ ticket }: { ticket: number }): Entry[] => [
    ticketWorktreeCreated({ ticket }),
    baselineTests({ ticket, passed: 4 }),
    agentStarted({ ticket, role: 'test-writer' }),
    agentFinished({ ticket, role: 'test-writer' }),
    redCheck({ ticket, ok: true, failing: 2, passing: 4 }),
    leftoverScan({ ticket, stage: 'red' }),
    commitMade({ ticket, stage: 'red' }),
    agentStarted({ ticket, role: 'implementer' }),
    agentFinished({ ticket, role: 'implementer' }),
    gatesRun({ ticket, ok: true }),
    leftoverScan({ ticket, stage: 'green' }),
    commitMade({ ticket, stage: 'green' }),
    agentStarted({ ticket, role: 'ticket-reviewer' }),
    agentFinished({ ticket, role: 'ticket-reviewer' }),
    ticketJoined({ ticket }),
    gatesRun({ ticket, ok: true, target: 'run_branch' }),
    runBranchPushed({ ticket }),
]

/** Intake that passes on spec 10 with tickets 11, 12 (waits on 11), 13. */
export const intakeOfThree = (): Entry[] => [
    runStarted({ spec: 10 }),
    intakeRead({ spec: 10 }),
    specSnapshot({ spec: 10, title: 'Add CSV export', order: [11, 12, 13] }),
    ticketSnapshot({
        number: 11,
        title: 'Rename the report module',
        labels: ['ready-for-agent', 'refactor'],
    }),
    ticketSnapshot({ number: 12, title: 'Export rows', blockers: [11] }),
    ticketSnapshot({ number: 13, title: 'Add the menu item' }),
    runBranchCreated({ branch: 'luca/run-10' }),
]
