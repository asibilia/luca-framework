/**
 * A turn's live progress (#628), for the engine's live file: what the
 * agent and its helpers (#636) are doing now, read from the SDK messages (streamed chunks too,
 * #631) and the guard hook. It
 * holds only short words: a tool and a target (a path relative to the
 * worktree, or the first words of a command), never a prompt, a file's
 * contents or a command's output.
 */
import { basename, isAbsolute, join, relative } from 'node:path'

import { z } from 'zod'

import { HELPER_MODEL, HELPER_TOOL } from '../guards/helper-rules'

/** The agent's latest action: a tool and a short target, with its time (ISO). */
export type ProgressAction = { tool: string; target: string; at: string }

/** A tool call the guard let through whose result hasn't come back yet. */
export type ProgressOpenCall = {
    tool: string
    target: string
    started_at: string
}

/**
 * A helper the agent started this turn (#636): its model, its latest
 * action, and whether its result has come back.
 */
export type ProgressHelper = {
    model: string
    action: ProgressAction | null
    done: boolean
}

/** What one turn has done so far, as `on_progress` hears it. */
export type TurnProgress = {
    /** Every token the turn's messages read or wrote so far, cache reads included. */
    tokens: number
    action: ProgressAction | null
    open_call: ProgressOpenCall | null
    /** The turn's helpers, oldest first; none when left out. */
    helpers?: ProgressHelper[]
    /** The turn's `rate_limit_event` readings so far, each with `arrived_at`. */
    rate_limit_events: Record<string, unknown>[]
}

/** Hears a turn's progress each time it changes. */
export type ProgressListener = (progress: TurnProgress) => void

/** How many words of a command a target keeps. */
const COMMAND_WORDS = 3

/** The longest target, in characters. */
const MAX_TARGET = 60

const UsageSchema = z.object({
    input_tokens: z.number().default(0),
    output_tokens: z.number().default(0),
    cache_read_input_tokens: z.number().nullable().default(0),
    cache_creation_input_tokens: z.number().nullable().default(0),
})

const AssistantSchema = z.object({
    type: z.literal('assistant'),
    uuid: z.string().optional(),
    parent_tool_use_id: z.string().nullable().default(null),
    message: z.object({
        id: z.string().optional(),
        content: z.array(z.unknown()).default([]),
        usage: UsageSchema.optional(),
    }),
})

const ToolUseSchema = z.object({
    type: z.literal('tool_use'),
    name: z.string(),
    input: z.unknown(),
})

const ResultIdsSchema = z.object({
    type: z.literal('user'),
    message: z.object({
        content: z.array(z.unknown()),
    }),
})

const ToolResultSchema = z.object({
    type: z.literal('tool_result'),
    tool_use_id: z.string(),
})

const RateLimitSchema = z.object({ type: z.literal('rate_limit_event') })

/** A streamed chunk of the model's answer (#631), with partial messages on. */
const StreamEventSchema = z.object({ type: z.literal('stream_event') })

const textOf = (value: unknown): string | null =>
    typeof value === 'string' && value.trim() !== '' ? value.trim() : null

/** A path relative to the worktree; one outside it keeps its name only. */
const shortPath = ({
    path,
    worktree,
}: {
    path: string
    worktree: string
}): string => {
    const inside = relative(
        worktree,
        isAbsolute(path) ? path : join(worktree, path)
    )
    return inside.startsWith('..') || isAbsolute(inside)
        ? basename(path)
        : inside
}

/** The first words of a command's first line. */
const firstWords = (command: string): string =>
    (command.split('\n')[0] ?? '')
        .trim()
        .match(new RegExp(`^\\S+(?:\\s+\\S+){0,${COMMAND_WORDS - 1}}`))?.[0] ??
    ''

/**
 * A tool call's short target: the path it works on, the first words of
 * its command, its search pattern, or its helper's type.
 *
 * @example
 * targetOf({ tool_name: 'Bash', tool_input: { command: 'bun test src --bail' }, worktree }) // 'bun test src'
 */
export const targetOf = ({
    tool_name,
    tool_input,
    worktree,
}: {
    tool_name: string
    tool_input: unknown
    worktree: string
}): string => {
    const input =
        typeof tool_input === 'object' && tool_input !== null
            ? (tool_input as Record<string, unknown>)
            : {}
    const path = textOf(input.file_path) ?? textOf(input.notebook_path)
    const target =
        path !== null
            ? shortPath({ path, worktree })
            : tool_name === 'Bash'
              ? firstWords(textOf(input.command) ?? '')
              : (textOf(input.pattern) ?? textOf(input.subagent_type) ?? '')
    return target.slice(0, MAX_TARGET)
}

