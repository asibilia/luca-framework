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

/**
 * The engine's install in a new worktree: a ticket's, or with no `ticket`,
 * the run branch's checkout.
 */
export const dependenciesInstalled = ({
    ticket,
    ok,
}: {
    ticket?: number
    ok: boolean
}): Entry =>
    entry({
        kind: 'dependencies_installed',
        ticket: ticket ?? null,
        content: {
            target: ticket === undefined ? 'run_branch' : 'ticket',
            check: {
                name: 'install',
                command: 'bun install --frozen-lockfile',
                ok,
                exit_code: ok ? 0 : 1,
                output: ok ? '' : 'error: lockfile had changes',
            },
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

/** A launch, or with `follow_up_of`, a follow-up in that session. */
export const agentStarted = ({
    ticket,
    role,
    follow_up_of = null,
}: {
    ticket: number | null
    role: string
    follow_up_of?: string | null
}): Entry =>
    entry({
        kind: 'agent_started',
        ticket,
        role,
        content: {
            role,
            prompt:
                follow_up_of === null
                    ? `You are the ${role}.`
                    : 'The check failed. Fix it.',
            follow_up_of,
        },
    })

/** The session id a role's agent on a ticket runs in, in these fixtures. */
export const sessionOf = ({
    ticket,
    role,
}: {
    ticket: number
    role: string
}): string => `session-${role}-${ticket}`

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
}: {
    ticket: number
    role: string
    result?: unknown
}): Entry =>
    entry({
        kind: 'agent_finished',
        ticket,
        role,
        content: {
            role,
            result: result ?? RESULTS[role],
            session_id: sessionOf({ ticket, role }),
        },
    })

export const agentFailed = ({
    ticket,
    role,
    error,
    failure = 'agent',
}: {
    ticket: number
    role: string
    error: string
    failure?: 'agent' | 'result' | 'guard' | 'engine'
}): Entry =>
    entry({
        kind: 'agent_failed',
        ticket,
        role,
        content: {
            role,
            error,
            failure,
            session_id:
                failure === 'engine' ? null : sessionOf({ ticket, role }),
        },
    })

/**
 * One `rate_limit_event`'s info as the Claude Agent SDK sends it:
 * utilization from 0 to 1, resetsAt in seconds.
 */
export const rateLimit = ({
    type,
    utilization,
    resets_at,
}: {
    type: string
    utilization: number
    resets_at?: string
}) => ({
    status: 'allowed',
    rateLimitType: type,
    utilization,
    ...(resets_at ? { resetsAt: Date.parse(resets_at) / 1000 } : {}),
    isUsingOverage: false,
})

/**
 * A reading as a real run journals it: no top-level utilization, one entry
 * per window in `unifiedWindows` (utilization 0 to 1, resetsAt in seconds).
 */
export const unifiedRateLimit = ({
    windows,
}: {
    windows: Record<string, { utilization: number; resets_at?: string }>
}) => ({
    status: 'allowed',
    resetsAt: 1790179800,
    rateLimitType: 'five_hour',
    overageStatus: 'rejected',
    overageDisabledReason: 'org_level_disabled',
    isUsingOverage: false,
    unifiedWindows: Object.fromEntries(
        Object.entries(windows).map(([name, { utilization, resets_at }]) => [
            name,
            {
                utilization,
                ...(resets_at
                    ? { resetsAt: Date.parse(resets_at) / 1000 }
                    : {}),
            },
        ])
    ),
})

/** The launcher's summary of one agent turn's session. */
export const agentSession = ({
    ticket,
    role,
    input = 0,
    output = 0,
    cache_read = 0,
    cache_creation = 0,
    rate_limits = [],
}: {
    ticket: number
    role: string
    input?: number
    output?: number
    cache_read?: number
    cache_creation?: number
    rate_limits?: (
        | ReturnType<typeof rateLimit>
        | ReturnType<typeof unifiedRateLimit>
    )[]
}): Entry =>
    entry({
        kind: 'agent_session',
        ticket,
        role,
        content: {
            role,
            session: {
                session_id: sessionOf({ ticket, role }),
                model: 'claude-opus-5-5',
                claude_code_version: '2.9.0',
                api_key_source: 'none',
                subscription_type: 'max',
                num_turns: 7,
                duration_ms: 12_000,
                usage: {
                    input_tokens: input,
                    output_tokens: output,
                    cache_read_input_tokens: cache_read,
                    cache_creation_input_tokens: cache_creation,
                },
                total_cost_usd: 0.12,
                permission_denials: [],
                guard_denials: [],
                rate_limit_events: rate_limits,
            },
        },
    })

export const runStopped = ({
    ticket,
    role,
    reason,
    billing = false,
}: {
    ticket: number | null
    role: string | null
    reason: string
    billing?: boolean
}): Entry =>
    entry({
        kind: 'run_stopped',
        ticket,
        role,
        content: { reason, role, billing },
    })

export const worktreeReset = ({ ticket }: { ticket: number }): Entry =>
    entry({ kind: 'worktree_reset', ticket, content: { sha: `red-${ticket}` } })

const JEV_REQUEST = {
    state: { ticket: '#11 Add sum' },
    questions: {
        model: {
            type: 'choice',
            instructions: 'Which model should build this ticket?',
            criteria: { 'claude-opus-5-5': null, 'claude-sonnet-5': null },
        },
    },
}

export const jevAsked = ({ ticket }: { ticket: number | null }): Entry =>
    entry({
        kind: 'jev_asked',
        ticket,
        content: {
            job: 'ticket_model',
            request: JEV_REQUEST,
            fixed: { model: 'claude-opus-5-5' },
        },
    })

export const jevAnswered = ({
    ticket,
    asked_seq,
}: {
    ticket: number | null
    asked_seq: number
}): Entry =>
    entry({
        kind: 'jev_answered',
        ticket,
        content: {
            job: 'ticket_model',
            asked_seq,
            answers: {
                model: {
                    value: 'claude-sonnet-5',
                    confidence: 0.7,
                    raw: { choice: 'claude-sonnet-5', confidence: 0.7 },
                },
            },
            ms: 420,
        },
    })

export const jevFailed = ({
    ticket,
    asked_seq,
}: {
    ticket: number | null
    asked_seq: number
}): Entry =>
    entry({
        kind: 'jev_failed',
        ticket,
        content: {
            job: 'ticket_model',
            asked_seq,
            reason: 'missing_key',
            error: 'No TYPESAFE_API_KEY is set.',
            ms: 0,
        },
    })

/** An address, as the engine writes it: `<role>#<ticket>`. */
const address = ({ role, ticket }: { role: string; ticket: number }) =>
    `${role}#${ticket}`

export const agentMessage = ({
    ticket,
    role,
    id,
    to,
    text,
    status = 'queued',
    reason = null,
}: {
    ticket: number
    role: string
    id: string
    to: string
    text: string
    status?: 'queued' | 'not_delivered' | 'refused'
    reason?: string | null
}): Entry =>
    entry({
        kind: 'agent_message',
        ticket,
        role,
        content: {
            id,
            from: address({ role, ticket }),
            to,
            text,
            status,
            recipients: status === 'queued' ? [to] : [],
            reason,
        },
    })

export const agentMessageDelivered = ({
    ticket,
    role,
    ids,
}: {
    ticket: number
    role: string
    ids: string[]
}): Entry =>
    entry({
        kind: 'agent_message_delivered',
        ticket,
        role,
        content: {
            to: address({ role, ticket }),
            ids,
            tool_name: 'Edit',
            text: 'A message from another agent: ...',
        },
    })

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
    stage: 'red' | 'green' | 'fix'
    hits?: { path: string; reason: string }[]
}): Entry => entry({ kind: 'leftover_scan', ticket, content: { stage, hits } })

