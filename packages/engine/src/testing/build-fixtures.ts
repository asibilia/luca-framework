import type {
    AgentRole,
    Finding,
    FindingResponse,
    FindingRuling,
} from '../agents/role-results'
import type { EngineConfig } from '../config/engine-config'
import type { TestRun } from '../gates/gate-schemas'
import type { TicketSnapshot } from '../intake/intake-schemas'
import type { CommitStage, JournalEntry } from '../journal/journal-record'

/**
 * Journal entry builders for the build steps, so decision-step tests can
 * write a journal that stops anywhere along a ticket's spine.
 */

export const BUILD_CONFIG: EngineConfig = {
    checks: { test: 'bun test', types: 'bun run types', lint: 'bun run lint' },
    test_file_patterns: ['**/*.test.ts'],
    test_setup_files: [],
    rule_files: [],
}

/** A ticket as intake snapshots it. */
export const practiceTicket = ({
    number,
    title,
    criteria,
    labels,
    blockers,
}: {
    number: number
    title?: string
    criteria?: string[]
    /** Defaults to `ready-for-agent` only; add `refactor` for a refactor ticket. */
    labels?: string[]
    /** The tickets it waits on. Defaults to none. */
    blockers?: number[]
}): TicketSnapshot => ({
    number,
    title: title ?? 'Add sum',
    body: '## What to build\n\nA sum function.',
    labels: labels ?? ['ready-for-agent'],
    url: `https://github.com/acme/app/issues/${number}`,
    criteria: (criteria ?? ['sum adds two numbers']).map((text, index) => ({
        id: `AC${index + 1}`,
        text,
    })),
    blockers: blockers ?? [],
})

/** A run whose intake passed with these tickets, in this order. */
export const intakePassed = ({
    tickets,
}: {
    tickets: TicketSnapshot[]
}): JournalEntry[] => [
    {
        kind: 'run_started',
        ticket: null,
        role: null,
        content: { spec_number: 10, config: BUILD_CONFIG, base_branch: 'main' },
    },
    {
        kind: 'spec_snapshot',
        ticket: 10,
        role: null,
        content: {
            spec: {
                number: 10,
                title: 'Practice spec',
                body: '## Testing Decisions\n\n- Test the sum.',
                labels: ['ready-for-agent'],
                url: 'https://github.com/acme/app/issues/10',
            },
            ticket_order: tickets.map((ticket) => ticket.number),
            closed_tickets: [],
        },
    },
    ...tickets.map(
        (ticket): JournalEntry => ({
            kind: 'ticket_snapshot',
            ticket: ticket.number,
            role: null,
            content: ticket,
        })
    ),
]

export const RUN_BRANCH = 'luca/spec-10-run'

/** Where fixtures put each ticket's worktree, and the run branch's. */
export const ticketPath = (ticket: number): string =>
    `/runs/run/tickets/${ticket}`

export const RUN_BRANCH_PATH = '/runs/run/run-branch'

export const runBranchCreated = (): JournalEntry => ({
    kind: 'run_branch_created',
    ticket: null,
    role: null,
    content: {
        branch: RUN_BRANCH,
        path: RUN_BRANCH_PATH,
        base_sha: 'b0',
    },
})

export const ticketWorktreeCreated = ({
    ticket,
}: {
    ticket: number
}): JournalEntry => ({
    kind: 'ticket_worktree_created',
    ticket,
    role: null,
    content: {
        branch: `${RUN_BRANCH}--ticket-${ticket}`,
        path: ticketPath(ticket),
        base_sha: 'b0',
    },
})

/**
 * The engine's install in a new worktree: the run branch's checkout
 * (`ticket` unset) or a ticket's worktree. Passing unless `ok` is false.
 */
export const dependenciesInstalled = ({
    ticket,
    ok,
}: {
    ticket?: number
    ok?: boolean
}): JournalEntry => ({
    kind: 'dependencies_installed',
    ticket: ticket ?? null,
    role: null,
    content: {
        target: ticket === undefined ? 'run_branch' : 'ticket',
        check: {
            name: 'install',
            command: 'bun install --frozen-lockfile',
            ok: ok ?? true,
            exit_code: ok === false ? 1 : 0,
            output:
                ok === false
                    ? 'error: lockfile had changes, but lockfile is frozen'
                    : '',
        },
    },
})

