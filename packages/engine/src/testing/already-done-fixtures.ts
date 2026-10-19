/**
 * Journal entry builders for a ticket whose work is already on the base
 * branch: the test-writer's evidence, the engine's check of it, and the
 * ticket noted and closed.
 */
import { SESSIONS } from './agent-turn-fixtures'

import type { JournalEntry } from '../journal/journal-record'

/** The commit fixtures say did an already-done ticket's work. */
export const DONE_SHA = '3559c25f5a1b2c3d4e5f60718293a4b5c6d7e8f9'

/**
 * A test-writer that found the ticket's work already on the base branch:
 * done by `DONE_SHA` unless told otherwise, with one existing test for AC1.
 */
export const alreadyDone = ({
    ticket,
    shas,
}: {
    ticket: number
    /** Defaults to `[DONE_SHA]`. */
    shas?: string[]
}): JournalEntry => ({
    kind: 'agent_finished',
    ticket,
    role: 'test-writer',
    content: {
        role: 'test-writer',
        session_id: SESSIONS['test-writer'],
        result: {
            outcome: 'already_done',
            done_by: (shas ?? [DONE_SHA]).map((sha) => ({
                sha,
                title: 'feat: add sum',
            })),
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
            summary: 'The sum is already on main, with its test.',
        },
    },
})

/**
 * The engine checked a test-writer's "already done" evidence (#495): it
 * passed, or, with `problems`, it did not.
 */
export const alreadyDoneChecked = ({
    ticket,
    problems,
}: {
    ticket: number
    /** What did not check out. Left out, none: the check passed. */
    problems?: string[]
}): JournalEntry => ({
    kind: 'already_done_checked',
    ticket,
    role: null,
    content: {
        ok: (problems ?? []).length === 0,
        problems: problems ?? [],
        base_sha: 'b0',
        tests: null,
    },
})

/** The engine noted that a ticket's work is already done, on the spec issue. */
export const ticketAlreadyDone = ({
    ticket,
    shas,
}: {
    ticket: number
    /** Defaults to `[DONE_SHA]`. */
    shas?: string[]
}): JournalEntry => ({
    kind: 'ticket_already_done',
    ticket,
    role: null,
    content: { shas: shas ?? [DONE_SHA], comment_id: 300 + ticket },
})

/** The engine closed an already-done ticket, with a comment on it. */
export const ticketClosed = ({ ticket }: { ticket: number }): JournalEntry => ({
    kind: 'ticket_closed',
    ticket,
    role: null,
    content: { comment_id: 400 + ticket },
})
