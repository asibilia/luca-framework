/**
 * Antigravity (`agy`) NDJSON event schemas and pure target/quota/denial,
 * progress, and session-summary helpers (#779).
 */
import { basename, isAbsolute, join, relative } from 'node:path'

import { z } from 'zod'

import type { AgentSession, ModelTokens } from './agent-launcher'
import type {
    ProgressAction,
    ProgressListener,
    ProgressOpenCall,
} from './turn-progress'

const COMMAND_WORDS = 3
const MAX_TARGET = 60

const AGY_MODEL_RE = /^gemini-/i
const RESET_IN_RE =
    /resets[ \t]+in[ \t]+(?=\d+[hms])(?:(\d+)h)?[ \t]*(?:(\d+)m)?[ \t]*(?:(\d+)s)?/i

const PATH_KEYS = [
    'AbsolutePath',
    'Path',
    'TargetFile',
    'SearchPath',
    'SearchDirectory',
    'DirectoryPath',
] as const

const num0 = () =>
    z
        .number()
        .nullish()
        .transform((v) => v ?? 0)

export const AgyUsageSchema = z.looseObject({
    input_tokens: num0(),
    output_tokens: num0(),
    thinking_tokens: num0(),
    cache_read_tokens: num0(),
    total_tokens: num0(),
})
export type AgyUsage = z.infer<typeof AgyUsageSchema>

export const AgyInitEventSchema = z.looseObject({
    event: z.literal('init'),
    conversation_id: z.string().nullish(),
    init: z.looseObject({
        model: z.string().nullish(),
        cwd: z.string().nullish(),
        tools: z.array(z.string()).nullish(),
        permission_mode: z.string().nullish(),
    }),
})
export type AgyInitEvent = z.infer<typeof AgyInitEventSchema>

export const AgyStepUpdateEventSchema = z.looseObject({
    event: z.literal('step_update'),
    step_update: z.looseObject({
        conversation_id: z.string().nullish(),
        step_index: z.number().int(),
        state: z.enum(['ACTIVE', 'DONE', 'ERROR']),
        step_type: z.string(),
        tool_name: z.string().nullish(),
        tool_info: z
            .looseObject({
                name: z.string().nullish(),
                parameters: z.unknown().optional(),
            })
            .nullish(),
        usage: AgyUsageSchema.nullish(),
    }),
})
export type AgyStepUpdateEvent = z.infer<typeof AgyStepUpdateEventSchema>

export const AgyResultEventSchema = z.looseObject({
    event: z.literal('result'),
    result: z.looseObject({
        conversation_id: z.string().nullish(),
        status: z.enum(['SUCCESS', 'ERROR']),
        response: z.string().nullish(),
        error: z.string().nullish(),
        duration_seconds: z.number().nullish(),
        num_turns: z.number().int().min(0).nullish(),
        structured_output: z.unknown().optional(),
        usage: AgyUsageSchema.nullish(),
    }),
})
export type AgyResultEvent = z.infer<typeof AgyResultEventSchema>

export const AgyDenialSchema = z.object({
    tool_name: z.string(),
    reason: z.string(),
})
export type AgyDenial = z.infer<typeof AgyDenialSchema>

/** Returns `v` if it is a non-empty string, otherwise `null`. */
export const nonEmpty = (v: string | null | undefined): string | null =>
    typeof v === 'string' && v !== '' ? v : null

/** Accepts any Gemini model name (`/^[gG]emini-/`); refuses everything else. */
export const checkAgyModel = ({ model }: { model: string }): boolean =>
    AGY_MODEL_RE.test(model)

/** Parses `"Resets in <Nh><Nm><Ns>"` into Unix epoch seconds, or `null`. */
export const parseAgyQuotaReset = ({
    text,
    now_ms,
}: {
    text: string
    now_ms: number
}): number | null => {
    const match = RESET_IN_RE.exec(text)
    if (match === null) return null
    const [, h, m, s] = match
    if (h === undefined && m === undefined && s === undefined) return null
    return (
        Math.floor(now_ms / 1000) +
        Number(h ?? 0) * 3600 +
        Number(m ?? 0) * 60 +
        Number(s ?? 0)
    )
}

const textOf = (v: unknown): string | null =>
    typeof v === 'string' && v.trim() !== '' ? v.trim() : null

const shortPath = ({ path, worktree }: { path: string; worktree: string }) => {
    const inside = relative(
        worktree,
        isAbsolute(path) ? path : join(worktree, path)
    )
    return inside.startsWith('..') || isAbsolute(inside)
        ? basename(path)
        : inside
}

const firstWords = (command: string): string =>
    (command.split('\n')[0] ?? '')
        .trim()
        .match(new RegExp(`^\\S+(?:\\s+\\S+){0,${COMMAND_WORDS - 1}}`))?.[0] ??
    ''

/** Extracts a 60-char-capped target string for a `step_update` tool call. */
export const agyTargetOf = ({
    tool_name,
    parameters,
    worktree,
}: {
    tool_name: string
    parameters: unknown
    worktree: string
}): string => {
    if (tool_name === 'finish') return ''
    const parsed = z.record(z.string(), z.unknown()).safeParse(parameters)
    const params = parsed.success ? parsed.data : {}
    let path: string | null = null
    for (const key of PATH_KEYS) {
        path = textOf(params[key])
        if (path !== null) break
    }
    const target =
        path !== null
            ? shortPath({ path, worktree })
            : tool_name === 'run_command'
              ? firstWords(textOf(params.CommandLine) ?? '')
              : (textOf(params.Query) ?? textOf(params.Pattern) ?? '')
    return target.slice(0, MAX_TARGET)
}

