import { realpathSync } from 'node:fs'
import { join } from 'node:path'

import type { HookJSONOutput, Options } from '@anthropic-ai/claude-agent-sdk'
import { describe, expect, test } from 'bun:test'

import { createClaudeLauncher, type AgentQuery } from './claude-launcher'
import {
    CLAUDE_PATH,
    CONFIG,
    fakeQuery,
    IMPLEMENTER_DONE,
    INIT,
    repo,
    repoPerTest,
    result,
} from './claude-launcher-helpers'

/**
 * The launcher seam: `createClaudeLauncher` with a fake `query` that plays
 * back SDK-shaped messages, and a fake `claude` path. No model, no process.
 *
 * Here: the live progress of a turn (#628), for the engine's live file. A
 * launch's `on_progress` hears, at once and before the turn ends, what the
 * agent is doing: its tokens so far (input, output and both cache counts,
 * as the board counts a card's tokens), its latest action as a tool and a
 * short target (a path relative to the worktree, or the first words of a
 * command), the tool call still open, and the turn's plan-usage readings.
 */

repoPerTest()

/** A step of a fake session: an SDK message, or work to do once the launcher has read the message before it. */
type Step = unknown | ((options: Options) => Promise<void>)

/**
 * A fake `query` that plays `steps`: each message is yielded in turn, and
 * each function runs after the launcher has read the message before it,
 * the way the agent's tool calls happen mid-turn.
 */
const playing = ({ steps }: { steps: Step[] }): AgentQuery => {
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

/** One API response of the agent, as the SDK streams it. */
const assistant = ({
    id,
    content,
    usage,
}: {
    id: string
    content: unknown[]
    usage: {
        input_tokens: number
        output_tokens: number
        cache_read_input_tokens: number
        cache_creation_input_tokens: number
    }
}) => ({
    type: 'assistant',
    message: {
        id,
        type: 'message',
        role: 'assistant',
        model: 'claude-opus-5-5',
        content,
        stop_reason: 'tool_use',
        usage,
    },
    parent_tool_use_id: null,
    session_id: 'session-1',
    uuid: `uuid-${id}`,
})

const toolUse = (id: string, name: string, input: Record<string, unknown>) => ({
    type: 'tool_use',
    id,
    name,
    input,
})

/** The tool's result, as the SDK hands it back to the agent. */
const toolResult = (tool_use_id: string, content: string) => ({
    type: 'user',
    message: {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id, content }],
    },
    parent_tool_use_id: null,
    session_id: 'session-1',
})

/**
 * Plays one tool call through every `PreToolUse` hook the launch set up
 * whose matcher fits the tool, as the SDK would, and gives the first
 * denial, or `{}` when every hook let it through.
 */
