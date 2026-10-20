import { realpathSync } from 'node:fs'
import { join } from 'node:path'

import type { Options } from '@anthropic-ai/claude-agent-sdk'
import { describe, expect, test } from 'bun:test'

import { createClaudeLauncher, type AgentQuery } from './claude-launcher'
import {
    CLAUDE_PATH,
    CONFIG,
    IMPLEMENTER_DONE,
    INIT,
    repo,
    repoPerTest,
    result,
} from './claude-launcher-helpers'
import type { TurnProgress } from './turn-progress'

import {
    assistant,
    playing,
    preToolUse,
    toolResult,
    toolUse,
    type Step,
    type Usage,
} from '../testing/sdk-play'

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
    usage?: Usage
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
    heard: TurnProgress[]
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
        on_progress: (progress) => {
            heard.push(structuredClone(progress))
        },
    })
    await launcher.closeAll()
    return turn
}

describe("a turn's live progress", () => {
    test('mid-turn, on_progress has heard the tokens so far and the latest action, its path relative to the worktree', async () => {
        const heard: TurnProgress[] = []
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
                toolResult({
                    tool_use_id: 'toolu_edit',
                    content: 'The file was edited.',
                }),
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
        const heard: TurnProgress[] = []
        const seen: { open?: TurnProgress; closed?: TurnProgress } = {}
        const query = playing({
            steps: [
                INIT,
                ...call({
                    id: 'toolu_bash',
                    name: 'Bash',
                    input: { command: 'bun test', description: 'Run tests' },
                }),
                async () => {
                    seen.open = heard.at(-1)
                },
                toolResult({
                    tool_use_id: 'toolu_bash',
                    content: '12 pass, 0 fail',
                }),
                async () => {
                    seen.closed = heard.at(-1)
                },
                result({ structured_output: IMPLEMENTER_DONE }),
            ],
        })

        await launchWatched({ query, heard })

        // Read before matching: Bun's toMatchObject swaps matched fields for the matcher.
        const startedAt = seen.open?.open_call?.started_at
        expect(typeof startedAt).toBe('string')
        expect(Number.isNaN(Date.parse(startedAt ?? ''))).toBe(false)
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
        const heard: TurnProgress[] = []
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
                toolResult({
                    tool_use_id: 'toolu_read',
                    content: `export const x = '${secrets.read}'`,
                }),
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
                toolResult({
                    tool_use_id: 'toolu_bash',
                    content: `${secrets.output}\n1 pass`,
                }),
                ...call({
                    id: 'toolu_write',
                    name: 'Write',
                    input: {
                        file_path: join(root, 'src/notes.ts'),
                        content: `export const notes = '${secrets.written}'`,
                    },
                }),
                toolResult({
                    tool_use_id: 'toolu_write',
                    content: 'File created.',
                }),
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
            (progress) => progress.action?.tool === 'Bash'
        )?.action
        expect(bash?.target.length).toBeGreaterThan(0)
        expect(command.startsWith(bash?.target ?? '-')).toBe(true)
        expect(heard.at(-1)).toMatchObject({
            action: { tool: 'Write', target: 'src/notes.ts' },
        })
        const all = JSON.stringify(heard)
        for (const secret of Object.values(secrets)) {
            expect(all).not.toContain(secret)
        }
    })

    test('a plan-usage reading reaches on_progress as soon as it arrives, before the turn ends', async () => {
        const heard: TurnProgress[] = []
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
        const heard: TurnProgress[] = []
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
            toolResult({
                tool_use_id: 'toolu_edit',
                content: 'The file was edited.',
            }),
            result({ structured_output: IMPLEMENTER_DONE }),
        ]
        const run = async (streamed: boolean) => {
            const heard: TurnProgress[] = []
            const turn = await launchWatched({
                query: playing({ steps: messages(streamed) }),
                heard,
            })
            // The wall clock differs between any two runs.
            const kept = {
                ...turn,
                session: turn.session && { ...turn.session, duration_ms: 0 },
            }
            return { kept, last: heard.at(-1)?.tokens }
        }

        const plain = await run(false)
        const streamed = await run(true)

        expect(asked).toBe(true)
        expect(streamed.kept).toEqual(plain.kept)
        expect(JSON.stringify(streamed.kept)).not.toContain('STREAM-SECRET')
        // A chunk never changes the turn's tokens either; the whole message does.
        expect(streamed.last).toBe(plain.last ?? -1)
        expect(plain.last).toBe(100 + 250 + 4000 + 600)
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
