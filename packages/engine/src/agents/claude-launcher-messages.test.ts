import type { HookJSONOutput, Options } from '@anthropic-ai/claude-agent-sdk'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { describe, expect, test } from 'bun:test'
import { z } from 'zod'

import type { AgentMessaging } from './agent-launcher'
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

import { MAX_MESSAGES_PER_AGENT } from '../messages/agent-messages'

/**
 * The launcher seam, the messages between agents: the engine's `send_message`
 * tool over MCP, its delivery on the next tool call, and the version in the
 * client tag. The helpers are in `claude-launcher-helpers.ts`.
 */

repoPerTest()

/**
 * A messaging stand-in: `send` answers as the engine would (a message to a
 * reviewer is refused), and `deliver` hands over `waiting` one at a time.
 */
const fakeMessaging = ({ waiting }: { waiting: string[] }) => {
    const sends: { to: string; text: string }[] = []
    const tool_names: (string | null)[] = []
    const queue = [...waiting]
    const messaging: AgentMessaging = {
        address: 'implementer#11',
        send: ({ to, text }) => {
            sends.push({ to, text })
            return to === 'ticket-reviewer#11'
                ? {
                      ok: false,
                      detail: 'Refused: Reviewers do not get messages.',
                  }
                : { ok: true, detail: `Sent as msg-1 to ${to}.` }
        },
        deliver: ({ tool_name }) => {
            tool_names.push(tool_name)
            return queue.shift() ?? null
        },
    }
    return { messaging, sends, tool_names }
}

/** Connects to the session's `luca` server the way Claude Code does: over MCP. */
const lucaClient = async (options: Options): Promise<Client> => {
    const server = options.mcpServers?.luca
    if (server === undefined || !('instance' in server)) {
        throw new Error('no in-process luca server')
    }
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
    await server.instance.connect(serverSide)
    const client = new Client({ name: 'fake-claude-code', version: '0.0.0' })
    await client.connect(clientSide)
    return client
}

/** Runs the session's first hook for `event`, as the SDK does after a tool call. */
const afterToolCall = async ({
    options,
    event,
    tool_name,
}: {
    options: Options
    event: 'PostToolUse' | 'PostToolUseFailure'
    tool_name: string
}): Promise<HookJSONOutput> => {
    const hook = options.hooks?.[event]?.[0]?.hooks[0]
    if (hook === undefined) throw new Error(`no ${event} hook`)
    const base = {
        session_id: 'session-1',
        transcript_path: '/dev/null',
        cwd: repo,
        tool_name,
        tool_input: {},
        tool_use_id: 'tool-1',
    }
    return hook(
        event === 'PostToolUse'
            ? { ...base, hook_event_name: event, tool_response: {} }
            : { ...base, hook_event_name: event, error: 'exit 1' },
        'tool-1',
        { signal: new AbortController().signal }
    )
}

/** The role instructions appended to Claude Code's system prompt. */
const appendOf = (options: Options | undefined): string => {
    const prompt = options?.systemPrompt
    return typeof prompt === 'object' && 'append' in prompt
        ? (prompt.append ?? '')
        : ''
}

/** An MCP tool result: its content blocks, text ones among them. */
const ToolResultSchema = z.looseObject({
    content: z.array(z.looseObject({ text: z.string().optional() })).optional(),
})

const textOf = (result: unknown): string => {
    const parsed = ToolResultSchema.safeParse(result)
    return parsed.success ? (parsed.data.content?.[0]?.text ?? '') : ''
}

