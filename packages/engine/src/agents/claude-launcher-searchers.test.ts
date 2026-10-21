import type { HookJSONOutput, Options } from '@anthropic-ai/claude-agent-sdk'
import { describe, expect, test } from 'bun:test'

import { createClaudeLauncher, type AgentQuery } from './claude-launcher'
import {
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
import { AgentRoleSchema } from './role-results'

import { JournalRecordSchema } from '../journal/journal-record'
import { runTokensIn } from '../limits/run-budget'
import { preToolUse as playCall } from '../testing/sdk-play'

/**
 * The launcher seam: `createClaudeLauncher` with a fake `query` that plays
 * back SDK-shaped messages, and a fake `claude` path. No model, no process.
 *
 * Here: helpers (#627), the read-only Haiku `searcher` sessions an agent may
 * start with the SDK's `Agent` tool. Their launch option, what the guard
 * hook lets them do, and how a turn counts them.
 */

repoPerTest()

let toolCount = 0

/**
 * Plays one tool call through the launch's guard hooks (see `sdk-play`),
 * as call `tool-<n>`, numbered across the file, and gives the first
 * denial, or `{}`.
 */
const preToolUse = (args: {
    options: Options
    tool_name: string
    tool_input: Record<string, unknown>
    helper?: boolean
}): Promise<HookJSONOutput> => {
    toolCount += 1
    return playCall({ ...args, tool_use_id: `tool-${toolCount}`, cwd: repo })
}

const DENIED = {
    hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
    },
}

/** An `Agent` tool call that starts a helper of `subagent_type`. */
const helperCall = (fields: Record<string, unknown>) => ({
    description: 'Find the callers',
    prompt: 'Find every caller of runTokensIn.',
    run_in_background: false,
    ...fields,
})

/** One model's running totals, as the SDK's result `modelUsage` gives them. */
const modelTotals = (input: number, output: number, creation: number) => ({
    inputTokens: input,
    outputTokens: output,
    cacheReadInputTokens: 5000,
    cacheCreationInputTokens: creation,
})