export const commitMade = ({
    ticket,
    stage,
}: {
    ticket: number
    stage: 'red' | 'green' | 'fix'
}): Entry =>
    entry({
        kind: 'commit_made',
        ticket,
        content: {
            stage,
            sha: `${stage}-${ticket}`,
            message: `${stage} #${ticket}`,
            files: stage === 'fix' ? [] : ['a.ts'],
        },
    })

/** One ticket-review finding, as the ticket-reviewer reports it. */
export type Finding = {
    id: string
    severity: 'blocker' | 'should_fix' | 'nit'
    kind: 'code' | 'test'
    file: string | null
    title: string
    detail: string
}

export const finding = ({
    id,
    severity,
    kind = 'code',
}: {
    id: string
    severity: Finding['severity']
    kind?: Finding['kind']
}): Finding => ({
    id,
    severity,
    kind,
    file: kind === 'test' ? 'src/a.test.ts' : 'src/a.ts',
    title: `Finding ${id}`,
    detail: `The detail of ${id}.`,
})

/** A re-reviewer's ruling on a fixer's "won't fix". */
export type Ruling = {
    finding_id: string
    ruling: 'accepted' | 'rejected'
    reason: string
}

/**
 * The ticket-reviewer's result: `changes_requested` exactly when some
 * finding is a blocker or a should-fix.
 */
export const reviewFinished = ({
    ticket,
    findings = [],
    rulings = [],
}: {
    ticket: number
    findings?: Finding[]
    rulings?: Ruling[]
}): Entry =>
    agentFinished({
        ticket,
        role: 'ticket-reviewer',
        result: {
            verdict: findings.some(({ severity }) => severity !== 'nit')
                ? 'changes_requested'
                : 'approve',
            findings,
            rulings,
            summary: '',
            assumptions: [],
        },
    })