/** Parses newline-delimited guard denials from `denials.jsonl`. */
export const parseDenialsJsonl = ({ text }: { text: string }): AgyDenial[] => {
    const denials: AgyDenial[] = []
    for (const raw of text.split('\n')) {
        const line = raw.trim()
        if (line === '') continue
        try {
            const parsed = AgyDenialSchema.safeParse(JSON.parse(line))
            if (parsed.success) denials.push(parsed.data)
        } catch {
            continue
        }
    }
    return denials
}

/** Parses a JSON-string `structured_output`, falling back to raw on error. */
export const parseStructuredOutput = (value: unknown): unknown => {
    if (typeof value !== 'string') return value
    try {
        return JSON.parse(value)
    } catch {
        return value
    }
}

export type AgyStreamState = {
    model: string | null
    init_conversation_id: string | null
    result_event: AgyResultEvent['result'] | null
    stderr_buf: string
    aborted: boolean
    action: ProgressAction | null
    step_tokens: Map<number, number>
    open_calls: Map<number, ProgressOpenCall>
    rate_limit_events: Record<string, unknown>[]
}

/** Applies one parsed NDJSON line to `state` and emits `TurnProgress`. */
export const processStreamLine = ({
    line,
    state,
    worktree,
    now,
    on_progress,
}: {
    line: string
    state: AgyStreamState
    worktree: string
    now: () => number
    on_progress?: ProgressListener
}): { bad_model: string } | null => {
    const trimmed = line.trim()
    if (trimmed === '') return null
    let raw: unknown
    try {
        raw = JSON.parse(trimmed)
    } catch {
        return null
    }
    const init = AgyInitEventSchema.safeParse(raw)
    if (init.success) {
        const conv = nonEmpty(init.data.conversation_id)
        if (conv !== null) state.init_conversation_id = conv
        const init_model = init.data.init.model
        if (typeof init_model === 'string') {
            state.model = init_model
            if (!checkAgyModel({ model: init_model })) {
                return { bad_model: init_model }
            }
        }
        return null
    }
    const step = AgyStepUpdateEventSchema.safeParse(raw)
    if (step.success) {
        const u = step.data.step_update
        if (u.usage != null) {
            state.step_tokens.set(
                u.step_index,
                u.usage.input_tokens +
                    u.usage.output_tokens +
                    u.usage.thinking_tokens +
                    u.usage.cache_read_tokens
            )
        }
        const is_tool = u.step_type === 'tool' || u.step_type === 'finish'
        if (is_tool) {
            const tool =
                nonEmpty(u.tool_name) ??
                nonEmpty(u.tool_info?.name) ??
                (u.step_type === 'finish' ? 'finish' : '')
            if (u.state === 'ACTIVE') {
                const at = new Date(now()).toISOString()
                const target = agyTargetOf({
                    tool_name: tool,
                    parameters: u.tool_info?.parameters,
                    worktree,
                })
                state.action = { tool, target, at }
                state.open_calls.set(u.step_index, {
                    tool,
                    target,
                    started_at: at,
                })
            } else {
                state.open_calls.delete(u.step_index)
            }
        }
        if (is_tool || u.step_type === 'agent_response' || u.usage != null) {
            try {
                on_progress?.({
                    tokens: [...state.step_tokens.values()].reduce(
                        (s, n) => s + n,
                        0
                    ),
                    action: state.action,
                    open_call: [...state.open_calls.values()].at(-1) ?? null,
                    rate_limit_events: [...state.rate_limit_events],
                })
            } catch {
                // Live progress is best-effort; listener errors must not abort the stream.
            }
        }
        return null
    }
    const res = AgyResultEventSchema.safeParse(raw)
    if (res.success) state.result_event = res.data.result
    return null
}

/** Builds an `AgentSession` summary from accumulated `AgyStreamState`. */
export const summarizeAgySession = ({
    state,
    started_ms,
    now_ms,
    fallback_id,
    guard_denials,
}: {
    state: AgyStreamState
    started_ms: number
    now_ms: number
    fallback_id: string | undefined
    guard_denials: AgyDenial[]
}) => {
    const res = state.result_event
    const raw = res?.usage
    const usage = {
        input_tokens: raw?.input_tokens ?? 0,
        output_tokens: (raw?.output_tokens ?? 0) + (raw?.thinking_tokens ?? 0),
        cache_read_input_tokens: raw?.cache_read_tokens ?? 0,
        cache_creation_input_tokens: 0,
    }
    const dur = res?.duration_seconds
    const duration_ms =
        typeof dur === 'number' && Number.isFinite(dur) && dur >= 0
            ? Math.round(dur * 1000)
            : Math.max(0, now_ms - started_ms)
    const real_id =
        nonEmpty(res?.conversation_id) ?? nonEmpty(state.init_conversation_id)
    const session_id = real_id ?? nonEmpty(fallback_id)
    const model_usage: Record<string, ModelTokens> =
        state.model !== null ? { [state.model]: { ...usage } } : {}
    const session: AgentSession = {
        session_id,
        model: state.model,
        claude_code_version: null,
        api_key_source: 'none',
        subscription_type: 'agy',
        num_turns: res?.num_turns ?? 0,
        duration_ms,
        usage,
        model_usage,
        total_cost_usd: 0,
        permission_denials: [],
        guard_denials,
        rate_limit_events: [...state.rate_limit_events],
        billing_error: false,
        helpers_started: 0,
    }
    return { session, session_id, real_id }
}
