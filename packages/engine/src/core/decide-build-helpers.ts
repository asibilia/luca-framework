import { decide } from './decide'

import type { JournalEntry } from '../journal/journal-record'
import {
    baselineTests,
    commitMade,
    implemented,
    intakePassed,
    leftoverScan,
    practiceTicket,
    redCheck,
    runBranchCreated,
    testsWritten,
    ticketBuilt,
    ticketWorktreeCreated,
    withInstalls,
    worktreeReset,
} from '../testing/build-fixtures'
import { recordsFrom } from '../testing/intake-fixtures'
import { REFACTOR_LABEL } from '../tracker/tracker'

/**
 * Helpers shared by the tests of the decision steps for building a ticket
 * (`decide-build.test.ts` and the `decide-build-*.test.ts` files beside it).
 */

export const TICKET = practiceTicket({ number: 11 })

/**
 * Decide on a run with one ticket (#11) and these entries after intake. Each
 * new worktree gets a passing install unless the entries list one.
 */
export const decideAfter = (entries: JournalEntry[]) =>
    decide({
        records: recordsFrom({
            entries: [
                ...intakePassed({ tickets: [TICKET] }),
                ...withInstalls({ entries }),
            ],
        }),
    })

/** The steps of ticket #11 up to and including the step at `index`. */
export const stepsUpTo = (index: number) => [
    runBranchCreated(),
    ...ticketBuilt({ ticket: 11 }).slice(0, index + 1),
]

/** Ticket #11 up to its first bad-test bounce and the worktree reset. */
export const bounced = (): JournalEntry[] => [
    ...stepsUpTo(5),
    implemented({ ticket: 11, outcome: 'bad_test' }),
    worktreeReset({ ticket: 11 }),
]

/** After the bounce: fresh tests, a passing red check, the second red commit. */
export const replaced = (): JournalEntry[] => [
    ...bounced(),
    testsWritten({ ticket: 11, session_id: 'tw-2' }),
    redCheck({ ticket: 11, ok: true }),
    leftoverScan({ ticket: 11, stage: 'red' }),
    commitMade({ ticket: 11, stage: 'red' }),
]

export const REFACTOR_TICKET = practiceTicket({
    number: 11,
    title: 'Split sum into its own file',
    labels: ['ready-for-agent', REFACTOR_LABEL],
})

/** Decide on a run whose one ticket (#11) is a refactor ticket. */
export const decideRefactorAfter = (entries: JournalEntry[]) =>
    decide({
        records: recordsFrom({
            entries: [
                ...intakePassed({ tickets: [REFACTOR_TICKET] }),
                ...withInstalls({
                    entries: [
                        runBranchCreated(),
                        ticketWorktreeCreated({ ticket: 11 }),
                    ],
                }),
                baselineTests({ ticket: 11 }),
                ...entries,
            ],
        }),
    })
