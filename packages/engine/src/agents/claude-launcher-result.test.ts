import { describe, expect, test } from 'bun:test'

import { createClaudeLauncher } from './claude-launcher'
import {
    APPROVE,
    CLAUDE_PATH,
    CONFIG,
    fakeQuery,
    IMPLEMENTER_DONE,
    INIT,
    launch,
    repo,
    repoPerTest,
    result,
} from './claude-launcher-helpers'
import { MAX_TURNS } from './claude-options'

/**
 * The launcher seam, the result of a turn: what a success, a failure, and a
 * stream with no result return, and the tokens a turn kept per model. The
 * helpers are in `claude-launcher-helpers.ts`.
 */

repoPerTest()

describe('the result', () => {
    test('a success returns its structured output and a session summary', async () => {
        const fake = fakeQuery({
            messages: [
                INIT,
                {
                    type: 'rate_limit_event',
                    rate_limit_info: { status: 'allowed', utilization: 0.2 },
                },
                result({
                    structured_output: APPROVE,
                    permission_denials: [
                        {
                            tool_name: 'Bash',
                            tool_use_id: 'tool-1',
                            tool_input: { command: 'curl x' },
                        },
                    ],
                }),
            ],
        })
        const turn = await launch({ query: fake.query })

        expect(turn).toMatchObject({
            ok: true,
            session_id: 'session-1',
            structured_output: APPROVE,
        })
        expect(turn.session).toMatchObject({
            session_id: 'session-1',
            model: 'claude-opus-5-5',
            claude_code_version: '2.1.280',
            api_key_source: 'none',
            subscription_type: 'max',
            num_turns: 3,
            usage: {
                input_tokens: 10,
                output_tokens: 20,
                cache_read_input_tokens: 30,
                cache_creation_input_tokens: 40,
            },
            total_cost_usd: 0.25,
            permission_denials: [{ tool_name: 'Bash', tool_use_id: 'tool-1' }],
            guard_denials: [],
            rate_limit_events: [{ status: 'allowed', utilization: 0.2 }],
        })
    })

    test('each plan-window reading is kept with its arrival time, fill level, and reset time', async () => {
        const reading = {
            status: 'allowed',
            rateLimitType: 'seven_day',
            resetsAt: 1790420400,
            unifiedWindows: {
                five_hour: { utilization: 0.4, resetsAt: 1790179800 },
                seven_day: { utilization: 0.62, resetsAt: 1790420400 },
            },
        }
        const fake = fakeQuery({
            messages: [
                INIT,
                { type: 'rate_limit_event', rate_limit_info: reading },
                {
                    type: 'rate_limit_event',
                    rate_limit_info: {
                        ...reading,
                        unifiedWindows: {
                            ...reading.unifiedWindows,
                            seven_day: {
                                utilization: 0.63,
                                resetsAt: 1790420400,
                            },
                        },
                    },
                },
                result({ structured_output: APPROVE }),
            ],
        })
        const before = Date.now()
        const turn = await launch({ query: fake.query })
        const after = Date.now()

        const events = turn.session?.rate_limit_events ?? []
        // Read the arrival times first: toMatchObject swaps matched values
        // for its matchers.
        const arrivals = events.map(({ arrived_at }) => {
            expect(typeof arrived_at).toBe('string')
            return Date.parse(String(arrived_at))
        })
        expect(events).toMatchObject([
            {
                ...reading,
                arrived_at: expect.any(String),
            },
            {
                unifiedWindows: {
                    five_hour: { utilization: 0.4, resetsAt: 1790179800 },
                    seven_day: { utilization: 0.63, resetsAt: 1790420400 },
                },
                arrived_at: expect.any(String),
            },
        ])
        for (const arrival of arrivals) {
            expect(arrival).toBeGreaterThanOrEqual(before)
            expect(arrival).toBeLessThanOrEqual(after)
        }
        expect(arrivals[1]).toBeGreaterThanOrEqual(arrivals[0] ?? Infinity)
    })

    test('a success with no structured output carries none, so the engine fails the try', async () => {
        const fake = fakeQuery({ messages: [INIT, result({})] })
        const turn = await launch({ query: fake.query })
        expect(turn.ok && turn.structured_output).toBeUndefined()
    })

    test.each([
        ['error_max_turns', ['Reached the maximum number of turns']],
        ['error_during_execution', ['Tool crashed']],
        ['error_max_structured_output_retries', ['Bad output']],
    ])("an %s result fails the agent's try", async (subtype, errors) => {
        const fake = fakeQuery({
            messages: [INIT, result({ subtype, is_error: true, errors })],
        })
        const turn = await launch({ query: fake.query })
        expect(turn).toMatchObject({
            ok: false,
            failure: 'agent',
            error: expect.stringContaining(subtype),
        })
    })

    test("only a turn that reached its role's turn limit is out of turns, whatever its error text says, and the limits are unchanged", async () => {
        const limited = fakeQuery({
            messages: [
                INIT,
                result({
                    subtype: 'error_max_turns',
                    is_error: true,
                    errors: ['It ran long.'],
                }),
            ],
        })
        const crashed = fakeQuery({
            messages: [
                INIT,
                result({
                    subtype: 'error_during_execution',
                    is_error: true,
                    errors: ['Reached the maximum number of turns (120)'],
                }),
            ],
        })

        const out = await launch({ query: limited.query, role: 'implementer' })
        const other = await launch({
            query: crashed.query,
            role: 'implementer',
        })

        expect(out).toMatchObject({
            ok: false,
            failure: 'agent',
            out_of_turns: true,
        })
        expect(other).toMatchObject({ ok: false, failure: 'agent' })
        expect(other).not.toMatchObject({ out_of_turns: true })
        expect(limited.calls[0]?.options.maxTurns).toBe(120)
        expect(MAX_TURNS).toEqual({
            'test-writer': 80,
            implementer: 120,
            'ticket-reviewer': 60,
            'architecture-lens': 60,
            'simplification-lens': 60,
            'security-lens': 60,
            'integration-lens': 60,
            'rules-lens': 60,
            learner: 40,
        })
    })

    test('an SDK that throws is an engine failure', async () => {
        const fake = fakeQuery({
            messages: [
                INIT,
                () => {
                    throw new Error('Claude Code process exited with code 1')
                },
            ],
        })
        const turn = await launch({ query: fake.query })
        expect(turn).toMatchObject({
            ok: false,
            failure: 'engine',
            error: expect.stringContaining('exited with code 1'),
        })
        expect(fake.calls[0]?.closed).toBe(true)
    })

    test('a stream that ends with no result is an engine failure', async () => {
        const fake = fakeQuery({ messages: [INIT] })
        const turn = await launch({ query: fake.query })
        expect(turn).toMatchObject({ ok: false, failure: 'engine' })
    })

    test("a turn past its time is interrupted and fails the agent's try", async () => {
        const fake = fakeQuery({ messages: [INIT], hang: true })
        const turn = await launch({ query: fake.query, turn_timeout_ms: 50 })
        expect(turn).toMatchObject({ ok: false, failure: 'agent' })
        expect(fake.calls[0]?.interrupted).toBe(true)
        expect(fake.calls[0]?.closed).toBe(true)
    })
})

