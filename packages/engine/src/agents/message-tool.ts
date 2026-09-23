import {
    createSdkMcpServer,
    tool,
    type HookCallback,
    type HookJSONOutput,
    type McpSdkServerConfigWithInstance,
} from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'

import type { AgentMessaging } from './agent-launcher'

import {
    ALL_AGENTS,
    MAX_MESSAGE_CHARS,
    MAX_MESSAGES_PER_AGENT,
} from '../messages/agent-messages'

/** The name of the engine's own in-process MCP server. */
export const LUCA_SERVER = 'luca'

/** What the agent reads about `send_message`. */
export const sendMessageDescription = ({
    address,
}: {
    address: string
}): string =>
    [
        'Send a short one-way heads-up to another agent in this run, such as a fact about the repo it will need.',
        `"to" is an address, <role>#<ticket> (the test-writer or implementer of a ticket, such as implementer#11), or "${ALL_AGENTS}" for every other test-writer and implementer at work.`,
        `Your own address, ${address}, is not a valid target, and reviewers get no messages.`,
        `The receiver sees it at its next tool call. Nobody replies. At most ${MAX_MESSAGES_PER_AGENT} messages per ticket, ${MAX_MESSAGE_CHARS} characters each.`,
    ].join(' ')

/**
 * The engine's in-process MCP server, `luca`, with one tool: `send_message`.
 * The tool's answer is what `messaging.send` says; a refused message is an
 * error result. The agent calls it as `mcp__luca__send_message`.
 *
 * @example
 * const server = createLucaServer({ messaging })
 * const options = { mcpServers: { luca: server } }
 */
export const createLucaServer = ({
    messaging,
}: {
    messaging: AgentMessaging
}): McpSdkServerConfigWithInstance =>
    createSdkMcpServer({
        name: LUCA_SERVER,
        version: '0.0.0',
        tools: [
            tool(
                'send_message',
                sendMessageDescription({ address: messaging.address }),
                {
                    to: z
                        .string()
                        .describe(
                            `An address such as implementer#11, or "${ALL_AGENTS}".`
                        ),
                    text: z
                        .string()
                        .describe('The message. Short and factual.'),
                },
                async ({ to, text }) => {
                    try {
                        const { ok, detail } = messaging.send({ to, text })
                        return {
                            content: [{ type: 'text', text: detail }],
                            isError: !ok,
                        }
                    } catch (error) {
                        return {
                            content: [
                                {
                                    type: 'text',
                                    text: `The engine could not send it: ${String(error)}`,
                                },
                            ],
                            isError: true,
                        }
                    }
                }
            ),
        ],
    })

/**
 * The delivery hook, for `PostToolUse` and `PostToolUseFailure`: after each
 * tool call, the agent's waiting messages are handed over as
 * `additionalContext`. No messages, no opinion. If the engine can't hand
 * them over, they wait for the next call.
 *
 * @example
 * const hook = createDeliveryHook({ messaging })
 * const options = { hooks: { PostToolUse: [{ hooks: [hook] }], PostToolUseFailure: [{ hooks: [hook] }] } }
 */
export const createDeliveryHook = ({
    messaging,
}: {
    messaging: AgentMessaging
}): HookCallback => {
    return async (input): Promise<HookJSONOutput> => {
        if (
            input.hook_event_name !== 'PostToolUse' &&
            input.hook_event_name !== 'PostToolUseFailure'
        ) {
            return {}
        }
        let text: string | null
        try {
            text = messaging.deliver({ tool_name: input.tool_name })
        } catch {
            return {}
        }
        if (text === null) return {}
        return {
            hookSpecificOutput: {
                hookEventName: input.hook_event_name,
                additionalContext: text,
            },
        }
    }
}
