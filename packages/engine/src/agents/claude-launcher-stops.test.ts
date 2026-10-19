import { describe, expect, test } from 'bun:test'

import {
    APPROVE,
    fakeQuery,
    INIT,
    launch,
    repoPerTest,
    result,
} from './claude-launcher-helpers'

/**
 * The launcher seam, the stops while the agent runs: a rejected plan limit,
 * a billing stop, a turn past its time. The helpers are in
 * `claude-launcher-helpers.ts`.
 */

repoPerTest()

describe('stops while the agent runs', () => {
    const cases: [string, unknown][] = [
        [
            'init with an API key',
            { ...INIT, apiKeySource: 'ANTHROPIC_API_KEY' },
        ],
        ['init with a Fable model', { ...INIT, model: 'claude-fable-5' }],
        [
            'init with a foreign MCP server',
            {
                ...INIT,
                mcp_servers: [{ name: 'muninn', status: 'connected' }],
            },
        ],
        [
            'init with a foreign MCP tool',
            { ...INIT, tools: [...INIT.tools, 'mcp__muninn__muninn_recall'] },
        ],
    ]
    test.each(cases)('stops on %s', async (_, message) => {
        const fake = fakeQuery({
            messages: [message, result({ structured_output: APPROVE })],
        })
        const turn = await launch({ query: fake.query })
        expect(turn).toMatchObject({ ok: false, failure: 'stop' })
        expect(fake.calls[0]?.closed).toBe(true)
    })

    const rateLimit = (info: Record<string, unknown>) => ({
        type: 'rate_limit_event',
        rate_limit_info: info,
    })
    const planCases: [string, unknown, Record<string, unknown>][] = [
        [
            'a rejected rate limit days away',
            rateLimit({
                status: 'rejected',
                rateLimitType: 'seven_day',
                resetsAt: 1790420400,
            }),
            {
                rate_limit_events: [
                    {
                        status: 'rejected',
                        rateLimitType: 'seven_day',
                        resetsAt: 1790420400,
                    },
                ],
            },
        ],
        [
            'overage in use',
            rateLimit({ status: 'allowed', isUsingOverage: true }),
            {
                rate_limit_events: [
                    { status: 'allowed', isUsingOverage: true },
                ],
            },
        ],
        [
            'overage flagged',
            rateLimit({ status: 'allowed', overageInUse: true }),
            {},
        ],
        [
            'an overage limit',
            rateLimit({ status: 'allowed', rateLimitType: 'overage' }),
            {},
        ],
        [
            'a billing error',
            {
                type: 'assistant',
                error: 'billing_error',
                message: { content: [] },
            },
            { billing_error: true },
        ],
    ]
    test.each(planCases)(
        'cuts the turn off as the plan on %s, with the reason in its session',
        async (_, message, session) => {
            const fake = fakeQuery({
                messages: [
                    INIT,
                    message,
                    result({ structured_output: APPROVE }),
                ],
            })
            const turn = await launch({ query: fake.query })
            expect(turn).toMatchObject({ ok: false, failure: 'plan' })
            expect(turn.session).toMatchObject(session)
            expect(fake.calls[0]?.closed).toBe(true)
        }
    )

    test('allowed and allowed_warning readings run on', async () => {
        const fake = fakeQuery({
            messages: [
                INIT,
                rateLimit({ status: 'allowed', rateLimitType: 'five_hour' }),
                rateLimit({
                    status: 'allowed_warning',
                    rateLimitType: 'seven_day',
                    utilization: 0.9,
                }),
                result({ structured_output: APPROVE }),
            ],
        })
        const turn = await launch({ query: fake.query })
        expect(turn).toMatchObject({ ok: true, structured_output: APPROVE })
        expect(turn.session?.rate_limit_events).toHaveLength(2)
    })

    test("an init with only the engine's own server and tools runs on", async () => {
        const fake = fakeQuery({
            messages: [
                {
                    ...INIT,
                    mcp_servers: [{ name: 'luca', status: 'connected' }],
                    tools: [...INIT.tools, 'mcp__luca__send_message'],
                },
                {
                    type: 'rate_limit_event',
                    rate_limit_info: {
                        status: 'allowed',
                        isUsingOverage: false,
                        overageStatus: 'rejected',
                    },
                },
                result({ structured_output: APPROVE }),
            ],
        })
        const turn = await launch({ query: fake.query })
        expect(turn).toMatchObject({ ok: true, structured_output: APPROVE })
    })
})
