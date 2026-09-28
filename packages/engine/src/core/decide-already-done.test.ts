import { describe, expect, test } from 'bun:test'

import { decide, decideSteps } from './decide'

import type { TicketSnapshot } from '../intake/intake-schemas'
import type { JournalEntry } from '../journal/journal-record'
import {
    alreadyDone,
    alreadyDoneChecked,
    baselineTests,
    DONE_SHA,
    intakePassed,
    nothingNewToTest,
    practiceTicket,
    RUN_BRANCH_PATH,
    runBranchCreated,
    SESSIONS,
    testsWritten,
    ticketAlreadyDone,
    ticketBuilt,
    ticketClosed,
    ticketPath,
    ticketStuck,
    ticketWorktreeCreated,
    withInstalls,
    worktreesRemoved,
} from '../testing/build-fixtures'
import { finalReviewClean } from '../testing/final-review-fixtures'
import { recordsFrom } from '../testing/intake-fixtures'

/**
 * A ticket whose work is already on the base branch (#484): the test-writer
 * says so with its evidence, and the engine counts the ticket as done, not
 * stuck. Decision-step tests on hand-written journals.
 */

const SUM = practiceTicket({ number: 11 })

const recordsAfter = ({
    tickets,
    entries,
}: {
    tickets: TicketSnapshot[]
    entries: JournalEntry[]
}) =>
    recordsFrom({
        entries: [...intakePassed({ tickets }), ...withInstalls({ entries })],
    })

/**
 * A ticket's worktree, its baseline, its test-writer's "already done", and
 * the engine's check of that evidence, which passed.
 */
const answeredDone = (ticket: number): JournalEntry[] => [
    ticketWorktreeCreated({ ticket }),
    baselineTests({ ticket }),
    alreadyDone({ ticket }),
    alreadyDoneChecked({ ticket }),
]

describe('decision step: a ticket that is already done', () => {
    test('a test-writer that finds the work already on the base branch makes the ticket done, not stuck', () => {
        const action = decide({
            records: recordsAfter({
                tickets: [SUM],
                entries: [runBranchCreated(), ...answeredDone(11)],
            }),
        })

        expect(action).toMatchObject({
            type: 'mark_already_done',
            ticket: 11,
            spec_number: 10,
            shas: [DONE_SHA],
        })
        if (action.type !== 'mark_already_done') throw new Error(action.type)
        expect(action.body).toContain('#11 is already done')
        expect(action.body).toContain('`main`')
        expect(action.body).toContain('3559c25')
        expect(action.body).toContain(
            '- AC1: src/sum.test.ts > sum adds two numbers'
        )
        expect(action.body).not.toContain('retry')
    })

    test('a ticket that waits on an already-done ticket starts as if it were built', () => {
        const product = practiceTicket({
            number: 12,
            title: 'Add product',
            blockers: [11],
        })
        const tickets = [SUM, product]
        const before = decideSteps({
            records: recordsAfter({
                tickets,
                entries: [runBranchCreated(), ...answeredDone(11)],
            }),
        })
        expect(before.map(({ type }) => type)).toEqual(['mark_already_done'])

        const after = decideSteps({
            records: recordsAfter({
                tickets,
                entries: [
                    runBranchCreated(),
                    ...answeredDone(11),
                    ticketAlreadyDone({ ticket: 11 }),
                ],
            }),
        })
        expect(after).toEqual([
            {
                type: 'create_ticket_worktree',
                ticket: 12,
                run_branch: 'luca/spec-10-run',
            },
        ])
    })

    test('when every ticket is already done, the run closes them with a comment, removes its worktrees, and ends with nothing to do', () => {
        const done = [
            runBranchCreated(),
            ...answeredDone(11),
            ticketAlreadyDone({ ticket: 11 }),
        ]
        const at = (entries: JournalEntry[]) =>
            decide({ records: recordsAfter({ tickets: [SUM], entries }) })

        const close = at(done)
        expect(close).toMatchObject({ type: 'close_ticket', ticket: 11 })
        if (close.type !== 'close_ticket') throw new Error(close.type)
        expect(close.body).toContain('already')
        expect(close.body).toContain('3559c25')
        expect(close.body).toContain('spec #10')

        const closed = [...done, ticketClosed({ ticket: 11 })]
        expect(at(closed)).toEqual({
            type: 'remove_worktrees',
            paths: [ticketPath(11), RUN_BRANCH_PATH],
        })

        const removed = [
            ...closed,
            worktreesRemoved({ paths: [ticketPath(11), RUN_BRANCH_PATH] }),
        ]
        expect(at(removed)).toEqual({
            type: 'finish_nothing_to_do',
            closed_tickets: [],
            already_done: [11],
        })

        expect(
            at([
                ...removed,
                {
                    kind: 'nothing_to_do',
                    ticket: null,
                    role: null,
                    content: { closed_tickets: [], already_done: [11] },
                },
            ])
        ).toEqual({ type: 'done', outcome: 'nothing_to_do' })
    })

    test('in a run with a PR, the PR closes the already-done ticket and names the commit that did it', () => {
        const product = practiceTicket({ number: 12, title: 'Add product' })
        const action = decide({
            records: recordsAfter({
                tickets: [SUM, product],
                entries: [
                    runBranchCreated(),
                    ...answeredDone(11),
                    ticketAlreadyDone({ ticket: 11 }),
                    ...ticketBuilt({ ticket: 12 }),
                    ...finalReviewClean(),
                ],
            }),
        })

        expect(action).toMatchObject({ type: 'open_pull_request' })
        if (action.type !== 'open_pull_request') throw new Error(action.type)
        expect(action.body).toContain(
            '- Closes #11: Add sum (already done before this run, by 3559c25)'
        )
        expect(action.body).toContain('- Closes #12: Add product')
    })
})