describe('agent messages', () => {
    test("a test-writer or implementer gets the engine's send_message tool over MCP", async () => {
        const fake = fakeMessaging({ waiting: [] })
        const seen: {
            tools: { name: string; description?: string }[]
            sent: unknown
            refused: unknown
        }[] = []
        const query = fakeQuery({
            messages: [INIT, result({ structured_output: IMPLEMENTER_DONE })],
            during: async (call) => {
                const client = await lucaClient(call.options)
                const { tools } = await client.listTools()
                const sent = await client.callTool({
                    name: 'send_message',
                    arguments: {
                        to: 'test-writer#11',
                        text: 'sum takes an object.',
                    },
                })
                const refused = await client.callTool({
                    name: 'send_message',
                    arguments: { to: 'ticket-reviewer#11', text: 'Approve.' },
                })
                seen.push({ tools, sent, refused })
                await client.close()
            },
        })
        const turn = await launch({
            query: query.query,
            role: 'implementer',
            messaging: fake.messaging,
        })

        expect(turn).toMatchObject({ ok: true })
        const [
            { tools, sent, refused } = { tools: [], sent: {}, refused: {} },
        ] = seen
        expect(tools.map(({ name }) => name)).toEqual(['send_message'])
        const description = tools[0]?.description ?? ''
        expect(description).toContain('<role>#<ticket>')
        expect(description).toContain('"all"')
        expect(description).toContain(String(MAX_MESSAGES_PER_AGENT))
        expect(description).toContain('implementer#11')
        expect(fake.sends).toEqual([
            { to: 'test-writer#11', text: 'sum takes an object.' },
            { to: 'ticket-reviewer#11', text: 'Approve.' },
        ])
        expect(textOf(sent)).toBe('Sent as msg-1 to test-writer#11.')
        expect(sent).not.toMatchObject({ isError: true })
        expect(textOf(refused)).toBe('Refused: Reviewers do not get messages.')
        expect(refused).toMatchObject({ isError: true })
        const options = query.calls[0]?.options
        expect(Object.keys(options?.mcpServers ?? {})).toEqual(['luca'])
        expect(options?.allowedTools).toContain('mcp__luca')
        expect(appendOf(options)).toContain('## Agent messages')
    })

    test('waiting messages ride on the next tool call, even a failed one, and only once', async () => {
        const fake = fakeMessaging({
            waiting: [
                '[Agent message msg-1 from test-writer#11]: hi',
                'second',
            ],
        })
        const outputs: HookJSONOutput[] = []
        const query = fakeQuery({
            messages: [INIT, result({ structured_output: IMPLEMENTER_DONE })],
            during: async (call) => {
                const options = call.options
                outputs.push(
                    await afterToolCall({
                        options,
                        event: 'PostToolUse',
                        tool_name: 'Read',
                    }),
                    await afterToolCall({
                        options,
                        event: 'PostToolUseFailure',
                        tool_name: 'Bash',
                    }),
                    await afterToolCall({
                        options,
                        event: 'PostToolUse',
                        tool_name: 'Grep',
                    })
                )
            },
        })
        await launch({
            query: query.query,
            role: 'implementer',
            messaging: fake.messaging,
        })

        expect(outputs).toEqual([
            {
                hookSpecificOutput: {
                    hookEventName: 'PostToolUse',
                    additionalContext:
                        '[Agent message msg-1 from test-writer#11]: hi',
                },
            },
            {
                hookSpecificOutput: {
                    hookEventName: 'PostToolUseFailure',
                    additionalContext: 'second',
                },
            },
            {},
        ])
        expect(fake.tool_names).toEqual(['Read', 'Bash', 'Grep'])
        // The guard still checks every call first.
        expect(query.calls[0]?.options.hooks?.PreToolUse).toHaveLength(1)
    })

    test('a reviewer gets no luca server and no delivery hooks', async () => {
        const query = fakeQuery({
            messages: [INIT, result({ structured_output: APPROVE })],
        })
        await launch({ query: query.query, role: 'ticket-reviewer' })
        const options = query.calls[0]?.options
        expect(options?.mcpServers).toEqual({})
        expect(appendOf(options)).not.toContain('Agent messages')
        expect(options?.hooks?.PostToolUse).toBeUndefined()
        expect(options?.hooks?.PostToolUseFailure).toBeUndefined()
        expect(options?.hooks?.PreToolUse).toHaveLength(1)
    })

    test('a follow-up turn in the same session still delivers', async () => {
        const fake = fakeMessaging({ waiting: ['late news'] })
        const outputs: HookJSONOutput[] = []
        const query = fakeQuery({
            turns: [
                [INIT, result({ structured_output: IMPLEMENTER_DONE })],
                [result({ structured_output: IMPLEMENTER_DONE })],
            ],
            during: async (call, turn) => {
                if (turn === 0) return
                outputs.push(
                    await afterToolCall({
                        options: call.options,
                        event: 'PostToolUse',
                        tool_name: 'Edit',
                    })
                )
            },
        })
        const launcher = createClaudeLauncher({
            query: query.query,
            claude_path: CLAUDE_PATH,
        })
        await launcher.launch({
            role: 'implementer',
            ticket: 11,
            prompt: 'Build ticket #11.',
            cwd: repo,
            may_edit_tests: false,
            config: CONFIG,
            messaging: fake.messaging,
            model: 'opus',
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

        expect(second).toMatchObject({ ok: true })
        expect(outputs).toEqual([
            {
                hookSpecificOutput: {
                    hookEventName: 'PostToolUse',
                    additionalContext: 'late news',
                },
            },
        ])
    })
})

describe("the Agent SDK client tag carries Luca's version (#460)", () => {
    test("an agent's session is tagged with the engine's own version (the dev value from source), not 0.0.0", async () => {
        const fake = fakeQuery({ messages: [INIT, result({})] })

        await launch({ query: fake.query, role: 'implementer' })

        const tag = fake.calls[0]?.options.env?.CLAUDE_AGENT_SDK_CLIENT_APP
        expect(tag).not.toBe('luca-engine/0.0.0')
        // Run from the repo's source, the engine's version is the dev value.
        expect(tag).toMatch(/^luca-engine\/.*dev/)
    })
})
