/**
 * What the Claude launcher reads from an SDK session: the Zod schemas of its
 * messages, the outcome of a turn, and the safety checks on the account and
 * the init message. Pure; no session state.
 */
import { z } from 'zod'

import type { ModelTokens } from './agent-launcher'
import { checkModel } from './claude-options'

/** The Claude plans an agent may run on. */
const PLANS = ['pro', 'max', 'team', 'enterprise']

export const AccountSchema = z.looseObject({
    subscriptionType: z.string().optional(),
    apiKeySource: z.string().optional(),
    apiProvider: z.string().optional(),
})

export const InitSchema = z.object({
    type: z.literal('system'),
    subtype: z.literal('init'),
    apiKeySource: z.string(),
    model: z.string(),
    claude_code_version: z.string().nullable().default(null),
    session_id: z.string().nullable().default(null),
    tools: z.array(z.string()).default([]),
    mcp_servers: z.array(z.object({ name: z.string() })).default([]),
})

export const RateLimitSchema = z.object({
    type: z.literal('rate_limit_event'),
    rate_limit_info: z.record(z.string(), z.unknown()),
})

export const AssistantSchema = z.object({
    type: z.literal('assistant'),
    error: z.string().optional(),
})

const UserSchema = z.object({
    type: z.literal('user'),
    message: z.object({ content: z.array(z.unknown()) }),
})

const ToolResultSchema = z.object({
    type: z.literal('tool_result'),
    tool_use_id: z.string(),
})

/** The ids of the tool calls a user message carries results for, if any. */
export const toolResultIds = (raw: unknown): string[] => {
    const user = UserSchema.safeParse(raw)
    if (!user.success) return []
    return user.data.message.content.flatMap((block) => {
        const tool = ToolResultSchema.safeParse(block)
        return tool.success ? [tool.data.tool_use_id] : []
    })
}

export const ResultSchema = z.object({
    type: z.literal('result'),
    subtype: z.string(),
    is_error: z.boolean().default(false),
    num_turns: z.number().int().min(0).default(0),
    duration_ms: z.number().min(0).default(0),
    total_cost_usd: z.number().default(0),
    usage: z
        .object({
            input_tokens: z.number().default(0),
            output_tokens: z.number().default(0),
            cache_read_input_tokens: z.number().default(0),
            cache_creation_input_tokens: z.number().default(0),
        })
        .default({
            input_tokens: 0,
            output_tokens: 0,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
        }),
    /** Tokens per model, subagents included: the session's running totals. */
    modelUsage: z
        .record(
            z.string(),
            z.object({
                inputTokens: z.number().default(0),
                outputTokens: z.number().default(0),
                cacheReadInputTokens: z.number().default(0),
                cacheCreationInputTokens: z.number().default(0),
            })
        )
        .default({}),
    permission_denials: z
        .array(z.object({ tool_name: z.string(), tool_use_id: z.string() }))
        .default([]),
    structured_output: z.unknown().optional(),
    result: z.string().default(''),
    errors: z.array(z.string()).default([]),
    session_id: z.string().optional(),
})

export type Failed = {
    ok: false
    failure: 'agent' | 'engine' | 'stop' | 'plan'
    error: string
}

export type Outcome = { ok: true; structured_output: unknown } | Failed

export const stop = (error: string): Failed => ({
    ok: false,
    failure: 'stop',
    error,
})

export const errorText = (error: unknown): string =>
    error instanceof Error ? error.message : String(error)

/** Why the account may not run agents, or `null` if it may. */
export const accountProblem = (raw: unknown): string | null => {
    const parsed = AccountSchema.safeParse(raw)
    if (!parsed.success)
        return 'accountInfo() gave an answer of the wrong shape'
    const { subscriptionType, apiKeySource, apiProvider } = parsed.data
    const plan = (subscriptionType ?? '').toLowerCase()
    if (!PLANS.some((name) => plan.includes(name))) {
        return `no Claude subscription (subscriptionType=${subscriptionType ?? 'none'})`
    }
    if (apiKeySource !== undefined && apiKeySource !== 'none') {
        return `an API key is in use (apiKeySource=${apiKeySource})`
    }
    if (apiProvider !== undefined && apiProvider !== 'firstParty') {
        return `not Anthropic's own API (apiProvider=${apiProvider})`
    }
    return null
}

/** Why an init message is unsafe to go on with, or `null` if it is fine. */
export const initProblem = (
    init: z.infer<typeof InitSchema>
): string | null => {
    if (init.apiKeySource !== 'none') {
        return `init apiKeySource=${init.apiKeySource} (expected "none")`
    }
    const model = checkModel({ model: init.model })
    if (model !== null) return `init model: ${model}`
    const servers = init.mcp_servers
        .map(({ name }) => name)
        .filter((name) => name !== 'luca')
    const tools = init.tools.filter(
        (tool) => tool.startsWith('mcp__') && !tool.startsWith('mcp__luca__')
    )
    if (servers.length > 0 || tools.length > 0) {
        return `foreign MCP servers or tools: ${[...servers, ...tools].join(', ')}`
    }
    return null
}

/** A turn the plan cut off: the reason, in words. */
export const planCut = (error: string): Failed => ({
    ok: false,
    failure: 'plan',
    error,
})

/** A result's `modelUsage`, in the journal's words. */
export const modelTotalsOf = (
    modelUsage: z.infer<typeof ResultSchema>['modelUsage']
): Record<string, ModelTokens> =>
    Object.fromEntries(
        Object.entries(modelUsage).map(([name, each]) => [
            name,
            {
                input_tokens: each.inputTokens,
                output_tokens: each.outputTokens,
                cache_read_input_tokens: each.cacheReadInputTokens,
                cache_creation_input_tokens: each.cacheCreationInputTokens,
            },
        ])
    )

/**
 * One turn's tokens per model: the session's running totals less those at
 * its last result, as the SDK sums `modelUsage` over a session's turns.
 */
export const turnTokens = ({
    totals,
    before,
}: {
    totals: Record<string, ModelTokens>
    before: Record<string, ModelTokens>
}): Record<string, ModelTokens> =>
    Object.fromEntries(
        Object.entries(totals).map(([name, now]) => {
            const was = before[name]
            const less = (key: keyof ModelTokens) =>
                Math.max(0, now[key] - (was?.[key] ?? 0))
            return [
                name,
                {
                    input_tokens: less('input_tokens'),
                    output_tokens: less('output_tokens'),
                    cache_read_input_tokens: less('cache_read_input_tokens'),
                    cache_creation_input_tokens: less(
                        'cache_creation_input_tokens'
                    ),
                },
            ]
        })
    )