describe("decision step: the engine checks a test-writer's already-done evidence (#495)", () => {
    const answered = [
        runBranchCreated(),
        ticketWorktreeCreated({ ticket: 11 }),
        baselineTests({ ticket: 11 }),
        alreadyDone({ ticket: 11 }),
    ]
    const at = (entries: JournalEntry[]) =>
        decide({ records: recordsAfter({ tickets: [SUM], entries }) })
    const NOT_FOUND = `commit ${DONE_SHA}: not found in the repo`

    test("before the ticket counts as done, the engine checks the commits and the named tests on the ticket's base", () => {
        expect(at(answered)).toEqual({
            type: 'check_already_done',
            ticket: 11,
            base_sha: 'b0',
            criteria_ids: ['AC1'],
            done_by: [{ sha: DONE_SHA, title: 'feat: add sum' }],
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
        })
    })

    test('evidence that does not check out is a failed try: the test-writer hears what failed, in its session', () => {
        const action = at([
            ...answered,
            alreadyDoneChecked({ ticket: 11, problems: [NOT_FOUND] }),
        ])

        expect(action).toMatchObject({
            type: 'follow_up_agent',
            ticket: 11,
            role: 'test-writer',
            session_id: SESSIONS['test-writer'],
        })
        if (action.type !== 'follow_up_agent') throw new Error(action.type)
        expect(action.message).toContain('"already_done"')
        expect(action.message).toContain(NOT_FOUND)
        expect(action.message).toContain('"tests_written"')
        expect(action.message).not.toContain('undid')
    })

    test('a new "already done" answer is checked again, and tests written go to the red check', () => {
        const failed = [
            ...answered,
            alreadyDoneChecked({ ticket: 11, problems: [NOT_FOUND] }),
        ]

        expect(at([...failed, alreadyDone({ ticket: 11 })])).toMatchObject({
            type: 'check_already_done',
            ticket: 11,
        })
        expect(at([...failed, testsWritten({ ticket: 11 })])).toMatchObject({
            type: 'run_red_check',
            ticket: 11,
        })
    })

    test('when the failed tries run out, the ticket is stuck with what did not check out', () => {
        const failing =
            '"sum adds two numbers" in src/sum.test.ts: fails on the base'
        const action = at([
            ...answered,
            alreadyDoneChecked({ ticket: 11, problems: [NOT_FOUND] }),
            alreadyDone({ ticket: 11 }),
            alreadyDoneChecked({ ticket: 11, problems: [NOT_FOUND] }),
            alreadyDone({ ticket: 11 }),
            alreadyDoneChecked({ ticket: 11, problems: [failing] }),
        ])

        expect(action).toMatchObject({
            type: 'mark_stuck',
            ticket: 11,
            reason: 'agent_failed',
        })
        if (action.type !== 'mark_stuck') throw new Error(action.type)
        expect(action.detail).toContain('test-writer failed 3 tries')
        expect(action.detail).toContain(failing)
    })
})

describe('decision step: nothing new to test is only the refactor case', () => {
    test('the stuck detail and the spec comment speak only to a refactor', () => {
        const entries = [
            runBranchCreated(),
            ticketWorktreeCreated({ ticket: 11 }),
            baselineTests({ ticket: 11 }),
            nothingNewToTest({ ticket: 11 }),
        ]
        const stuck = decide({
            records: recordsAfter({ tickets: [SUM], entries }),
        })
        expect(stuck).toMatchObject({
            type: 'mark_stuck',
            reason: 'nothing_new_to_test',
        })
        if (stuck.type !== 'mark_stuck') throw new Error(stuck.type)
        expect(stuck.detail).toContain('changes no behavior')
        expect(stuck.detail).toContain('`refactor` label')
        expect(stuck.detail).not.toMatch(/already|otherwise/i)

        const report = decide({
            records: recordsAfter({
                tickets: [SUM],
                entries: [
                    ...entries,
                    ticketStuck({
                        ticket: 11,
                        reason: 'nothing_new_to_test',
                        detail: stuck.detail,
                    }),
                ],
            }),
        })
        expect(report).toMatchObject({ type: 'report_stuck', ticket: 11 })
        if (report.type !== 'report_stuck') throw new Error(report.type)
        expect(report.body).toContain('add the `refactor` label')
        expect(report.body).not.toMatch(/already|otherwise/i)
    })
})
