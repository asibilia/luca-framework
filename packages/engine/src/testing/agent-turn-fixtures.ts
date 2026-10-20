/**
 * Journal entry builders for agent turns: a turn started, its result for
 * each role (tests written, implemented, reviewed), a failed turn, and the
 * launcher's summary of a turn.
 */
import type {
    AgentRole,
    CriterionTests,
    Finding,
    FindingResponse,
    FindingRuling,
} from '../agents/role-results'
import type { JournalEntry } from '../journal/journal-record'

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
    learner: 'learner-1',
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
    criteria,
}: {
    /** `null` for the final review. */
    ticket: number | null
    /** Defaults to `SESSIONS['test-writer']`. */
    session_id?: string
    /** Defaults to one test, `sum adds two numbers`, for AC1. */
    criteria?: CriterionTests[]
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
            criteria: criteria ?? [
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
    session_gone,
    out_of_turns,
}: {
    /** `null` for the final review. */
    ticket: number | null
    role: AgentRole
    failure: 'agent' | 'result' | 'guard' | 'engine'
    /** Defaults to "It broke." */
    error?: string
    /** Defaults to `SESSIONS[role]`; `null` for a turn with no session. */
    session_id?: string | null
    /** A follow-up found its session closed or gone (#521). Left out by default. */
    session_gone?: boolean
    /** The turn reached its role's turn limit (#543). Left out by default. */
    out_of_turns?: boolean
}): JournalEntry => ({
    kind: 'agent_failed',
    ticket,
    role,
    content: {
        role,
        failure,
        error: error ?? 'It broke.',
        session_id: session_id === undefined ? SESSIONS[role] : session_id,
        ...(session_gone === undefined ? {} : { session_gone }),
        ...(out_of_turns === undefined ? {} : { out_of_turns }),
    },
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
