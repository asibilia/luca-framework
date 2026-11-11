import { decide } from './decide'

import type { JournalEntry } from '../journal/journal-record'
import {
    agentStarted,
    intakePassed,
    practiceTicket,
    runBranchCreated,
    ticketBuilt,
    withInstalls,
} from '../testing/build-fixtures'
import { recordsFrom } from '../testing/intake-fixtures'

/**
 * Helpers shared by the tests of the decision step around plan limits and
 * usage (`decide-limits.test.ts` and `decide-limits-usage.test.ts`).
 */

export const TICKET = practiceTicket({ number: 11 })

/** Decide on a run with one ticket (#11) and these entries after intake. */
export const decideAfter = (entries: JournalEntry[]) =>
    decide({
        records: recordsFrom({
            entries: [
                ...intakePassed({ tickets: [TICKET] }),
                ...withInstalls({ entries }),
            ],
        }),
    })

/** Ticket #11 up to its test-writer's launch, which has not finished. */
export const testWriterRunning = (): JournalEntry[] => [
    runBranchCreated(),
    ...ticketBuilt({ ticket: 11 }).slice(0, 2),
    agentStarted({ ticket: 11, role: 'test-writer' }),
]
