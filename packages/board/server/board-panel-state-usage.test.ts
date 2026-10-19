import { afterEach, describe, expect, test } from 'bun:test'

import {
    harness,
    runWith,
    rowsOfKind,
    eventRows,
} from './board-panel-state-helpers'
import {
    agentSession,
    rateLimit,
    runStopped,
    ticketWorktreeCreated,
    unifiedRateLimit,
    usageRecorded,
} from './testing/journal-fixtures'

import { planUsedText } from '../shared/board-state'

/**
 * The board's panel state for plan usage: the rate-limit readings in agent
 * sessions, and the plan a ticket and the run used. The helpers are in
 * `board-panel-state-helpers.ts`; the other topics are in the
 * `board-panel-state-*.test.ts` files beside this one.
 */

afterEach(async () => {
    await harness.cleanup()
})

describe('plan usage, from the rate-limit readings in agent sessions', () => {
    test.each([
        [0.59, 59, 'ok'],
        [0.6, 60, 'warn'],
        [0.85, 85, 'warn'],
        [0.86, 86, 'high'],
    ])(
        'a five-hour utilization of %d reads as %d%% (%s)',
        async (utilization, percent, level) => {
            await runWith({
                entries: [
                    ticketWorktreeCreated({ ticket: 11 }),
                    agentSession({
                        ticket: 11,
                        role: 'implementer',
                        rate_limits: [
                            rateLimit({ type: 'five_hour', utilization }),
                            rateLimit({ type: 'seven_day', utilization: 0.1 }),
                        ],
                    }),
                ],
            })

            expect((await harness.state()).usage).toMatchObject({
                five_hour_percent: percent,
                five_hour_level: level,
                weekly_percent: 10,
                weekly_level: 'ok',
            })
            const header = rowsOfKind({ kind: 'luca-board-run' })[0]?.row
            expect(header).toMatchObject({
                data: { usage: { five_hour_level: level } },
            })
        }
    )

    test('each window keeps its latest reading, and the five-hour one says when it resets', async () => {
        const resets_at = '2026-09-23T17:00:00.000Z'
        await runWith({
            entries: [
                ticketWorktreeCreated({ ticket: 11 }),
                agentSession({
                    ticket: 11,
                    role: 'test-writer',
                    rate_limits: [
                        rateLimit({ type: 'seven_day_opus', utilization: 0.3 }),
                    ],
                }),
                agentSession({
                    ticket: 11,
                    role: 'implementer',
                    rate_limits: [
                        rateLimit({
                            type: 'five_hour',
                            utilization: 0.2,
                            resets_at,
                        }),
                        rateLimit({
                            type: 'five_hour',
                            utilization: 0.25,
                            resets_at,
                        }),
                    ],
                }),
                // A session with no readings changes nothing.
                agentSession({ ticket: 11, role: 'ticket-reviewer' }),
            ],
        })

        expect((await harness.state()).usage).toEqual({
            five_hour_percent: 25,
            weekly_percent: 30,
            five_hour_level: 'ok',
            weekly_level: 'ok',
            resets_at,
            read_at: expect.any(String),
        })
    })

    test('a window with no reading yet stays unknown', async () => {
        await runWith({
            entries: [
                ticketWorktreeCreated({ ticket: 11 }),
                agentSession({
                    ticket: 11,
                    role: 'implementer',
                    rate_limits: [
                        rateLimit({ type: 'seven_day', utilization: 0.4 }),
                    ],
                }),
            ],
        })

        expect((await harness.state()).usage).toMatchObject({
            five_hour_percent: null,
            five_hour_level: null,
            weekly_percent: 40,
        })
    })

    test("a real run's reading sets both windows from unifiedWindows", async () => {
        const five_hour_resets = '2026-09-23T17:00:00.000Z'
        await runWith({
            entries: [
                ticketWorktreeCreated({ ticket: 11 }),
                agentSession({
                    ticket: 11,
                    role: 'implementer',
                    rate_limits: [
                        unifiedRateLimit({
                            windows: {
                                five_hour: {
                                    utilization: 0.03,
                                    resets_at: five_hour_resets,
                                },
                                seven_day: {
                                    utilization: 0.17,
                                    resets_at: '2026-09-26T09:00:00.000Z',
                                },
                            },
                        }),
                    ],
                }),
            ],
        })

        expect((await harness.state()).usage).toEqual({
            five_hour_percent: 3,
            weekly_percent: 17,
            five_hour_level: 'ok',
            weekly_level: 'ok',
            resets_at: five_hour_resets,
            read_at: expect.any(String),
        })
    })

    test('the tightest weekly window in a reading sets the weekly percent', async () => {
        await runWith({
            entries: [
                ticketWorktreeCreated({ ticket: 11 }),
                agentSession({
                    ticket: 11,
                    role: 'implementer',
                    rate_limits: [
                        unifiedRateLimit({
                            windows: {
                                seven_day: { utilization: 0.17 },
                                seven_day_opus: { utilization: 0.62 },
                                seven_day_sonnet: { utilization: 0.05 },
                            },
                        }),
                    ],
                }),
            ],
        })

        expect((await harness.state()).usage).toMatchObject({
            five_hour_percent: null,
            weekly_percent: 62,
            weekly_level: 'warn',
        })
    })

    test('a reading with no utilization anywhere changes nothing', async () => {
        await runWith({
            entries: [
                ticketWorktreeCreated({ ticket: 11 }),
                agentSession({
                    ticket: 11,
                    role: 'implementer',
                    rate_limits: [unifiedRateLimit({ windows: {} })],
                }),
            ],
        })
        expect((await harness.state()).usage).toBeNull()
    })

    test('no reading yet means no usage', async () => {
        await runWith({ entries: [] })
        expect((await harness.state()).usage).toBeNull()
    })
})

