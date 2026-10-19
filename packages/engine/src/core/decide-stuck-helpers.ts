import { decideSteps } from './decide'
import { MAX_FIX_ROUNDS } from './decide-build'

import type { TicketSnapshot } from '../intake/intake-schemas'
import type { JournalEntry } from '../journal/journal-record'
import {
    agentStarted,
    baselineTests,
    gatesRun,
    implemented,
    intakePassed,
    practiceTicket,
    SESSIONS,
    ticketBuilt,
    ticketStuck,
    worktreeReset,
    ticketWorktreeCreated,
    withInstalls,
} from '../testing/build-fixtures'
import { recordsFrom } from '../testing/intake-fixtures'

/**
 * Fixtures shared by the decide-stuck tests (#366): the tickets, the helpers
 * that decide the next steps, and journals of a ticket stuck for good.
 */

export const SUM = practiceTicket({ number: 11, title: 'Add sum' })
export const PRODUCT = practiceTicket({ number: 12, title: 'Add product' })
export const AVERAGE = practiceTicket({
    number: 13,
    title: 'Add average',
    blockers: [11],
})

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

export const twoSteps = (entries: JournalEntry[]) =>
    stepsAfter({ tickets: [SUM, PRODUCT], entries })

export const oneSteps = (entries: JournalEntry[]) =>
    stepsAfter({ tickets: [SUM], entries })

/** #11 failed its gates after every fix round. */
export const gatesFailedForGood = (): JournalEntry[] => [
    ticketWorktreeCreated({ ticket: 11 }),
    baselineTests({ ticket: 11 }),
    ...ticketBuilt({ ticket: 11 }).slice(2, 6),
    implemented({ ticket: 11 }),
    gatesRun({ ticket: 11, target: 'ticket', ok: false }),
    ...Array.from({ length: MAX_FIX_ROUNDS }, () => [
        agentStarted({
            ticket: 11,
            role: 'implementer',
            follow_up_of: SESSIONS.implementer,
        }),
        implemented({ ticket: 11 }),
        gatesRun({ ticket: 11, target: 'ticket', ok: false }),
    ]).flat(),
    ticketStuck({
        ticket: 11,
        reason: 'gates_failed',
        detail: 'The gates still fail after 3 fix rounds:\ntest: 1 fail',
    }),
]

/**
 * #11's one mapped test passed with no expect() twice (#581): the engine sent
 * it back once, and the second time the ticket is stuck as `bad_test`.
 */
export const emptyTestForGood = (): JournalEntry[] => {
    const emptyGates = gatesRun({
        ticket: 11,
        target: 'ticket',
        ok: true,
        cases: [
            {
                file: 'src/sum.test.ts',
                full_name: 'sum adds two numbers',
                status: 'passed',
                assertions: 0,
            },
        ],
    })
    return [
        ticketWorktreeCreated({ ticket: 11 }),
        baselineTests({ ticket: 11 }),
        ...ticketBuilt({ ticket: 11 }).slice(2, 6),
        implemented({ ticket: 11 }),
        emptyGates,
        worktreeReset({
            ticket: 11,
            bad_test: {
                file: 'src/sum.test.ts',
                name: 'sum adds two numbers',
                reason: 'It passes but runs no expect(), so it checks nothing (#581).',
            },
        }),
        ...ticketBuilt({ ticket: 11 }).slice(2, 6),
        implemented({ ticket: 11, session_id: 'impl-2' }),
        emptyGates,
        ticketStuck({
            ticket: 11,
            reason: 'bad_test',
            detail: 'A mapped test still checks nothing after a fresh test-writer.',
        }),
    ]
}

/** #12 has its worktree and baseline: its test-writer is next. */
export const productStarted = (): JournalEntry[] => [
    ticketWorktreeCreated({ ticket: 12 }),
    baselineTests({ ticket: 12 }),
]