/** One model's running totals, as the SDK's result `modelUsage` gives them. */
const modelTotals = ({
    input,
    output,
    cache_read,
    cache_creation,
}: {
    input: number
    output: number
    cache_read: number
    cache_creation: number
}) => ({
    inputTokens: input,
    outputTokens: output,
    cacheReadInputTokens: cache_read,
    cacheCreationInputTokens: cache_creation,
    webSearchRequests: 0,
    costUSD: 0.5,
    contextWindow: 200_000,
    maxOutputTokens: 32_000,
})

const OPUS = 'claude-opus-5-5'
const HAIKU = 'claude-haiku-4-5-20251001'

describe('tokens per model', () => {
    test("a turn's session keeps the result's tokens per model, a subagent's model included", async () => {
        const fake = fakeQuery({
            messages: [
                INIT,
                result({
                    structured_output: APPROVE,
                    modelUsage: {
                        [OPUS]: modelTotals({
                            input: 100,
                            output: 200,
                            cache_read: 3000,
                            cache_creation: 400,
                        }),
                        [HAIKU]: modelTotals({
                            input: 50,
                            output: 60,
                            cache_read: 70,
                            cache_creation: 80,
                        }),
                    },
                }),
            ],
        })
        const turn = await launch({ query: fake.query })

        expect(turn.ok).toBe(true)
        expect(turn.session).toMatchObject({
            model_usage: {
                [OPUS]: {
                    input_tokens: 100,
                    output_tokens: 200,
                    cache_read_input_tokens: 3000,
                    cache_creation_input_tokens: 400,
                },
                [HAIKU]: {
                    input_tokens: 50,
                    output_tokens: 60,
                    cache_read_input_tokens: 70,
                    cache_creation_input_tokens: 80,
                },
            },
        })
    })

    test("a follow-up's tokens per model are its own turn's: the SDK's running totals, less the turns before it", async () => {
        const fake = fakeQuery({
            turns: [
                [
                    INIT,
                    result({
                        structured_output: { n: 1 },
                        modelUsage: {
                            [OPUS]: modelTotals({
                                input: 100,
                                output: 200,
                                cache_read: 3000,
                                cache_creation: 400,
                            }),
                        },
                    }),
                ],
                [
                    result({
                        structured_output: IMPLEMENTER_DONE,
                        modelUsage: {
                            [OPUS]: modelTotals({
                                input: 150,
                                output: 260,
                                cache_read: 5000,
                                cache_creation: 450,
                            }),
                            [HAIKU]: modelTotals({
                                input: 50,
                                output: 60,
                                cache_read: 70,
                                cache_creation: 80,
                            }),
                        },
                    }),
                ],
            ],
        })
        const launcher = createClaudeLauncher({
            query: fake.query,
            claude_path: CLAUDE_PATH,
        })
        const first = await launcher.launch({
            role: 'implementer',
            ticket: 11,
            prompt: 'Build ticket #11.',
            cwd: repo,
            may_edit_tests: false,
            config: CONFIG,
            messaging: null,
            model: 'opus',
            effort: 'medium',
        })
        const second = await launcher.followUp({
            session_id: 'session-1',
            role: 'implementer',
            ticket: 11,
            message: 'lint failed: fix it.',
            cwd: repo,
            config: CONFIG,
        })
        await launcher.closeAll()

        expect(first.session?.model_usage).toEqual({
            [OPUS]: {
                input_tokens: 100,
                output_tokens: 200,
                cache_read_input_tokens: 3000,
                cache_creation_input_tokens: 400,
            },
        })
        expect(second.session?.model_usage).toEqual({
            [OPUS]: {
                input_tokens: 50,
                output_tokens: 60,
                cache_read_input_tokens: 2000,
                cache_creation_input_tokens: 50,
            },
            [HAIKU]: {
                input_tokens: 50,
                output_tokens: 60,
                cache_read_input_tokens: 70,
                cache_creation_input_tokens: 80,
            },
        })
    })

    test('a result with no tokens per model keeps none', async () => {
        const fake = fakeQuery({
            messages: [INIT, result({ structured_output: APPROVE })],
        })
        const turn = await launch({ query: fake.query })
        expect(turn.session?.model_usage).toEqual({})
    })
})
