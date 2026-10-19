/**
 * Journal entry builders for the scheduler's step records: a step started
 * and a step ended.
 */
import type { AgentRole } from '../agents/role-results'
import type { JournalEntry } from '../journal/journal-record'

/**
 * The scheduler started a step: `step` is its action type, plus `:<role>`
 * for an agent's turn. `key` defaults to the ticket's number, or `run`.
 */
export const stepStarted = ({
    ticket,
    step,
    key,
    role,
    first_seq,
}: {
    ticket: number | null
    step: string
    key?: string
    role?: AgentRole
    /** The step's first try, on a redo. Defaults to `null`. */
    first_seq?: number
}): JournalEntry => ({
    kind: 'step_started',
    ticket,
    role: role ?? null,
    content: {
        key: key ?? (ticket === null ? 'run' : String(ticket)),
        step,
        first_seq: first_seq ?? null,
    },
})

/** The scheduler saw a step settle. `key` as in `stepStarted`. */
export const stepEnded = ({
    ticket,
    step,
    key,
    role,
}: {
    ticket: number | null
    step: string
    key?: string
    role?: AgentRole
}): JournalEntry => ({
    kind: 'step_ended',
    ticket,
    role: role ?? null,
    content: {
        key: key ?? (ticket === null ? 'run' : String(ticket)),
        step,
    },
})
