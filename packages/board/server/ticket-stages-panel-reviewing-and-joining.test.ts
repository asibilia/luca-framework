import { afterEach, describe, expect, test } from 'bun:test'

import {
    finding,
    fixerFinished,
    gatesRun,
    joinClashed,
    reviewFinished,
    runBranchPushed,
    ticketJoined,
    ticketRebased,
    wholeTicket,
} from './testing/journal-fixtures'
import {
    harness,
    runWith,
    sendMore,
    stepStarted,
    stepEnded,
    wholeStep,
    agentTurnStarts,
    agentTurnEnds,
    gatesStart,
    gatesEnd,
    blockerOnly,
    type Checkpoint,
    stagesAlong,
    expectedAlong,
    stageOf,
    reviewedOnce,
    approved,
    T,
} from './ticket-stages-panel-helpers'

/**
 * The ticket's stage (#549) around reviewing and joining: a clash on
 * joining, gates failing after joining, and "reviewing" showing only while a
 * reviewer agent works. The helpers are in `ticket-stages-panel-helpers.ts`;
 * the other topics are in the `ticket-stages-panel-*.test.ts` files beside
 * this one.
 */

afterEach(async () => {
    await harness.cleanup()
})

describe('a ticket shows what it is really doing', () => {
    test('a clash on joining is fixed on top of the run branch, then tested and reviewed again', async () => {
        await runWith({ entries: approved({ ticket: T }) })
        const checkpoints: Checkpoint[] = [
            {
                at: 'joining the run branch',
                entries: [stepStarted({ ticket: T, step: 'join_run_branch' })],
                stage: 'joining',
            },
            {
                at: 'sent back onto the run branch',
                entries: [
                    joinClashed({ ticket: T }),
                    stepEnded({ ticket: T, step: 'join_run_branch' }),
                    ...wholeStep({
                        ticket: T,
                        step: 'rebase_ticket',
                        entries: [
                            ticketRebased({
                                ticket: T,
                                cause: 'clash',
                                code: ['src/index.ts'],
                            }),
                        ],
                    }),
                ],
                stage: 'fixing',
            },
            {
                at: 'gates run on the rebased ticket',
                entries: [
                    ...agentTurnStarts({
                        ticket: T,
                        role: 'implementer',
                        follow_up: true,
                    }),
                    ...agentTurnEnds({
                        ticket: T,
                        role: 'implementer',
                        follow_up: true,
                    }),
                    gatesStart({ ticket: T }),
                ],
                stage: 'testing',
            },
            {
                at: 'a fresh reviewer reviews',
                entries: [
                    ...gatesEnd({ ticket: T, ok: true }),
                    ...agentTurnStarts({ ticket: T, role: 'ticket-reviewer' }),
                ],
                stage: 'reviewing',
            },
        ]

        expect(await stagesAlong({ ticket: T, checkpoints })).toEqual(
            expectedAlong({ checkpoints })
        )
    })

    test('gates failing after joining send the ticket from joining to fixing', async () => {
        await runWith({ entries: approved({ ticket: T }) })
        const checkpoints: Checkpoint[] = [
            {
                at: 'gates run on the run branch',
                entries: [
                    ...wholeStep({
                        ticket: T,
                        step: 'join_run_branch',
                        entries: [ticketJoined({ ticket: T })],
                    }),
                    gatesStart({ ticket: T }),
                ],
                stage: 'joining',
            },
            {
                at: 'sent back after the failed gates',
                entries: [
                    ...gatesEnd({ ticket: T, ok: false, target: 'run_branch' }),
                    ...wholeStep({
                        ticket: T,
                        step: 'rebase_ticket',
                        entries: [
                            ticketRebased({ ticket: T, cause: 'join_gates' }),
                        ],
                    }),
                ],
                stage: 'fixing',
            },
        ]

        expect(await stagesAlong({ ticket: T, checkpoints })).toEqual(
            expectedAlong({ checkpoints })
        )
    })
})