/**
 * Keeps one session's turn progress and tells `on_progress` each time it
 * changes. `start` begins a turn afresh, with its own listener;
 * `readings` gives the turn's plan-usage readings, as the session's
 * summary has them.
 *
 * @example
 * const progress = createTurnProgress({ worktree, readings: () => summary.rate_limit_events })
 * progress.start(on_progress)
 * progress.heard(message)
 */
export const createTurnProgress = ({
    worktree,
    readings,
}: {
    worktree: string
    readings: () => Record<string, unknown>[]
}) => {
    let listener: ProgressListener | undefined
    let tokens = new Map<string, number>()
    let action: ProgressAction | null = null
    let open = new Map<string, ProgressOpenCall>()
    /** The turn's helpers, by the `Agent` call that started each. */
    let helpers = new Map<string, ProgressHelper>()

    const tell = (): void => {
        listener?.({
            tokens: [...tokens.values()].reduce((sum, each) => sum + each, 0),
            action,
            open_call: [...open.values()].at(-1) ?? null,
            helpers: [...helpers.values()].map((helper) => ({ ...helper })),
            rate_limit_events: [...readings()],
        })
    }

    const start = (on_progress: ProgressListener | undefined): void => {
        listener = on_progress
        tokens = new Map()
        action = null
        open = new Map()
        helpers = new Map()
    }

    /**
     * Reads one SDK message: its tokens, its tool calls, the results back. A
     * streamed chunk is told as it comes, so the heartbeat moves while the
     * model thinks, but nothing of it is kept: the whole message that
     * follows carries the tokens.
     */
    const heard = (raw: unknown): void => {
        if (
            RateLimitSchema.safeParse(raw).success ||
            StreamEventSchema.safeParse(raw).success
        ) {
            tell()
            return
        }
        const assistant = AssistantSchema.safeParse(raw)
        if (assistant.success) {
            const { message, uuid, parent_tool_use_id } = assistant.data
            const usage = message.usage
            if (usage !== undefined) {
                tokens.set(
                    message.id ?? uuid ?? String(tokens.size),
                    usage.input_tokens +
                        usage.output_tokens +
                        (usage.cache_read_input_tokens ?? 0) +
                        (usage.cache_creation_input_tokens ?? 0)
                )
            }
            // A helper's own calls are its action, not its agent's.
            const helper =
                parent_tool_use_id === null
                    ? undefined
                    : helpers.get(parent_tool_use_id)
            for (const block of message.content) {
                const call = ToolUseSchema.safeParse(block)
                if (!call.success) continue
                const latest = {
                    tool: call.data.name,
                    target: targetOf({
                        tool_name: call.data.name,
                        tool_input: call.data.input,
                        worktree,
                    }),
                    at: new Date().toISOString(),
                }
                if (parent_tool_use_id === null) action = latest
                else if (helper !== undefined) helper.action = latest
            }
            tell()
            return
        }
        const user = ResultIdsSchema.safeParse(raw)
        if (!user.success) return
        const ids = user.data.message.content.flatMap((block) => {
            const result = ToolResultSchema.safeParse(block)
            return result.success ? [result.data.tool_use_id] : []
        })
        if (!ids.some((id) => open.has(id) || helpers.has(id))) return
        for (const id of ids) {
            open.delete(id)
            const helper = helpers.get(id)
            if (helper !== undefined) helper.done = true
        }
        tell()
    }

    /** A tool call the guard let through: open until its result comes back. */
    const opened = ({
        tool_name,
        tool_input,
        tool_use_id,
    }: {
        tool_name: string
        tool_input: unknown
        tool_use_id: string
    }): void => {
        open.set(tool_use_id, {
            tool: tool_name,
            target: targetOf({ tool_name, tool_input, worktree }),
            started_at: new Date().toISOString(),
        })
        if (tool_name === HELPER_TOOL) {
            helpers.set(tool_use_id, {
                model: HELPER_MODEL,
                action: null,
                done: false,
            })
        }
        tell()
    }

    return { start, heard, opened }
}

/** The progress `createTurnProgress` keeps for one session. */
export type TurnProgressKeeper = ReturnType<typeof createTurnProgress>