/** A fixer's answer to one review finding. */
export type FindingResponse = {
    finding_id: string
    response: 'fixed' | 'wont_fix'
    reason: string
}

/** A review fixer's (test-writer or implementer) result. */
export const fixerFinished = ({
    ticket,
    role,
    responses,
}: {
    ticket: number
    role: 'test-writer' | 'implementer'
    responses: FindingResponse[]
}): Entry =>
    agentFinished({
        ticket,
        role,
        result: {
            ...(RESULTS[role] as Record<string, unknown>),
            finding_responses: responses,
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

export const joinClashed = ({ ticket }: { ticket: number }): Entry =>
    entry({
        kind: 'ticket_joined',
        ticket,
        content: { ok: false, error: 'CONFLICT (content): src/index.ts' },
    })

export const ticketRebased = ({
    ticket,
    cause,
    tests = [],
    code = [],
}: {
    ticket: number
    cause: 'clash' | 'join_gates'
    tests?: string[]
    code?: string[]
}): Entry =>
    entry({
        kind: 'ticket_rebased',
        ticket,
        content: { cause, base_sha: 'onto', tests, code, undone: [] },
    })

export const worktreesRemoved = ({ paths }: { paths: string[] }): Entry =>
    entry({ kind: 'worktrees_removed', content: { paths } })

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
}): Entry =>
    entry({ kind: 'ticket_stuck', ticket, content: { reason, detail } })

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

export const limitWaitStarted = ({
    resets_at,
    until = resets_at ?? '2026-09-23T17:05:00.000Z',
    rate_limit_type = 'five_hour',
    hit_ticket = 11,
    hit_role = 'implementer',
}: {
    resets_at: string | null
    until?: string
    rate_limit_type?: string | null
    hit_ticket?: number | null
    hit_role?: string | null
}): Entry =>
    entry({
        kind: 'limit_wait_started',
        content: { resets_at, until, rate_limit_type, hit_ticket, hit_role },
    })

export const limitWaitEnded = ({
    until = '2026-09-23T17:05:00.000Z',
}: { until?: string } = {}): Entry =>
    entry({ kind: 'limit_wait_ended', content: { until } })

/**
 * How much of the plan a ticket (scope `ticket`) or the whole run (scope
 * `run`) used: each window's percent before and after, and the difference.
 */
export const usageRecorded = ({
    ticket,
    windows,
}: {
    ticket: number | null
    windows: Record<string, { from: number; to: number; used: number }>
}): Entry =>
    entry({
        kind: 'usage_recorded',
        ticket,
        content: {
            scope: ticket === null ? 'run' : 'ticket',
            ticket,
            agent_turns: 3,
            tokens: {
                input_tokens: 100,
                output_tokens: 200,
                cache_read_input_tokens: 300,
                cache_creation_input_tokens: 400,
            },
            windows,
        },
    })

/**
 * The owner's one-word reply on the spec issue. `ship` is the final review's
 * reply (#367); the engine reads `retry`, `skip`, and `stop` today (#366).
 */
export const replyReceived = ({
    word,
    ticket,
    comment_id = 501,
    author = 'owner',
}: {
    word: 'retry' | 'skip' | 'stop' | 'ship'
    ticket: number | null
    comment_id?: number
    author?: string
}): Entry =>
    entry({
        kind: 'reply_received',
        ticket,
        content: { word, ticket, comment_id, author },
    })

/**
 * A skipped ticket: `because` is `null` when the owner skipped it, or the
 * skipped ticket it waits on.
 */
export const ticketSkipped = ({
    ticket,
    because = null,
}: {
    ticket: number
    because?: number | null
}): Entry => entry({ kind: 'ticket_skipped', ticket, content: { because } })

/** How the engine took a `retry` reply for a stuck ticket. */
export const ticketRetried = ({
    ticket,
    mode,
    problems = [],
}: {
    ticket: number
    mode: 'resume' | 'restart' | 'refused'
    problems?: string[]
}): Entry =>
    entry({
        kind: 'ticket_retried',
        ticket,
        content: {
            mode,
            base_sha: mode === 'refused' ? null : 'abc1234',
            problems,
            answer_id: mode === 'refused' ? 601 : null,
        },
    })

/** A reply the engine couldn't use; it answered why on the spec issue. */
export const replyIgnored = ({
    reason,
    comment_id = 502,
}: {
    reason: string
    comment_id?: number
}): Entry =>
    entry({
        kind: 'reply_ignored',
        content: { comment_id, reason, answer_id: 602 },
    })

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

/**
 * Every step of one feature ticket, from its worktree to the push, as the
 * engine journals it, each agent's session included.
 */
export const wholeTicket = ({ ticket }: { ticket: number }): Entry[] => [
    ticketWorktreeCreated({ ticket }),
    baselineTests({ ticket, passed: 4 }),
    agentStarted({ ticket, role: 'test-writer' }),
    agentSession({ ticket, role: 'test-writer', input: 100, output: 400 }),
    agentFinished({ ticket, role: 'test-writer' }),
    redCheck({ ticket, ok: true, failing: 2, passing: 4 }),
    leftoverScan({ ticket, stage: 'red' }),
    commitMade({ ticket, stage: 'red' }),
    agentStarted({ ticket, role: 'implementer' }),
    agentSession({ ticket, role: 'implementer', input: 200, output: 800 }),
    agentFinished({ ticket, role: 'implementer' }),
    gatesRun({ ticket, ok: true }),
    leftoverScan({ ticket, stage: 'green' }),
    commitMade({ ticket, stage: 'green' }),
    agentStarted({ ticket, role: 'ticket-reviewer' }),
    agentSession({ ticket, role: 'ticket-reviewer', input: 50, output: 150 }),
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

// The final review as the engine journals it (#367): its own kinds with
// the engine's extra fields, and the usual agent, gate, scan, commit, and
// push kinds with `ticket: null`.

const LENSES = [
    'architecture',
    'simplification',
    'security',
    'integration',
    'rules',
]

/** `final_review_started` with every field the engine writes. */
export const engineFinalReviewStarted = ({
    round,
    lenses = LENSES,
}: {
    round: number
    lenses?: string[]
}): Entry =>
    entry({
        kind: 'final_review_started',
        content: {
            round,
            from_sha: round === 1 ? 'base' : `fix-${round - 1}`,
            head_sha: round === 1 ? 'g1' : `fix-${round - 1}`,
            lenses,
            files: ['src/export.ts'],
            rules: [{ path: 'AGENTS.md', text: '# Rules' }],
        },
    })

/**
 * One lens's turn as the engine journals it: `lens_started`, its agent's
 * start and finish (role `<lens>-lens`, no ticket), and `lens_finished`.
 */
export const engineLensTurn = ({
    lens,
    round,
    findings = [],
}: {
    lens: string
    round: number
    findings?: Finding[]
}): Entry[] => {
    const role = `${lens}-lens`
    const count = (severity: Finding['severity']) =>
        findings.filter((each) => each.severity === severity).length
    return [
        entry({ kind: 'lens_started', content: { lens, round } }),
        entry({
            kind: 'agent_started',
            role,
            content: {
                role,
                prompt: `You are the ${role}.`,
                follow_up_of: null,
            },
        }),
        entry({
            kind: 'agent_finished',
            role,
            content: {
                role,
                session_id: `session-${role}-${round}`,
                result: {
                    verdict: findings.some((each) => each.severity !== 'nit')
                        ? 'changes_requested'
                        : 'approve',
                    findings,
                    rulings: [],
                    summary: '',
                    assumptions: [],
                },
            },
        }),
        entry({
            kind: 'lens_finished',
            content: {
                lens,
                round,
                findings: {
                    blocker: count('blocker'),
                    should_fix: count('should_fix'),
                    nit: count('nit'),
                },
            },
        }),
    ]
}

/** A final review fixer's turn (no ticket), answering these findings. */
export const engineFinalFixerTurn = ({
    role,
    responses,
}: {
    role: 'test-writer' | 'implementer'
    responses: FindingResponse[]
}): Entry[] => [
    entry({
        kind: 'agent_started',
        role,
        content: { role, prompt: 'Fix the findings.', follow_up_of: null },
    }),
    entry({
        kind: 'agent_finished',
        role,
        content: {
            role,
            session_id: `session-${role}-final`,
            result: {
                ...(RESULTS[role] as Record<string, unknown>),
                finding_responses: responses,
            },
        },
    }),
]

/** The final review's fixes: gates on the run branch, the commit, the push. */
export const engineFinalFixesLanded = ({
    round,
    gates_ok = true,
}: {
    round: number
    gates_ok?: boolean
}): Entry[] => [
    {
        ...gatesRun({ ticket: 0, ok: gates_ok, target: 'run_branch' }),
        ticket: null,
    },
    entry({ kind: 'leftover_scan', content: { stage: 'fix', hits: [] } }),
    entry({
        kind: 'commit_made',
        content: {
            stage: 'fix',
            sha: `fix-${round}`,
            message: `fix: final review round ${round} for spec #10`,
            files: ['src/export.ts'],
        },
    }),
    entry({
        kind: 'run_branch_pushed',
        content: { branch: 'luca/run-10', sha: `fix-${round}` },
    }),
]

export const finalReviewShipped = (): Entry =>
    entry({ kind: 'final_review_shipped', content: {} })