/**
 * The entries with a passing install after each new worktree that has none,
 * so tests about later steps need not list the installs.
 */
export const withInstalls = ({
    entries,
}: {
    entries: JournalEntry[]
}): JournalEntry[] =>
    entries.flatMap((entry, index) => {
        const made =
            entry.kind === 'run_branch_created' ||
            entry.kind === 'ticket_worktree_created'
        if (!made || entries[index + 1]?.kind === 'dependencies_installed') {
            return [entry]
        }
        return [
            entry,
            dependenciesInstalled({ ticket: entry.ticket ?? undefined }),
        ]
    })

/** A test run with no test files, as a fresh repo has. */
export const emptyTestRun = (): TestRun => ({
    command: 'bun test',
    ok: true,
    exit_code: 1,
    no_test_files: true,
    cases: [],
    files_without_results: [],
    output: '0 test files matching',
})

export const baselineTests = ({
    ticket,
}: {
    ticket: number
}): JournalEntry => ({
    kind: 'baseline_tests',
    ticket,
    role: null,
    content: emptyTestRun(),
})

/** The session id fixtures give each role's turns unless told otherwise. */
export const SESSIONS = {
    'test-writer': 'tw-1',
    implementer: 'impl-1',
    'ticket-reviewer': 'rev-1',
    'architecture-lens': 'architecture-1',
    'simplification-lens': 'simplification-1',
    'security-lens': 'security-1',
    'integration-lens': 'integration-1',
    'rules-lens': 'rules-1',
} as const satisfies Record<AgentRole, string>

/** An agent turn started: a fresh launch, or a follow-up to `follow_up_of`. */
export const agentStarted = ({
    ticket,
    role,
    prompt,
    follow_up_of,
}: {
    /** `null` for the final review. */
    ticket: number | null
    role: AgentRole
    prompt?: string
    follow_up_of?: string
}): JournalEntry => ({
    kind: 'agent_started',
    ticket,
    role,
    content: {
        role,
        prompt: prompt ?? 'p',
        follow_up_of: follow_up_of ?? null,
    },
})

export const testsWritten = ({
    ticket,
    session_id,
    assumptions,
    finding_responses,
    run_notes,
}: {
    /** `null` for the final review. */
    ticket: number | null
    /** Defaults to `SESSIONS['test-writer']`. */
    session_id?: string
    /** Defaults to one assumption. */
    assumptions?: string[]
    /** A review fixer's answer to each finding it got. */
    finding_responses?: FindingResponse[]
    /** Defaults to none. */
    run_notes?: string[]
}): JournalEntry => ({
    kind: 'agent_finished',
    ticket,
    role: 'test-writer',
    content: {
        role: 'test-writer',
        session_id: session_id ?? SESSIONS['test-writer'],
        result: {
            outcome: 'tests_written',
            criteria: [
                {
                    criterion_id: 'AC1',
                    tests: [
                        {
                            file: 'src/sum.test.ts',
                            name: 'sum adds two numbers',
                        },
                    ],
                },
            ],
            summary: 'One test for AC1.',
            assumptions: assumptions ?? ['Numbers are integers.'],
            run_notes: run_notes ?? [],
            finding_responses: finding_responses ?? [],
        },
    },
})

/** A test-writer that found nothing new to test. */
export const nothingNewToTest = ({
    ticket,
}: {
    ticket: number
}): JournalEntry => ({
    kind: 'agent_finished',
    ticket,
    role: 'test-writer',
    content: {
        role: 'test-writer',
        session_id: SESSIONS['test-writer'],
        result: { outcome: 'nothing_new_to_test' },
    },
})

export const redCheck = ({
    ticket,
    ok,
}: {
    ticket: number
    ok: boolean
}): JournalEntry => ({
    kind: 'red_check',
    ticket,
    role: null,
    content: {
        ok,
        problems: ok ? [] : ['"sum adds two numbers" passes already'],
        notes: [],
        tests: {
            ...emptyTestRun(),
            output: ok ? '1 fail' : '(pass) sum adds two numbers',
        },
    },
})

