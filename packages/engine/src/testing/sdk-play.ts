import { realpathSync } from 'node:fs'

import type { HookJSONOutput, Options } from '@anthropic-ai/claude-agent-sdk'

import type { AgentQuery } from '../agents/claude-launcher'
import { fakeQuery, repo } from '../agents/claude-launcher-helpers'

/**
 * A fake SDK session for the launcher's tests: SDK-shaped messages played
 * through `createClaudeLauncher`'s `query`, and tool calls played through
 * the guard hooks the launch set up, as the SDK would. No model, no process.
 */

/** A step: an SDK message, or work to do once the launcher has read the message before it. */
export type Step = unknown | ((options: Options) => Promise<void>)

/**
 * A fake `query` that plays `steps`: each message is yielded in turn, and
 * each function runs after the launcher has read the message before it,
 * the way the agent's tool calls happen mid-turn.
 */
export const playing = ({ steps }: { steps: Step[] }): AgentQuery => {
    const messages: unknown[] = []
    const after = new Map<unknown, ((options: Options) => Promise<void>)[]>()
    for (const step of steps) {
        if (typeof step === 'function') {
            const last = messages.at(-1)
            after.set(last, [
                ...(after.get(last) ?? []),
                step as (options: Options) => Promise<void>,
            ])
        } else messages.push(step)
    }
    const fake = fakeQuery({ messages })
    return (params) => {
        const inner = fake.query(params)
        return {
            ...inner,
            [Symbol.asyncIterator]: async function* () {
                for await (const message of inner) {
                    yield message
                    for (const work of after.get(message) ?? []) {
                        await work(params.options)
                    }
                }
            },
        }
    }
}

/** One message's token counts, as the SDK reports them. */
export type Usage = {
    input_tokens: number
    output_tokens: number
    cache_read_input_tokens: number
    cache_creation_input_tokens: number
}

/**
 * One API response, as the SDK streams it: the agent's (`parent` null), or
 * a helper's (`parent` the `Agent` call that started it).
 */
export const assistant = ({
    id,
    content,
    parent = null,
    model = 'claude-opus-5-5',
    usage = {
        input_tokens: 10,
        output_tokens: 10,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
    },
}: {
    id: string
    content: unknown[]
    parent?: string | null
    model?: string
    usage?: Usage
}) => ({
    type: 'assistant',
    message: {
        id,
        type: 'message',
        role: 'assistant',
        model,
        content,
        stop_reason: 'tool_use',
        usage,
    },
    parent_tool_use_id: parent,
    session_id: 'session-1',
    uuid: `uuid-${id}`,
})

/** A tool call inside an `assistant` message's content. */
export const toolUse = (
    id: string,
    name: string,
    input: Record<string, unknown>
) => ({ type: 'tool_use', id, name, input })

/** A tool's result, handed back to the agent (`parent` null) or a helper. */
export const toolResult = ({
    tool_use_id,
    content,
    parent = null,
}: {
    tool_use_id: string
    content: string
    parent?: string | null
}) => ({
    type: 'user',
    message: {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id, content }],
    },
    parent_tool_use_id: parent,
    session_id: 'session-1',
})

/**
 * Plays one tool call through every `PreToolUse` hook the launch set up
 * whose matcher fits the tool, as the SDK would, and gives the first
 * denial, or `{}` when every hook let it through. With `helper`, the call
 * comes from inside a helper (the SDK's `agent_id` and `agent_type`). `cwd`
 * is the test's repo, its real path, unless told.
 */
export const preToolUse = async ({
    options,
    tool_name,
    tool_input,
    tool_use_id,
    helper = false,
    cwd = realpathSync(repo),
}: {
    options: Options
    tool_name: string
    tool_input: Record<string, unknown>
    tool_use_id: string
    helper?: boolean
    cwd?: string
}): Promise<HookJSONOutput> => {
    const signal = new AbortController().signal
    for (const matcher of options.hooks?.PreToolUse ?? []) {
        if (
            matcher.matcher !== undefined &&
            !new RegExp(`^(?:${matcher.matcher})$`).test(tool_name)
        )
            continue
        for (const hook of matcher.hooks) {
            const answer = await hook(
                {
                    hook_event_name: 'PreToolUse',
                    tool_name,
                    tool_input,
                    tool_use_id,
                    session_id: 'session-1',
                    transcript_path: '/dev/null',
                    cwd,
                    ...(helper
                        ? { agent_id: 'helper-1', agent_type: 'searcher' }
                        : {}),
                },
                tool_use_id,
                { signal }
            )
            if (
                'hookSpecificOutput' in answer &&
                answer.hookSpecificOutput?.hookEventName === 'PreToolUse' &&
                answer.hookSpecificOutput.permissionDecision === 'deny'
            )
                return answer
        }
    }
    return {}
}