describe('plan used by a ticket and by the run', () => {
    test("a ticket's usage record shows on its card, windows in order, with no row", async () => {
        await runWith({
            entries: [
                ticketWorktreeCreated({ ticket: 11 }),
                usageRecorded({
                    ticket: 11,
                    windows: {
                        seven_day_opus: { from: 20, to: 22.4, used: 2.4 },
                        extra: { from: 0, to: 5, used: 5 },
                        seven_day: { from: 10, to: 10.6, used: 0.6 },
                        five_hour: { from: 3, to: 4.4, used: 1.4 },
                    },
                }),
            ],
        })
        expect((await harness.ticket({ number: 11 })).plan_used).toEqual([
            { window: 'five-hour', percent: 1 },
            { window: 'weekly', percent: 1 },
            { window: 'weekly Opus', percent: 2 },
            { window: 'extra', percent: 5 },
        ])
        // No chat row: the last event row is still the worktree's.
        expect(eventRows().at(-1)?.text).toBe('#11: started.')
    })

    test("a retried ticket's latest usage record is its whole usage: it replaces the earlier one", async () => {
        await runWith({
            entries: [
                ticketWorktreeCreated({ ticket: 11 }),
                usageRecorded({
                    ticket: 11,
                    windows: { five_hour: { from: 1, to: 2, used: 1 } },
                }),
                usageRecorded({
                    ticket: 11,
                    windows: { five_hour: { from: 1, to: 4, used: 3 } },
                }),
            ],
        })
        expect((await harness.ticket({ number: 11 })).plan_used).toEqual([
            { window: 'five-hour', percent: 3 },
        ])
    })

    test("the run's usage record sets the run total; tickets keep theirs", async () => {
        await runWith({
            entries: [
                ticketWorktreeCreated({ ticket: 11 }),
                usageRecorded({
                    ticket: 11,
                    windows: { five_hour: { from: 1, to: 2, used: 1 } },
                }),
                usageRecorded({
                    ticket: null,
                    windows: {
                        seven_day: { from: 10, to: 11, used: 1 },
                        five_hour: { from: 0, to: 3, used: 3 },
                    },
                }),
            ],
        })

        const state = await harness.state()
        expect(state.run_plan_used).toEqual([
            { window: 'five-hour', percent: 3 },
            { window: 'weekly', percent: 1 },
        ])
        expect(state.tickets.find((t) => t.number === 11)?.plan_used).toEqual([
            { window: 'five-hour', percent: 1 },
        ])
        expect(state.tickets.find((t) => t.number === 13)?.plan_used).toEqual(
            []
        )
    })

    test('a usage record after a stop keeps the stop', async () => {
        await runWith({
            entries: [
                runStopped({ ticket: null, role: null, reason: 'x' }),
                usageRecorded({
                    ticket: null,
                    windows: { five_hour: { from: 0, to: 3, used: 3 } },
                }),
            ],
        })
        expect((await harness.state()).run.status).toBe('stopped')
    })

    test('the plan used in words', () => {
        const used = [
            { window: 'five-hour', percent: 1 },
            { window: 'weekly', percent: 0 },
        ]
        expect(planUsedText({ used, sign: '+' })).toBe(
            'five-hour +1%, weekly +0%'
        )
        expect(planUsedText({ used, sign: '' })).toBe('five-hour 1%, weekly 0%')
    })
})