export const leftoverScan = ({
    ticket,
    stage,
    hits,
}: {
    /** `null` for the final review. */
    ticket: number | null
    stage: CommitStage
    hits?: { path: string; reason: string }[]
}): JournalEntry => ({
    kind: 'leftover_scan',
    ticket,
    role: null,
    content: { stage, hits: hits ?? [] },
})

export const commitMade = ({
    ticket,
    stage,
    sha,
    files,
}: {
    /** `null` for the final review. */
    ticket: number | null
    stage: CommitStage
    /** Defaults to `<stage>-sha`. */
    sha?: string
    files?: string[]
}): JournalEntry => ({
    kind: 'commit_made',
    ticket,
    role: null,
    content: {
        stage,
        sha: sha ?? `${stage}-sha`,
        message: stage,
        files: files ?? [],
    },
})

export const implemented = ({
    ticket,
    outcome,
    session_id,
    reason,
    assumptions,
    finding_responses,
    run_notes,
}: {
    /** `null` for the final review. */
    ticket: number | null
    outcome?: 'done' | 'bad_test'
    /** Defaults to `SESSIONS.implementer`. */
    session_id?: string
    /** The bad test's reason. Defaults to "Wrong sum." */
    reason?: string
    assumptions?: string[]
    finding_responses?: FindingResponse[]
    /** Defaults to none. */
    run_notes?: string[]
}): JournalEntry => ({
    kind: 'agent_finished',
    ticket,
    role: 'implementer',
    content: {
        role: 'implementer',
        session_id: session_id ?? SESSIONS.implementer,
        result: {
            outcome: outcome ?? 'done',
            bad_test:
                outcome === 'bad_test'
                    ? {
                          file: 'src/sum.test.ts',
                          name: 'sum adds two numbers',
                          reason: reason ?? 'Wrong sum.',
                      }
                    : null,
            summary: 'Added sum.',
            assumptions: assumptions ?? [],
            run_notes: run_notes ?? [],
            finding_responses: finding_responses ?? [],
        },
    },
})

export const gatesRun = ({
    ticket,
    target,
    ok,
}: {
    /** `null` for the final review. */
    ticket: number | null
    target: 'ticket' | 'run_branch'
    ok: boolean
}): JournalEntry => ({
    kind: 'gates_run',
    ticket,
    role: null,
    content: {
        target,
        ok,
        checks: [
            {
                name: 'test',
                command: 'bun test',
                ok,
                exit_code: ok ? 0 : 1,
                output: ok ? '' : '1 fail',
            },
        ],
    },
})

/** One reviewer finding; a code should-fix in `src/sum.ts` unless told otherwise. */
export const finding = ({
    id,
    severity,
    kind,
    title,
    file,
}: {
    id: string
    severity?: 'blocker' | 'should_fix' | 'nit'
    kind?: 'code' | 'test'
    title?: string
    file?: string | null
}): Finding => ({
    id,
    severity: severity ?? 'should_fix',
    kind: kind ?? 'code',
    file: file === undefined ? 'src/sum.ts' : file,
    title: title ?? `Finding ${id}`,
    detail: `Detail of ${id}.`,
})

/**
 * A ticket reviewer's result. The verdict follows the findings: changes are
 * requested when any is a blocker or should-fix.
 */
export const reviewed = ({
    ticket,
    findings,
    rulings,
    session_id,
}: {
    ticket: number
    findings?: Finding[]
    rulings?: FindingRuling[]
    /** Defaults to `SESSIONS['ticket-reviewer']`. */
    session_id?: string
}): JournalEntry => {
    const list = findings ?? []
    const blocking = list.some(({ severity }) => severity !== 'nit')
    return {
        kind: 'agent_finished',
        ticket,
        role: 'ticket-reviewer',
        content: {
            role: 'ticket-reviewer',
            session_id: session_id ?? SESSIONS['ticket-reviewer'],
            result: {
                verdict: blocking ? 'changes_requested' : 'approve',
                findings: list,
                rulings: rulings ?? [],
                summary: 'Looks right.',
                assumptions: [],
            },
        },
    }
}