const preToolUse = async ({
    options,
    tool_name,
    tool_input,
    tool_use_id,
}: {
    options: Options
    tool_name: string
    tool_input: Record<string, unknown>
    tool_use_id: string
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
                    cwd: realpathSync(repo),
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

/**
 * A tool call as it happens: the agent's message asking for it, then the
 * guard hook (which must let it through), then `then`.
 */
const call = ({
    id,
    name,
    input,
    usage = {
        input_tokens: 0,
        output_tokens: 0,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
    },
}: {
    id: string
    name: string
    input: Record<string, unknown>
    usage?: Parameters<typeof assistant>[0]['usage']
}): Step[] => [
    assistant({ id: `msg-${id}`, content: [toolUse(id, name, input)], usage }),
    async (options: Options) => {
        expect(
            await preToolUse({
                options,
                tool_name: name,
                tool_input: input,
                tool_use_id: id,
            })
        ).toEqual({})
    },
]

/**
 * Launches the implementer on #11 with `query`, and keeps every progress
 * it hears, as a copy taken when it was heard.
 */
const launchWatched = async ({
    query,
    prompt = 'Build ticket #11.',
    heard,
}: {
    query: AgentQuery
    prompt?: string
    heard: unknown[]
}) => {
    const launcher = createClaudeLauncher({ query, claude_path: CLAUDE_PATH })
    const turn = await launcher.launch({
        role: 'implementer',
        ticket: 11,
        prompt,
        cwd: repo,
        may_edit_tests: false,
        config: CONFIG,
        messaging: null,
        model: 'opus',
        on_progress: (progress: unknown) => {
            heard.push(JSON.parse(JSON.stringify(progress)))
        },
    })
    await launcher.closeAll()
    return turn
}

describe("a turn's live progress", () => {
    test('mid-turn, on_progress has heard the tokens so far and the latest action, its path relative to the worktree', async () => {
        const heard: unknown[] = []
        let midTurn: unknown = null
        const file_path = join(realpathSync(repo), 'src/gate-runner.ts')
        const query = playing({
            steps: [
                INIT,
                ...call({
                    id: 'toolu_edit',
                    name: 'Edit',
                    input: { file_path, old_string: 'a', new_string: 'b' },
                    usage: {
                        input_tokens: 100,
                        output_tokens: 250,
                        cache_read_input_tokens: 4000,
                        cache_creation_input_tokens: 600,
                    },
                }),
                toolResult('toolu_edit', 'The file was edited.'),
                async () => {
                    midTurn = heard.at(-1) ?? null
                },
                result({ structured_output: IMPLEMENTER_DONE }),
            ],
        })

        const turn = await launchWatched({ query, heard })

        expect(turn.ok).toBe(true)
        expect(midTurn).toMatchObject({
            tokens: 100 + 250 + 4000 + 600,
            action: {
                tool: 'Edit',
                target: 'src/gate-runner.ts',
                at: expect.any(String),
            },
        })
    })

    test('a tool call the guard let through is open, with its start time, until its result comes back', async () => {
        const heard: unknown[] = []
        const seen: Record<string, unknown> = {}
        const query = playing({
            steps: [
                INIT,
                ...call({
                    id: 'toolu_bash',
                    name: 'Bash',
                    input: { command: 'bun test', description: 'Run tests' },
                }),
                async () => {
                    seen.open = heard.at(-1) ?? null
                },
                toolResult('toolu_bash', '12 pass, 0 fail'),
                async () => {
                    seen.closed = heard.at(-1) ?? null
                },
                result({ structured_output: IMPLEMENTER_DONE }),
            ],
        })

        await launchWatched({ query, heard })

        // Read before matching: Bun's toMatchObject swaps matched fields for the matcher.
        const startedAt = (
            seen.open as { open_call?: { started_at?: unknown } } | null
        )?.open_call?.started_at
        expect(typeof startedAt).toBe('string')
        expect(Number.isNaN(Date.parse(startedAt as string))).toBe(false)
        expect(seen.open).toMatchObject({
            open_call: {
                tool: 'Bash',
                target: 'bun test',
            },
        })
        expect(seen.closed).toMatchObject({
            open_call: null,
            action: { tool: 'Bash', target: 'bun test' },
        })
    })

    test("the progress never holds the prompt, a file's contents or a command's output", async () => {
        const heard: unknown[] = []
        const secrets = {
            prompt: 'PROMPT-SECRET-7f3a',
            written: 'FILE-CONTENT-SECRET-91bc',
            read: 'READ-CONTENT-SECRET-44d0',
            output: 'COMMAND-OUTPUT-SECRET-c2e8',
        }
        const root = realpathSync(repo)
        const command = 'bun test src/sum.test.ts --timeout 5000'
        const query = playing({
            steps: [
                INIT,
                ...call({
                    id: 'toolu_read',
                    name: 'Read',
                    input: { file_path: join(root, 'src/sum.ts') },
                }),
                toolResult('toolu_read', `export const x = '${secrets.read}'`),
                assistant({
                    id: 'msg-bash',
                    content: [toolUse('toolu_bash', 'Bash', { command })],
                    usage: {
                        input_tokens: 1,
                        output_tokens: 1,
                        cache_read_input_tokens: 0,
                        cache_creation_input_tokens: 0,
                    },
                }),
                toolResult('toolu_bash', `${secrets.output}\n1 pass`),
                ...call({
                    id: 'toolu_write',
                    name: 'Write',
                    input: {
                        file_path: join(root, 'src/notes.ts'),
                        content: `export const notes = '${secrets.written}'`,
                    },
                }),
                toolResult('toolu_write', 'File created.'),
                result({ structured_output: IMPLEMENTER_DONE }),
            ],
        })

        await launchWatched({
            query,
            prompt: `Build ticket #11. ${secrets.prompt}`,
            heard,
        })

        expect(heard.length).toBeGreaterThan(0)
        const bash = heard.find(
            (progress) =>
                (progress as { action?: { tool?: string } }).action?.tool ===
                'Bash'
        ) as { action: { target: string } } | undefined
        expect(bash?.action.target.length).toBeGreaterThan(0)
        expect(command.startsWith(bash?.action.target ?? '-')).toBe(true)
        expect(heard.at(-1)).toMatchObject({
            action: { tool: 'Write', target: 'src/notes.ts' },
        })
        const all = JSON.stringify(heard)
        for (const secret of Object.values(secrets)) {
            expect(all).not.toContain(secret)
        }
    })

    test('a plan-usage reading reaches on_progress as soon as it arrives, before the turn ends', async () => {
        const heard: unknown[] = []
        let midTurn: unknown = null
        const info = {
            status: 'allowed',
            rateLimitType: 'seven_day',
            isUsingOverage: false,
            unifiedWindows: {
                seven_day: { utilization: 0.42, resetsAt: 1790179800 },
            },
        }
        const query = playing({
            steps: [
                INIT,
                { type: 'rate_limit_event', rate_limit_info: info },
                async () => {
                    midTurn = heard.at(-1) ?? null
                },
                result({ structured_output: IMPLEMENTER_DONE }),
            ],
        })

        await launchWatched({ query, heard })

        expect(midTurn).toMatchObject({ rate_limit_events: [info] })
    })
})

/**
 * A streamed chunk of the model's answer, as the SDK sends it when partial
 * messages are on (#631): a `stream_event` carrying a content delta.
 */
const chunk = (
    text: string,
    kind: 'text_delta' | 'thinking_delta' = 'text_delta'
) => ({
    type: 'stream_event',
    event: {
        type: 'content_block_delta',
        index: 0,
        delta:
            kind === 'text_delta'
                ? { type: 'text_delta', text }
                : { type: 'thinking_delta', thinking: text },
    },
    parent_tool_use_id: null,
    session_id: 'session-1',
    uuid: `uuid-chunk-${text}`,
})

describe('partial messages and the heartbeat (#631)', () => {
    test('the launch turns on partial messages, and on_progress hears each streamed chunk as it arrives, before the turn ends', async () => {
        const heard: unknown[] = []
        const seen: { partial?: unknown; before?: number; after?: number } = {}
        const query = playing({
            steps: [
                INIT,
                async (options: Options) => {
                    seen.partial = options.includePartialMessages
                    seen.before = heard.length
                },
                chunk('thinking about it', 'thinking_delta'),
                chunk('Let me '),
                chunk('look at '),
                chunk('the file.'),
                async () => {
                    seen.after = heard.length
                },
                result({ structured_output: IMPLEMENTER_DONE }),
            ],
        })

        const turn = await launchWatched({ query, heard })

        expect(turn.ok).toBe(true)
        expect(seen.partial).toBe(true)
        // Four chunks, four more hearings, none of them waiting for the next whole message.
        expect((seen.after ?? 0) - (seen.before ?? 0)).toBeGreaterThanOrEqual(4)
    })

    test('what a turn gives back is the same with streamed chunks in it: nothing of them is kept', async () => {
        // The SDK only streams chunks when the launch asked for them.
        let asked: unknown = null
        const messages = (streamed: boolean) => [
            INIT,
            async (options: Options) => {
                asked = options.includePartialMessages
            },
            ...(streamed
                ? [
                      {
                          type: 'stream_event',
                          event: {
                              type: 'message_start',
                              message: {
                                  id: 'msg-edit',
                                  usage: {
                                      input_tokens: 77,
                                      output_tokens: 1,
                                      cache_read_input_tokens: 0,
                                      cache_creation_input_tokens: 0,
                                  },
                              },
                          },
                          parent_tool_use_id: null,
                          session_id: 'session-1',
                          uuid: 'uuid-start',
                      },
                      chunk('STREAM-SECRET-5d1e '),
                      chunk('STREAM-SECRET-9a77', 'thinking_delta'),
                  ]
                : []),
            ...call({
                id: 'toolu_edit',
                name: 'Edit',
                input: {
                    file_path: join(realpathSync(repo), 'src/gate-runner.ts'),
                    old_string: 'a',
                    new_string: 'b',
                },
                usage: {
                    input_tokens: 100,
                    output_tokens: 250,
                    cache_read_input_tokens: 4000,
                    cache_creation_input_tokens: 600,
                },
            }),
            ...(streamed ? [chunk('STREAM-SECRET-c3b0')] : []),
            toolResult('toolu_edit', 'The file was edited.'),
            result({ structured_output: IMPLEMENTER_DONE }),
        ]
        const run = async (streamed: boolean) => {
            const heard: unknown[] = []
            const turn = await launchWatched({
                query: playing({ steps: messages(streamed) }),
                heard,
            })
            // The wall clock differs between any two runs.
            const kept = JSON.parse(JSON.stringify(turn)) as {
                session?: Record<string, unknown>
            }
            delete kept.session?.duration_ms
            return { kept, last: heard.at(-1) as { tokens: number } }
        }

        const plain = await run(false)
        const streamed = await run(true)

        expect(asked).toBe(true)
        expect(streamed.kept).toEqual(plain.kept)
        expect(JSON.stringify(streamed.kept)).not.toContain('STREAM-SECRET')
        // A chunk never changes the turn's tokens either; the whole message does.
        expect(streamed.last.tokens).toBe(plain.last.tokens)
        expect(plain.last.tokens).toBe(100 + 250 + 4000 + 600)
    })
})

describe('the docs on the live file (#628)', () => {
    const ROOT = join(import.meta.dir, '../../../..')
    const ENGINE = join(ROOT, 'packages/engine')

    test('the glossary has Live file, and the engine docs describe live.json, kept out of the journal', async () => {
        const glossary = await Bun.file(join(ROOT, 'GLOSSARY.md')).text()
        const entry = glossary.match(/^\*\*Live file\*\*:\n(.+)$/m)?.[1] ?? null
        const paths = [
            join(ENGINE, 'README.md'),
            ...[...new Bun.Glob('*.md').scanSync(join(ENGINE, 'docs'))].map(
                (name) => join(ENGINE, 'docs', name)
            ),
        ]
        const texts = await Promise.all(
            paths.map((path) => Bun.file(path).text())
        )
        const describing = texts.filter((text) => text.includes('live.json'))

        expect(entry).toMatch(/board/i)
        expect(entry).toMatch(/journal/i)
        expect(describing.length).toBeGreaterThan(0)
        expect(describing.join('\n')).toMatch(/written_at/)
    })
})
