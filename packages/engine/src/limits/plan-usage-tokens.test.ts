import { describe, expect, test } from 'bun:test'

import { countedTokens, usageFor, type SessionReading } from './plan-usage'

import { AgentSessionSchema } from '../agents/agent-launcher'

/**
 * Exact tokens (#433): `usageFor` sums each agent turn's tokens per model,
 * as the launcher journals them (subagents included), and `countedTokens`
 * totals them as input + output + cache-creation tokens.
 */

type Tokens = {
    input_tokens: number
    output_tokens: number
    cache_read_input_tokens: number
    cache_creation_input_tokens: number
}

const tokens = (
    input: number,
    output: number,
    cache_read: number,
    cache_creation: number
): Tokens => ({
    input_tokens: input,
    output_tokens: output,
    cache_read_input_tokens: cache_read,
    cache_creation_input_tokens: cache_creation,
})

/**
 * One agent turn as the launcher journals it: its main loop's `usage`,
 * and, unless left out (an older journal's), its tokens per model.
 */
const turn = ({
    ticket,
    usage,
    model_usage,
}: {
    ticket: number | null
    usage: Tokens
    model_usage?: Record<string, Tokens>
}): SessionReading => ({
    ticket,
    session: AgentSessionSchema.parse({
        usage,
        ...(model_usage === undefined ? {} : { model_usage }),
    }),
})

const OPUS = 'claude-opus-5-5'
const HAIKU = 'claude-haiku-4-5-20251001'

describe('usage replay: tokens per model', () => {
    test("a ticket's tokens are summed from each turn's tokens per model, a subagent's model included, not from the main loop's usage", () => {
        const usage = usageFor({
            sessions: [
                turn({
                    ticket: 11,
                    usage: tokens(1, 1, 1, 1),
                    model_usage: {
                        [OPUS]: tokens(1000, 2000, 50_000, 3000),
                        [HAIKU]: tokens(100, 200, 400, 300),
                    },
                }),
                turn({
                    ticket: 11,
                    usage: tokens(1, 1, 1, 1),
                    model_usage: { [OPUS]: tokens(500, 700, 20_000, 800) },
                }),
                turn({
                    ticket: 12,
                    usage: tokens(1, 1, 1, 1),
                    model_usage: { [OPUS]: tokens(9, 9, 9, 9) },
                }),
            ],
            ticket: 11,
        })
        expect(usage).toMatchObject({
            scope: 'ticket',
            ticket: 11,
            agent_turns: 2,
            tokens: tokens(1600, 2900, 70_400, 4100),
        })
    })

    test("a ticket's total is input + output + cache-creation tokens; cache reads are not counted", () => {
        const usage = usageFor({
            sessions: [
                turn({
                    ticket: 11,
                    usage: tokens(0, 0, 0, 0),
                    model_usage: {
                        [OPUS]: tokens(1000, 2000, 50_000, 3000),
                        [HAIKU]: tokens(100, 200, 400, 300),
                    },
                }),
            ],
            ticket: 11,
        })
        expect(usage.tokens).toEqual(tokens(1100, 2200, 50_400, 3300))
        expect(countedTokens({ tokens: usage.tokens })).toBe(6600)
    })

    test("the run's total adds up every ticket's turns and every model", () => {
        const usage = usageFor({
            sessions: [
                turn({
                    ticket: 11,
                    usage: tokens(0, 0, 0, 0),
                    model_usage: {
                        [OPUS]: tokens(1000, 2000, 50_000, 3000),
                        [HAIKU]: tokens(100, 200, 400, 300),
                    },
                }),
                turn({
                    ticket: 12,
                    usage: tokens(0, 0, 0, 0),
                    model_usage: { [OPUS]: tokens(500, 700, 20_000, 800) },
                }),
                turn({
                    ticket: null,
                    usage: tokens(0, 0, 0, 0),
                    model_usage: { [OPUS]: tokens(10, 20, 30, 40) },
                }),
            ],
            ticket: null,
        })
        expect(usage).toMatchObject({
            scope: 'run',
            ticket: null,
            agent_turns: 3,
            tokens: tokens(1610, 2920, 70_430, 4140),
        })
        expect(countedTokens({ tokens: usage.tokens })).toBe(8670)
    })

    test("a turn from an older journal, with no tokens per model, counts its main loop's usage instead", () => {
        const usage = usageFor({
            sessions: [
                turn({ ticket: 11, usage: tokens(10, 100, 5000, 40) }),
                turn({
                    ticket: 11,
                    usage: tokens(1, 1, 1, 1),
                    model_usage: { [OPUS]: tokens(20, 200, 7000, 60) },
                }),
            ],
            ticket: 11,
        })
        expect(usage).toMatchObject({
            agent_turns: 2,
            tokens: tokens(30, 300, 12_000, 100),
        })
        expect(countedTokens({ tokens: usage.tokens })).toBe(430)
    })
})
