import { afterEach, describe, expect, test } from 'bun:test'

import {
    engineFinalFixerTurn,
    engineFinalFixesLanded,
    engineFinalReviewStarted,
    engineLensTurn,
    finalReviewFixing,
    finalReviewPassed,
    finding,
    pullRequestOpened,
    redCheck,
    reviewFinished,
    ticketStuck,
    ticketWorktreeCreated,
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
    stageOf,
    testsCommitted,
    reviewedOnce,
    approved,
    joinedAndPushed,
    refactorDone,
    T,
} from './ticket-stages-panel-helpers'

/**
 * The ticket's stage (#549) in the final review and the run status, and the
 * run's header row. The helpers are in `ticket-stages-panel-helpers.ts`; the
 * other topics are in the `ticket-stages-panel-*.test.ts` files beside this
 * one.
 */

afterEach(async () => {
    await harness.cleanup()
})

describe("the final review's states and the run status", () => {
    test('the run is not stuck while another ticket is testing, fixing or joining', async () => {
        await runWith({
            entries: [
                ticketWorktreeCreated({ ticket: 11 }),
                ticketStuck({ ticket: 11, reason: 'agent_failed', detail: '' }),
                ticketWorktreeCreated({ ticket: T }),
                ...agentTurnStarts({ ticket: T, role: 'test-writer' }),
                ...agentTurnEnds({ ticket: T, role: 'test-writer' }),
                stepStarted({ ticket: T, step: 'run_red_check' }),
            ],
        })
        expect(await stageOf({ ticket: T })).toBe('testing')
        expect((await harness.state()).run.status).toBe('building')

        await sendMore({
            entries: [
                redCheck({ ticket: T, ok: false, failing: 0, passing: 4 }),
                stepEnded({ ticket: T, step: 'run_red_check' }),
                ...agentTurnStarts({
                    ticket: T,
                    role: 'test-writer',
                    follow_up: true,
                }),
            ],
        })
        expect(await stageOf({ ticket: T })).toBe('fixing')
        expect((await harness.state()).run.status).toBe('building')

        await sendMore({
            entries: [
                ...agentTurnEnds({
                    ticket: T,
                    role: 'test-writer',
                    follow_up: true,
                }),
                ...wholeStep({
                    ticket: T,
                    step: 'run_red_check',
                    entries: [
                        redCheck({
                            ticket: T,
                            ok: true,
                            failing: 2,
                            passing: 4,
                        }),
                    ],
                }),
                ...committed({ ticket: T, stage: 'red' }),
                ...agentTurnStarts({ ticket: T, role: 'implementer' }),
                ...agentTurnEnds({ ticket: T, role: 'implementer' }),
                gatesStart({ ticket: T }),
                ...gatesEnd({ ticket: T, ok: true }),
                ...committed({ ticket: T, stage: 'green' }),
                ...agentTurnStarts({ ticket: T, role: 'ticket-reviewer' }),
                ...agentTurnEnds({
                    ticket: T,
                    role: 'ticket-reviewer',
                    finished: reviewFinished({ ticket: T }),
                }),
                stepStarted({ ticket: T, step: 'join_run_branch' }),
            ],
        })
        expect(await stageOf({ ticket: T })).toBe('joining')
        expect((await harness.state()).run.status).toBe('building')
    })

    test('a run whose tickets used the new stages reviews and ships as before', async () => {
        await runWith({
            entries: [
                ...refactorDone(),
                ...approved({ ticket: T }),
                ...joinedAndPushed({ ticket: T }),
            ],
        })
        await sendMore({
            entries: [
                ...testsCommitted({ ticket: 12 }),
                ...agentTurnStarts({ ticket: 12, role: 'implementer' }),
                ...agentTurnEnds({ ticket: 12, role: 'implementer' }),
                gatesStart({ ticket: 12 }),
                ...gatesEnd({ ticket: 12, ok: true }),
                ...committed({ ticket: 12, stage: 'green' }),
                ...agentTurnStarts({ ticket: 12, role: 'ticket-reviewer' }),
                ...agentTurnEnds({
                    ticket: 12,
                    role: 'ticket-reviewer',
                    finished: reviewFinished({ ticket: 12 }),
                }),
                // Joined, its gates on the run branch running.
                ...joinedAndPushed({ ticket: 12 }).slice(0, -5),
            ],
        })
        const joining = await harness.state()
        expect(await stageOf({ ticket: 12 })).toBe('joining')
        expect(joining.final_review).toMatchObject({
            state: 'waiting',
            active: false,
        })
        expect(joining.run.status).toBe('building')

        await sendMore({ entries: joinedAndPushed({ ticket: 12 }).slice(-5) })
        const built = await harness.state()
        expect(
            built.tickets.map(({ number, stage }) => [number, stage])
        ).toEqual([
            [11, 'done'],
            [12, 'done'],
            [13, 'done'],
        ])
        expect(built.final_review).toMatchObject({
            state: 'waiting',
            active: true,
        })

        await sendMore({
            entries: [
                engineFinalReviewStarted({ round: 1, lenses: ['security'] }),
                stepStarted({
                    ticket: null,
                    step: 'launch_lens:security-lens',
                }),
                ...engineLensTurn({
                    lens: 'security',
                    round: 1,
                    findings: [finding({ id: 'S1', severity: 'blocker' })],
                }),
                stepEnded({ ticket: null, step: 'launch_lens:security-lens' }),
            ],
        })
        const reviewing = await harness.state()
        expect(reviewing.run.status).toBe('final_review')
        expect(reviewing.final_review).toMatchObject({ round: 1 })

        await sendMore({
            entries: [
                stepStarted({ ticket: null, step: 'start_final_fix' }),
                finalReviewFixing({ round: 1 }),
                stepEnded({ ticket: null, step: 'start_final_fix' }),
                ...engineFinalFixerTurn({
                    role: 'implementer',
                    responses: [
                        { finding_id: 'S1', response: 'fixed', reason: '' },
                    ],
                }),
                stepStarted({ ticket: null, step: 'run_final_gates' }),
            ],
        })
        const fixing = await harness.state()
        expect(fixing.final_review).toMatchObject({
            state: 'fixing',
            fix_round: 1,
        })
        expect(fixing.run.status).toBe('final_review')

        await sendMore({
            entries: [
                ...engineFinalFixesLanded({ round: 1 }),
                stepEnded({ ticket: null, step: 'run_final_gates' }),
                finalReviewPassed(),
                pullRequestOpened({
                    number: 77,
                    url: 'https://github.com/o/r/pull/77',
                }),
            ],
        })
        const shipped = await harness.state()
        expect(shipped.final_review.state).toBe('passed')
        expect(shipped.run.status).toBe('done')
        expect(
            shipped.tickets.map(({ number, stage }) => [number, stage])
        ).toEqual([
            [11, 'done'],
            [12, 'done'],
            [13, 'done'],
        ])
    })
})

describe("the run's header row", () => {
    test('counts the tickets by what they are really doing', async () => {
        await runWith({
            entries: [
                ticketWorktreeCreated({ ticket: 11 }),
                ...agentTurnStarts({ ticket: 11, role: 'implementer' }),
                ...agentTurnEnds({ ticket: 11, role: 'implementer' }),
                gatesStart({ ticket: 11 }),
                ...reviewedOnce({ ticket: T }),
            ],
        })

        const header = harness
            .latestRows()
            .find(({ row }) => row.kind === 'luca-board-run')?.row
        expect(header).toMatchObject({
            data: {
                counts: [
                    { stage: 'blocked', count: 1 },
                    { stage: 'reviewing', count: 1 },
                    { stage: 'testing', count: 1 },
                ],
            },
        })
    })
})