/** An agent turn failed, in the session its role's fixtures use unless told otherwise. */
export const agentFailed = ({
    ticket,
    role,
    failure,
    error,
    session_id,
}: {
    /** `null` for the final review. */
    ticket: number | null
    role: AgentRole
    failure: 'agent' | 'result' | 'guard' | 'engine'
    /** Defaults to "It broke." */
    error?: string
    /** Defaults to `SESSIONS[role]`; `null` for a turn with no session. */
    session_id?: string | null
}): JournalEntry => ({
    kind: 'agent_failed',
    ticket,
    role,
    content: {
        role,
        failure,
        error: error ?? 'It broke.',
        session_id: session_id === undefined ? SESSIONS[role] : session_id,
    },
})

/** The engine threw away a ticket worktree's uncommitted changes. */
export const worktreeReset = ({
    ticket,
}: {
    ticket: number
}): JournalEntry => ({
    kind: 'worktree_reset',
    ticket,
    role: null,
    content: { sha: 'red-sha' },
})

export const joined = ({ ticket }: { ticket: number }): JournalEntry => ({
    kind: 'ticket_joined',
    ticket,
    role: null,
    content: { ok: true, shas: ['r1', 'g1'] },
})

/** A join whose cherry-pick clashed with the run branch (git aborted it). */
export const joinClashed = ({
    ticket,
    error,
}: {
    ticket: number
    /** Defaults to a conflict in `src/index.ts`. */
    error?: string
}): JournalEntry => ({
    kind: 'ticket_joined',
    ticket,
    role: null,
    content: { ok: false, error: error ?? 'CONFLICT (content): src/index.ts' },
})

/** The engine put a ticket's change back on top of the run branch. */
export const ticketRebased = ({
    ticket,
    cause,
    tests,
    code,
    undone,
}: {
    ticket: number
    cause: 'clash' | 'join_gates'
    /** The test files that clashed. Defaults to none. */
    tests?: string[]
    /** The code files that clashed. Defaults to none. */
    code?: string[]
    /** The run branch commits undone first. Defaults to none. */
    undone?: string[]
}): JournalEntry => ({
    kind: 'ticket_rebased',
    ticket,
    role: null,
    content: {
        cause,
        base_sha: 'onto-sha',
        tests: tests ?? [],
        code: code ?? [],
        undone: undone ?? [],
    },
})

/** The engine removed these worktrees at the end of the run. */
export const worktreesRemoved = ({
    paths,
}: {
    paths: string[]
}): JournalEntry => ({
    kind: 'worktrees_removed',
    ticket: null,
    role: null,
    content: { paths },
})

/** The run's one PR, #99, opened from the run branch. */
export const pullRequestOpened = (): JournalEntry => ({
    kind: 'pull_request_opened',
    ticket: null,
    role: null,
    content: {
        number: 99,
        url: 'https://github.com/acme/app/pull/99',
        head: RUN_BRANCH,
        base: 'main',
        title: 'Practice spec (#10)',
        body: '',
    },
})

export const ticketStuck = ({
    ticket,
    reason,
    detail,
}: {
    ticket: number
    reason: 'red_check_failed' | 'join_failed' | 'gates_failed'
    /** Defaults to "why". */
    detail?: string
}): JournalEntry => ({
    kind: 'ticket_stuck',
    ticket,
    role: null,
    content: { reason, detail: detail ?? 'why' },
})

export const pushed = ({
    ticket,
    sha,
}: {
    /** `null` for the final review's push. */
    ticket: number | null
    /** Defaults to `g1`. */
    sha?: string
}): JournalEntry => ({
    kind: 'run_branch_pushed',
    ticket,
    role: null,
    content: { branch: RUN_BRANCH, sha: sha ?? 'g1' },
})