describe('"reviewing" shows only while a reviewer agent works', () => {
    test('the stage leaves reviewing once the reviewer finishes', async () => {
        await runWith({ entries: reviewedOnce({ ticket: T }) })
        expect(await stageOf({ ticket: T })).toBe('reviewing')

        await sendMore({
            entries: [reviewFinished({ ticket: T, findings: blockerOnly })],
        })

        expect(await stageOf({ ticket: T })).not.toBe('reviewing')
    })

    test('a review fix round shows fixing for both fixers, not reviewing', async () => {
        await runWith({
            entries: [
                ...reviewedOnce({ ticket: T }),
                ...agentTurnEnds({
                    ticket: T,
                    role: 'ticket-reviewer',
                    finished: reviewFinished({
                        ticket: T,
                        findings: [
                            finding({ id: 'R1-1', severity: 'blocker' }),
                            finding({
                                id: 'R1-2',
                                severity: 'should_fix',
                                kind: 'test',
                            }),
                        ],
                    }),
                }),
                ...agentTurnStarts({ ticket: T, role: 'test-writer' }),
            ],
        })
        expect(await harness.ticket({ number: T })).toMatchObject({
            stage: 'fixing',
            role: 'test-writer',
            review_fix_round: 1,
        })

        await sendMore({
            entries: [
                ...agentTurnEnds({
                    ticket: T,
                    role: 'test-writer',
                    finished: fixerFinished({
                        ticket: T,
                        role: 'test-writer',
                        responses: [
                            {
                                finding_id: 'R1-2',
                                response: 'fixed',
                                reason: '',
                            },
                        ],
                    }),
                }),
                ...agentTurnStarts({
                    ticket: T,
                    role: 'implementer',
                    follow_up: true,
                }),
            ],
        })
        expect(await harness.ticket({ number: T })).toMatchObject({
            stage: 'fixing',
            role: 'implementer',
            review_fix_round: 1,
        })
    })

    test('failed gates inside a review fix round show testing, then fixing, never reviewing', async () => {
        await runWith({
            entries: [
                ...reviewedOnce({ ticket: T }),
                ...agentTurnEnds({
                    ticket: T,
                    role: 'ticket-reviewer',
                    finished: reviewFinished({
                        ticket: T,
                        findings: blockerOnly,
                    }),
                }),
                ...agentTurnStarts({
                    ticket: T,
                    role: 'implementer',
                    follow_up: true,
                }),
                ...agentTurnEnds({
                    ticket: T,
                    role: 'implementer',
                    follow_up: true,
                }),
            ],
        })
        const checkpoints: Checkpoint[] = [
            {
                at: 'gates run on the review fixes',
                entries: [gatesStart({ ticket: T })],
                stage: 'testing',
            },
            {
                at: 'implementer fixes the failed gates',
                entries: [
                    ...gatesEnd({ ticket: T, ok: false }),
                    ...agentTurnStarts({
                        ticket: T,
                        role: 'implementer',
                        follow_up: true,
                    }),
                ],
                stage: 'fixing',
            },
        ]

        expect(await stagesAlong({ ticket: T, checkpoints })).toEqual(
            expectedAlong({ checkpoints })
        )
    })

    test('an approved ticket shows joining, not reviewing, while it joins', async () => {
        await runWith({ entries: approved({ ticket: T }) })
        expect(await stageOf({ ticket: T })).not.toBe('reviewing')

        await sendMore({
            entries: [stepStarted({ ticket: T, step: 'join_run_branch' })],
        })

        expect(await stageOf({ ticket: T })).toBe('joining')
    })

    test('without step records, a joined ticket shows joining until it is pushed', async () => {
        await runWith({
            entries: [
                ...wholeTicket({ ticket: T }).slice(0, 17),
                ticketJoined({ ticket: T }),
            ],
        })
        expect(await stageOf({ ticket: T })).toBe('joining')

        await sendMore({
            entries: [
                gatesRun({ ticket: T, ok: true, target: 'run_branch' }),
                runBranchPushed({ ticket: T }),
            ],
        })
        expect(await stageOf({ ticket: T })).toBe('done')
    })
})
