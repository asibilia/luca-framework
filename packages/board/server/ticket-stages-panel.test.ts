import { afterEach, describe, expect, test } from 'bun:test'

import {
    baselineTests,
    dependenciesInstalled,
    fixerFinished,
    redCheck,
    reviewFinished,
    runBranchPushed,
    ticketJoined,
    ticketWorktreeCreated,
} from './testing/journal-fixtures'
import {
    harness,
    runWith,
    stepStarted,
    stepEnded,
    wholeStep,
    agentTurnStarts,
    agentTurnEnds,
    committed,
    gatesStart,
    gatesEnd,
    blockerOnly,
    type Checkpoint,
    stagesAlong,
    expectedAlong,
    testsCommitted,
    T,
} from './ticket-stages-panel-helpers'

/**
 * The ticket's stage (#549): what the ticket is really doing, from the
 * journal records the board already reads. "reviewing" shows only while a
 * reviewer agent works; the red check and the gates are "testing"; any fix
 * round is "fixing"; joining the run branch and its gates there are
 * "joining". The helpers are in `ticket-stages-panel-helpers.ts`; the other
 * topics are in the `ticket-stages-panel-*.test.ts` files beside this one.
 */

afterEach(async () => {
    await harness.cleanup()
})

describe('a ticket shows what it is really doing', () => {
    test('a normal ticket goes building, testing, reviewing, fixing, testing, reviewing, joining, done', async () => {
        await runWith({ entries: [] })
        const checkpoints: Checkpoint[] = [
            {
                at: 'worktree created',
                entries: [ticketWorktreeCreated({ ticket: T })],
                stage: 'building',
            },
            {
                at: 'install and baseline tests',
                entries: [
                    ...wholeStep({
                        ticket: T,
                        step: 'install_dependencies',
                        entries: [
                            dependenciesInstalled({ ticket: T, ok: true }),
                        ],
                    }),
                    ...wholeStep({
                        ticket: T,
                        step: 'run_baseline_tests',
                        entries: [baselineTests({ ticket: T, passed: 4 })],
                    }),
                ],
                stage: 'building',
            },
            {
                at: 'test-writer writes the tests',
                entries: agentTurnStarts({ ticket: T, role: 'test-writer' }),
                stage: 'building',
            },
            {
                at: 'red check runs',
                entries: [
                    ...agentTurnEnds({ ticket: T, role: 'test-writer' }),
                    stepStarted({ ticket: T, step: 'run_red_check' }),
                ],
                stage: 'testing',
            },
            {
                at: 'implementer codes',
                entries: [
                    redCheck({ ticket: T, ok: true, failing: 2, passing: 4 }),
                    stepEnded({ ticket: T, step: 'run_red_check' }),
                    ...committed({ ticket: T, stage: 'red' }),
                    ...agentTurnStarts({ ticket: T, role: 'implementer' }),
                ],
                stage: 'building',
            },
            {
                at: 'gates run',
                entries: [
                    ...agentTurnEnds({ ticket: T, role: 'implementer' }),
                    gatesStart({ ticket: T }),
                ],
                stage: 'testing',
            },
            {
                at: 'reviewer reviews',
                entries: [
                    ...gatesEnd({ ticket: T, ok: true }),
                    ...committed({ ticket: T, stage: 'green' }),
                    ...agentTurnStarts({ ticket: T, role: 'ticket-reviewer' }),
                ],
                stage: 'reviewing',
            },
            {
                at: "implementer fixes the review's findings",
                entries: [
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
                ],
                stage: 'fixing',
            },
            {
                at: 'gates run on the fixes',
                entries: [
                    ...agentTurnEnds({
                        ticket: T,
                        role: 'implementer',
                        follow_up: true,
                        finished: fixerFinished({
                            ticket: T,
                            role: 'implementer',
                            responses: [
                                {
                                    finding_id: 'R1-1',
                                    response: 'fixed',
                                    reason: '',
                                },
                            ],
                        }),
                    }),
                    gatesStart({ ticket: T }),
                ],
                stage: 'testing',
            },
            {
                at: 'reviewer reviews again',
                entries: [
                    ...gatesEnd({ ticket: T, ok: true }),
                    ...committed({ ticket: T, stage: 'fix' }),
                    ...agentTurnStarts({ ticket: T, role: 'ticket-reviewer' }),
                ],
                stage: 'reviewing',
            },
            {
                at: 'joining the run branch',
                entries: [
                    ...agentTurnEnds({
                        ticket: T,
                        role: 'ticket-reviewer',
                        finished: reviewFinished({ ticket: T }),
                    }),
                    stepStarted({ ticket: T, step: 'join_run_branch' }),
                ],
                stage: 'joining',
            },
            {
                at: 'joined, between steps',
                entries: [
                    ticketJoined({ ticket: T }),
                    stepEnded({ ticket: T, step: 'join_run_branch' }),
                ],
                stage: 'joining',
            },
            {
                at: 'gates run on the run branch',
                entries: [gatesStart({ ticket: T })],
                stage: 'joining',
            },
            {
                at: 'pushed',
                entries: [
                    ...gatesEnd({ ticket: T, ok: true, target: 'run_branch' }),
                    ...wholeStep({
                        ticket: T,
                        step: 'push_run_branch',
                        entries: [runBranchPushed({ ticket: T })],
                    }),
                ],
                stage: 'done',
            },
        ]

        expect(await stagesAlong({ ticket: T, checkpoints })).toEqual(
            expectedAlong({ checkpoints })
        )
    })

    test('failed gates send the ticket to fixing, and its next gates to testing', async () => {
        await runWith({
            entries: [
                ...testsCommitted({ ticket: T }),
                ...agentTurnStarts({ ticket: T, role: 'implementer' }),
                ...agentTurnEnds({ ticket: T, role: 'implementer' }),
                gatesStart({ ticket: T }),
                ...gatesEnd({ ticket: T, ok: false }),
            ],
        })
        const checkpoints: Checkpoint[] = [
            {
                at: 'implementer fixes the failed gates',
                entries: agentTurnStarts({
                    ticket: T,
                    role: 'implementer',
                    follow_up: true,
                }),
                stage: 'fixing',
            },
            {
                at: 'gates run again',
                entries: [
                    ...agentTurnEnds({
                        ticket: T,
                        role: 'implementer',
                        follow_up: true,
                    }),
                    gatesStart({ ticket: T }),
                ],
                stage: 'testing',
            },
        ]

        expect(await stagesAlong({ ticket: T, checkpoints })).toEqual(
            expectedAlong({ checkpoints })
        )
        expect(await harness.ticket({ number: T })).toMatchObject({
            fix_round: 1,
            open_check: 'gates',
        })
    })

    test('a failed red check sends the test-writer to fixing', async () => {
        await runWith({
            entries: [
                ticketWorktreeCreated({ ticket: T }),
                ...agentTurnStarts({ ticket: T, role: 'test-writer' }),
                ...agentTurnEnds({ ticket: T, role: 'test-writer' }),
                ...wholeStep({
                    ticket: T,
                    step: 'run_red_check',
                    entries: [
                        redCheck({
                            ticket: T,
                            ok: false,
                            failing: 0,
                            passing: 4,
                        }),
                    ],
                }),
                ...agentTurnStarts({
                    ticket: T,
                    role: 'test-writer',
                    follow_up: true,
                }),
            ],
        })

        expect(await harness.ticket({ number: T })).toMatchObject({
            stage: 'fixing',
            open_check: 'red_check',
            fix_round: 1,
        })
    })
})
