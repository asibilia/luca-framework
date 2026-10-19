import { afterEach, describe, expect, test } from 'bun:test'

import {
    agentFailed,
    replyReceived,
    reviewFinished,
    runBranchPushed,
    ticketJoined,
    ticketRetried,
    ticketStuck,
    ticketWorktreeCreated,
    unshownStuckRecord,
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
    committed,
    gatesStart,
    gatesEnd,
    type Checkpoint,
    stagesAlong,
    expectedAlong,
    stageOf,
    testsCommitted,
    reviewedOnce,
    approved,
    refactorDone,
    T,
} from './ticket-stages-panel-helpers'

/**
 * The ticket's stage (#549) for a stuck ticket, and for a refactor ticket
 * (no test-writer, no red check). The helpers are in
 * `ticket-stages-panel-helpers.ts`; the other topics are in the
 * `ticket-stages-panel-*.test.ts` files beside this one.
 */

afterEach(async () => {
    await harness.cleanup()
})

describe('a stuck ticket', () => {
    test('shows stuck until a reply, then what it does next', async () => {
        await runWith({
            entries: [
                ...testsCommitted({ ticket: T }),
                ...agentTurnStarts({ ticket: T, role: 'implementer' }),
                ...agentTurnEnds({ ticket: T, role: 'implementer' }),
                gatesStart({ ticket: T }),
                ...gatesEnd({ ticket: T, ok: false }),
                stepStarted({ ticket: T, step: 'mark_stuck' }),
                ticketStuck({
                    ticket: T,
                    reason: 'gates_failed',
                    detail: 'bun test: 1 test fails',
                }),
                stepEnded({ ticket: T, step: 'mark_stuck' }),
            ],
        })
        const checkpoints: Checkpoint[] = [
            {
                at: 'the spec issue is told',
                entries: [
                    ...wholeStep({
                        ticket: T,
                        step: 'report_stuck',
                        entries: [
                            unshownStuckRecord({ kind: 'stuck_reported' }),
                        ],
                    }),
                ],
                stage: 'stuck',
            },
            {
                at: 'implementer fixes after the retry',
                entries: [
                    ...wholeStep({
                        ticket: null,
                        step: 'take_reply',
                        entries: [replyReceived({ word: 'retry', ticket: T })],
                    }),
                    ...wholeStep({
                        ticket: T,
                        step: 'retry_ticket',
                        entries: [ticketRetried({ ticket: T, mode: 'resume' })],
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

        expect(await stageOf({ ticket: T })).toBe('stuck')
        expect(await stagesAlong({ ticket: T, checkpoints })).toEqual(
            expectedAlong({ checkpoints })
        )
    })

    test('a ticket stuck in its review shows reviewing again once retried', async () => {
        await runWith({
            entries: [
                ...reviewedOnce({ ticket: T }),
                agentFailed({
                    ticket: T,
                    role: 'ticket-reviewer',
                    error: 'The turn ran out.',
                }),
                stepEnded({
                    ticket: T,
                    step: 'launch_agent:ticket-reviewer',
                    role: 'ticket-reviewer',
                }),
                ticketStuck({
                    ticket: T,
                    reason: 'agent_failed',
                    detail: 'The ticket-reviewer failed.',
                }),
            ],
        })
        expect(await stageOf({ ticket: T })).toBe('stuck')

        await sendMore({
            entries: [
                replyReceived({ word: 'retry', ticket: T }),
                ticketRetried({ ticket: T, mode: 'resume' }),
                ...agentTurnStarts({ ticket: T, role: 'ticket-reviewer' }),
            ],
        })

        expect(await stageOf({ ticket: T })).toBe('reviewing')

        await sendMore({
            entries: [
                ...agentTurnEnds({
                    ticket: T,
                    role: 'ticket-reviewer',
                    finished: reviewFinished({ ticket: T }),
                }),
                stepStarted({ ticket: T, step: 'join_run_branch' }),
            ],
        })

        expect(await stageOf({ ticket: T })).toBe('joining')
    })

    test('a ticket stuck after joining stays stuck while its join is undone', async () => {
        await runWith({
            entries: [
                ...approved({ ticket: T }),
                ...wholeStep({
                    ticket: T,
                    step: 'join_run_branch',
                    entries: [ticketJoined({ ticket: T })],
                }),
                gatesStart({ ticket: T }),
            ],
        })
        expect(await stageOf({ ticket: T })).toBe('joining')

        await sendMore({
            entries: [
                ...gatesEnd({ ticket: T, ok: false, target: 'run_branch' }),
                ticketStuck({
                    ticket: T,
                    reason: 'join_gates_failed',
                    detail: 'The gates still fail after joining.',
                }),
            ],
        })
        expect(await stageOf({ ticket: T })).toBe('stuck')

        await sendMore({
            entries: wholeStep({ ticket: T, step: 'undo_join', entries: [] }),
        })

        expect(await stageOf({ ticket: T })).toBe('stuck')
    })
})

describe('a refactor ticket (no test-writer, no red check)', () => {
    test('goes building, testing, reviewing, joining, done', async () => {
        await runWith({ entries: [] })
        const checkpoints: Checkpoint[] = [
            {
                at: 'worktree created',
                entries: [ticketWorktreeCreated({ ticket: 11 })],
                stage: 'building',
            },
            {
                at: 'implementer codes',
                entries: agentTurnStarts({ ticket: 11, role: 'implementer' }),
                stage: 'building',
            },
            {
                at: 'gates run',
                entries: [
                    ...agentTurnEnds({ ticket: 11, role: 'implementer' }),
                    gatesStart({ ticket: 11 }),
                ],
                stage: 'testing',
            },
            {
                at: 'reviewer reviews',
                entries: [
                    ...gatesEnd({ ticket: 11, ok: true }),
                    ...committed({ ticket: 11, stage: 'green' }),
                    ...agentTurnStarts({ ticket: 11, role: 'ticket-reviewer' }),
                ],
                stage: 'reviewing',
            },
            {
                at: 'joining the run branch',
                entries: [
                    ...agentTurnEnds({
                        ticket: 11,
                        role: 'ticket-reviewer',
                        finished: reviewFinished({ ticket: 11 }),
                    }),
                    stepStarted({ ticket: 11, step: 'join_run_branch' }),
                ],
                stage: 'joining',
            },
            {
                at: 'pushed',
                entries: [
                    ticketJoined({ ticket: 11 }),
                    stepEnded({ ticket: 11, step: 'join_run_branch' }),
                    gatesStart({ ticket: 11 }),
                    ...gatesEnd({ ticket: 11, ok: true, target: 'run_branch' }),
                    ...wholeStep({
                        ticket: 11,
                        step: 'push_run_branch',
                        entries: [runBranchPushed({ ticket: 11 })],
                    }),
                ],
                stage: 'done',
            },
        ]

        expect(await stagesAlong({ ticket: 11, checkpoints })).toEqual(
            expectedAlong({ checkpoints })
        )
        expect(await harness.ticket({ number: 11 })).toMatchObject({
            refactor: true,
        })
    })

    test('its dependent stays blocked while it joins, and starts once it is done', async () => {
        // Up to the gates on the run branch: their result and the push left.
        await runWith({ entries: refactorDone().slice(0, -5) })
        expect(await stageOf({ ticket: 11 })).toBe('joining')
        expect(await stageOf({ ticket: 12 })).toBe('blocked')

        await sendMore({ entries: refactorDone().slice(-5) })

        expect(await stageOf({ ticket: 11 })).toBe('done')
        expect(await harness.ticket({ number: 12 })).toMatchObject({
            stage: 'building',
            activity: 'queued',
        })
    })
})