describe('helpers', () => {
    test("every role's launch carries the searcher helper, on haiku with only Read, Grep and Glob, and may call Agent", async () => {
        for (const role of AgentRoleSchema.options) {
            const fake = fakeQuery({ messages: [INIT, result({})] })
            await launch({ query: fake.query, role })
            const options = fake.calls[0]?.options

            expect(Object.keys(options?.agents ?? {})).toEqual(['searcher'])
            const searcher = options?.agents?.searcher
            expect(searcher?.model).toBe('haiku')
            expect([...(searcher?.tools ?? [])].sort()).toEqual([
                'Glob',
                'Grep',
                'Read',
            ])
            expect(searcher?.prompt).toMatch(/read/i)
            expect(options?.tools).toContain('Agent')
            expect(options?.disallowedTools).not.toContain('Agent')
            expect(options?.disallowedTools).not.toContain('Task')
        }
    })

    test("every role's searcher helper runs at low effort", async () => {
        const efforts: Record<string, unknown> = {}
        for (const role of AgentRoleSchema.options) {
            const fake = fakeQuery({ messages: [INIT, result({})] })
            await launch({ query: fake.query, role })
            efforts[role] = fake.calls[0]?.options.agents?.searcher?.effort
        }

        expect(efforts).toEqual(
            Object.fromEntries(
                AgentRoleSchema.options.map((role) => [role, 'low'])
            )
        )
    })

    test('the guard refuses a helper of another type, and a fourth searcher while 3 run, as guard denials', async () => {
        const answers: HookJSONOutput[] = []
        const fake = fakeQuery({
            messages: [INIT, result({ structured_output: IMPLEMENTER_DONE })],
            during: async (call) => {
                const ask = (subagent_type: string) =>
                    preToolUse({
                        options: call.options,
                        tool_name: 'Agent',
                        tool_input: helperCall({ subagent_type }),
                    })
                answers.push(await ask('general-purpose'))
                for (let index = 0; index < 4; index += 1) {
                    answers.push(await ask('searcher'))
                }
            },
        })
        const turn = await launch({ query: fake.query, role: 'implementer' })

        expect(answers[0]).toMatchObject(DENIED)
        expect(answers.slice(1, 4)).toEqual([{}, {}, {}])
        expect(answers[4]).toMatchObject(DENIED)
        expect(turn.session?.guard_denials).toEqual([
            { tool_name: 'Agent', reason: expect.any(String) },
            { tool_name: 'Agent', reason: expect.any(String) },
        ])
    })

    test("a searcher's result frees its slot, so a new searcher may start while 3 others ran", async () => {
        const answers: HookJSONOutput[] = []
        const started: string[] = []
        const freed = {
            type: 'user',
            message: { role: 'user', content: [] as unknown[] },
            parent_tool_use_id: null,
            session_id: 'session-1',
        }
        const ask = (options: Options) =>
            preToolUse({
                options,
                tool_name: 'Agent',
                tool_input: helperCall({ subagent_type: 'searcher' }),
            })
        const fake = fakeQuery({
            messages: [
                INIT,
                freed,
                result({ structured_output: IMPLEMENTER_DONE }),
            ],
            during: async (call) => {
                for (let index = 0; index < 3; index += 1) {
                    answers.push(await ask(call.options))
                    started.push(`tool-${toolCount}`)
                }
                freed.message.content.push({
                    type: 'tool_result',
                    tool_use_id: started[0],
                    content: 'Found 2 callers.',
                })
            },
        })
        // Asks again once the launcher has read the helper's result.
        const query: AgentQuery = (params) => {
            const inner = fake.query(params)
            return {
                ...inner,
                [Symbol.asyncIterator]: async function* () {
                    for await (const message of inner) {
                        yield message
                        if (message !== freed) continue
                        answers.push(await ask(params.options))
                        answers.push(await ask(params.options))
                    }
                },
            }
        }
        await launch({ query, role: 'implementer' })

        expect(answers.slice(0, 3)).toEqual([{}, {}, {}])
        expect(answers[3]).toEqual({})
        expect(answers[4]).toMatchObject(DENIED)
    })

    test('a follow-up turn starts with no helpers running, since the last result ended them', async () => {
        const answers: HookJSONOutput[][] = [[], []]
        const fake = fakeQuery({
            turns: [
                [INIT, result({ structured_output: { n: 1 } })],
                [result({ structured_output: IMPLEMENTER_DONE })],
            ],
            during: async (call, turn) => {
                const count = turn === 0 ? 3 : 4
                for (let index = 0; index < count; index += 1) {
                    answers[turn]?.push(
                        await preToolUse({
                            options: call.options,
                            tool_name: 'Agent',
                            tool_input: helperCall({
                                subagent_type: 'searcher',
                            }),
                        })
                    )
                }
            },
        })
        const launcher = createClaudeLauncher({
            query: fake.query,
            claude_path: CLAUDE_PATH,
        })
        await launcher.launch({
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
        await launcher.followUp({
            session_id: 'session-1',
            role: 'implementer',
            ticket: 11,
            message: 'lint failed: fix it.',
            cwd: repo,
            config: CONFIG,
        })
        await launcher.closeAll()

        expect(answers[0]).toEqual([{}, {}, {}])
        expect(answers[1]?.slice(0, 3)).toEqual([{}, {}, {}])
        expect(answers[1]?.[3]).toMatchObject(DENIED)
    })

    test('a searcher asked to run on a Fable model is refused', async () => {
        let answer: HookJSONOutput = {}
        const fake = fakeQuery({
            messages: [INIT, result({ structured_output: IMPLEMENTER_DONE })],
            during: async (call) => {
                answer = await preToolUse({
                    options: call.options,
                    tool_name: 'Agent',
                    tool_input: helperCall({
                        subagent_type: 'searcher',
                        model: 'fable',
                    }),
                })
            },
        })
        const turn = await launch({ query: fake.query, role: 'implementer' })

        expect(answer).toMatchObject(DENIED)
        expect(turn.session?.guard_denials).toEqual([
            { tool_name: 'Agent', reason: expect.stringMatching(/fable/i) },
        ])
    })

    test("a helper's own tool calls are held to reading: its writes and commands are refused, even under an implementer", async () => {
        const answers: Record<string, HookJSONOutput> = {}
        const fake = fakeQuery({
            messages: [INIT, result({ structured_output: IMPLEMENTER_DONE })],
            during: async (call) => {
                const file_path = `${repo}/src/sum.ts`
                const calls: [string, Record<string, unknown>][] = [
                    ['Write', { file_path, content: 'export {}' }],
                    ['Edit', { file_path, old_string: 'a', new_string: 'b' }],
                    ['Bash', { command: 'ls' }],
                    ['Read', { file_path }],
                ]
                for (const [tool_name, tool_input] of calls) {
                    answers[tool_name] = await preToolUse({
                        options: call.options,
                        tool_name,
                        tool_input,
                        helper: true,
                    })
                }
            },
        })
        await launch({ query: fake.query, role: 'implementer' })

        expect(answers.Write).toMatchObject(DENIED)
        expect(answers.Edit).toMatchObject(DENIED)
        expect(answers.Bash).toMatchObject(DENIED)
        expect(answers.Read).toEqual({})
    })

    test('a turn counts the helpers it started in helpers_started, and their Haiku tokens count toward the run budget', async () => {
        const fake = fakeQuery({
            messages: [
                INIT,
                result({
                    structured_output: IMPLEMENTER_DONE,
                    modelUsage: {
                        'claude-opus-5-5': modelTotals(100, 200, 400),
                        'claude-haiku-4-5': modelTotals(50, 60, 80),
                    },
                }),
            ],
            during: async (call) => {
                for (const subagent_type of ['searcher', 'searcher', 'other']) {
                    await preToolUse({
                        options: call.options,
                        tool_name: 'Agent',
                        tool_input: helperCall({ subagent_type }),
                    })
                }
            },
        })
        const turn = await launch({ query: fake.query, role: 'implementer' })
        const record = JournalRecordSchema.parse({
            seq: 1,
            time: new Date(0).toISOString(),
            kind: 'agent_session',
            ticket: 11,
            role: 'implementer',
            content: { role: 'implementer', session: turn.session },
        })

        expect(turn.session?.helpers_started).toBe(2)
        expect(runTokensIn({ records: [record] })).toBe(700 + 190)
    })

    test('an agent_session from a journal before helpers reads helpers_started as 0', () => {
        const record = JournalRecordSchema.parse({
            seq: 1,
            time: new Date(0).toISOString(),
            kind: 'agent_session',
            ticket: 11,
            role: 'implementer',
            content: {
                role: 'implementer',
                session: {
                    session_id: 'session-1',
                    model: 'claude-opus-5-5',
                    num_turns: 3,
                },
            },
        })
        if (record.kind !== 'agent_session') throw new Error(record.kind)

        expect(record.content.session.helpers_started).toBe(0)
    })
})
