import { decideSteps } from './decide'

import type { TicketSnapshot } from '../intake/intake-schemas'
import type { JournalEntry } from '../journal/journal-record'
import {
    agentStarted,
    commitMade,
    gatesRun,
    implemented,
    intakePassed,
    joinClashed,
    leftoverScan,
    practiceTicket,
    reviewed,
    runBranchCreated,
    SESSIONS,
    ticketApproved,
    ticketRebased,
    withInstalls,
} from '../testing/build-fixtures'
import { recordsFrom } from '../testing/intake-fixtures'

/**
 * Helpers shared by the tests of the decision step for many tickets in one
 * run (`decide-many-tickets.test.ts` and `decide-many-tickets-clash.test.ts`).
 */

export const SUM = practiceTicket({ number: 11, title: 'Add sum' })
export const PRODUCT = practiceTicket({ number: 12, title: 'Add product' })
export const AVERAGE = practiceTicket({
    number: 13,
    title: 'Add average',
    blockers: [11, 12],
})

/** Every action that can run now, on a run with these tickets and entries. */
export const stepsAfter = ({
    tickets,
    entries,
}: {
    tickets: TicketSnapshot[]
    entries: JournalEntry[]
}) =>
    decideSteps({
        records: recordsFrom({
            entries: [
                ...intakePassed({ tickets }),
                ...withInstalls({ entries }),
            ],
        }),
    })

/** The same, on a run with #11 and #12 only. */
export const twoSteps = (entries: JournalEntry[]) =>
    stepsAfter({ tickets: [SUM, PRODUCT], entries })

/** The same, on a run with #11 only. */
export const oneSteps = (entries: JournalEntry[]) =>
    stepsAfter({ tickets: [SUM], entries })

/** #11 approved, then its join clashed. */
export const clashed = (): JournalEntry[] => [
    runBranchCreated(),
    ...ticketApproved({ ticket: 11 }),
    joinClashed({ ticket: 11 }),
]

/** #11 rebased after `src/index.ts` clashed. */
export const codeClash = (): JournalEntry =>
    ticketRebased({ ticket: 11, cause: 'clash', code: ['src/index.ts'] })

/** After a rebase, the ticket fixed and approved again, up to its green commit. */
export const fixedOnRunBranch = (): JournalEntry[] => [
    agentStarted({
        ticket: 11,
        role: 'implementer',
        follow_up_of: SESSIONS.implementer,
    }),
    implemented({ ticket: 11 }),
    gatesRun({ ticket: 11, target: 'ticket', ok: true }),
    leftoverScan({ ticket: 11, stage: 'green' }),
    commitMade({ ticket: 11, stage: 'green' }),
    reviewed({ ticket: 11 }),
]