/** Every step of one ticket, from its worktree to the push, all passing. */
export const ticketBuilt = ({ ticket }: { ticket: number }): JournalEntry[] => [
    ticketWorktreeCreated({ ticket }),
    baselineTests({ ticket }),
    testsWritten({ ticket }),
    redCheck({ ticket, ok: true }),
    leftoverScan({ ticket, stage: 'red' }),
    commitMade({ ticket, stage: 'red' }),
    implemented({ ticket }),
    gatesRun({ ticket, target: 'ticket', ok: true }),
    leftoverScan({ ticket, stage: 'green' }),
    commitMade({ ticket, stage: 'green' }),
    reviewed({ ticket }),
    joined({ ticket }),
    gatesRun({ ticket, target: 'run_branch', ok: true }),
    pushed({ ticket }),
]

/** Seconds since the epoch for an ISO time, as `resetsAt` gives it. */
export const epochSeconds = (iso: string): number =>
    Math.floor(Date.parse(iso) / 1000)

/**
 * One `rate_limit_event`'s info as the SDK sends it, with the windows'
 * utilization under `unifiedWindows` as real readings have it.
 */
export const rateLimitReading = ({
    status,
    rate_limit_type,
    resets_at,
    is_using_overage,
    windows,
}: {
    status: 'allowed' | 'allowed_warning' | 'rejected'
    /** Defaults to `five_hour`. */
    rate_limit_type?: string
    /** An ISO time; leave it out for a reading with no `resetsAt`. */
    resets_at?: string
    is_using_overage?: boolean
    /** Utilization (0 to 1) per window, such as `{ five_hour: 0.2 }`. */
    windows?: Record<string, number>
}): Record<string, unknown> => ({
    status,
    rateLimitType: rate_limit_type ?? 'five_hour',
    ...(resets_at === undefined ? {} : { resetsAt: epochSeconds(resets_at) }),
    overageStatus: 'rejected',
    overageDisabledReason: 'org_level_disabled',
    isUsingOverage: is_using_overage ?? false,
    unifiedWindows: Object.fromEntries(
        Object.entries(windows ?? {}).map(([name, utilization]) => [
            name,
            { utilization },
        ])
    ),
})

/** The launcher's summary of one agent turn, with these readings and tokens. */
export const agentSession = ({
    ticket,
    role,
    rate_limit_events,
    billing_error,
    output_tokens,
}: {
    /** `null` for the final review. */
    ticket: number | null
    role: AgentRole
    rate_limit_events?: Record<string, unknown>[]
    billing_error?: boolean
    /** Defaults to 100; input tokens are always 10. */
    output_tokens?: number
}): JournalEntry => ({
    kind: 'agent_session',
    ticket,
    role,
    content: {
        role,
        session: {
            session_id: SESSIONS[role],
            usage: {
                input_tokens: 10,
                output_tokens: output_tokens ?? 100,
                cache_read_input_tokens: 0,
                cache_creation_input_tokens: 0,
            },
            rate_limit_events: rate_limit_events ?? [],
            billing_error: billing_error ?? false,
        },
    },
})

/** A limit wait started, hit by #11's test-writer unless told otherwise. */
export const limitWaitStarted = ({
    until,
    resets_at,
    rate_limit_type,
}: {
    until: string
    resets_at: string | null
    /** Defaults to `five_hour`. */
    rate_limit_type?: string
}): JournalEntry => ({
    kind: 'limit_wait_started',
    ticket: null,
    role: null,
    content: {
        until,
        resets_at,
        rate_limit_type: rate_limit_type ?? 'five_hour',
        hit_ticket: 11,
        hit_role: 'test-writer',
    },
})

export const limitWaitEnded = ({ until }: { until: string }): JournalEntry => ({
    kind: 'limit_wait_ended',
    ticket: null,
    role: null,
    content: { until },
})

/** The run stopped for good on a sign of per-token billing. */
export const billingStopped = ({
    reason,
}: {
    reason: string
}): JournalEntry => ({
    kind: 'run_stopped',
    ticket: null,
    role: null,
    content: { reason, role: null, billing: true },
})

/** One ticket's steps up to and including its approving review. */
export const ticketApproved = ({
    ticket,
}: {
    ticket: number
}): JournalEntry[] => ticketBuilt({ ticket }).slice(0, 11)
