import { readFileSync, realpathSync } from 'node:fs'
import { join } from 'node:path'

import type { Options } from '@anthropic-ai/claude-agent-sdk'
import { describe, expect, test } from 'bun:test'

import { createLiveFile } from './live-file'

import {
    createClaudeLauncher,
    type AgentQuery,
} from '../agents/claude-launcher'
import {
    CLAUDE_PATH,
    CONFIG,
    fakeQuery,
    IMPLEMENTER_DONE,
    INIT,
    repo,
    repoPerTest,
    result,
} from '../agents/claude-launcher-helpers'

/**
 * Helpers in the live file (#636): while an agent's turn runs, its entry in
 * `live.json` lists the helpers it started, each with its model, its
 * latest action (with that action's time), and whether it's done; and each
 * helper action goes in the run's live feed like any other. The file is
 * made by `createLiveFile` around the real launcher, whose fake `query`
 * plays SDK-shaped messages: the agent's `Agent` call that starts a
 * `searcher`, the helper's own messages (with `parent_tool_use_id` set to
 * that call), and the helper's result coming back.
 */

repoPerTest()

type Helper = {
    model?: unknown
    action?: { tool?: unknown; target?: unknown; at?: unknown } | null
    done?: unknown
}

type Live = {
    agents: { ticket?: unknown; role?: unknown; helpers?: Helper[] }[]
    feed?: Record<string, unknown>[]
}

/** A step: an SDK message, or work to do once the launcher has read the message before it. */
type Step = unknown | ((options: Options) => Promise<void>)

/** A fake `query` playing `steps`, each function after the message before it. */
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

/** One API response, the agent's (`parent` null) or a helper's. */
const assistant = ({
    id,
    parent,
    model,
    content,
}: {
    id: string
    parent: string | null
    model: string
    content: unknown[]
}) => ({
    type: 'assistant',
    message: {
        id,
        type: 'message',
        role: 'assistant',
        model,
        content,
        stop_reason: 'tool_use',
        usage: {
            input_tokens: 10,
            output_tokens: 10,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
        },
    },
    parent_tool_use_id: parent,
    session_id: 'session-1',
    uuid: `uuid-${id}`,
})

/** A tool's result, handed back to the agent (`parent` null) or a helper. */
const toolResult = ({
    tool_use_id,
    parent,
    content,
}: {
    tool_use_id: string
    parent: string | null
    content: string
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
 * Plays one tool call through every `PreToolUse` hook that fits it, as the
 * SDK would, and expects it let through. With `helper`, the call comes
 * from inside a helper (the SDK's `agent_id` and `agent_type`).
 */
const guarded = async ({
    options,
    tool_name,
    tool_input,
    tool_use_id,
    helper = false,
}: {
    options: Options
    tool_name: string
    tool_input: Record<string, unknown>
    tool_use_id: string
    helper?: boolean
}) => {
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
                    ...(helper
                        ? { agent_id: 'helper-1', agent_type: 'searcher' }
                        : {}),
                },
                tool_use_id,
                { signal }
            )
            expect(JSON.stringify(answer)).not.toContain('"deny"')
        }
    }
}

const readLive = (file: string): Live | null => {
    try {
        return JSON.parse(readFileSync(file, 'utf8')) as Live
    } catch {
        return null
    }
}

/** The live file once `until` holds for it, or `null` after `ms`. */
const waitForLive = async ({
    file,
    until,
    ms = 4000,
}: {
    file: string
    until: (live: Live) => boolean
    ms?: number
}): Promise<Live | null> => {
    const deadline = Date.now() + ms
    while (Date.now() < deadline) {
        const live = readLive(file)
        if (live !== null && until(live)) return live
        await Bun.sleep(20)
    }
    return null
}

const helpersOf = (live: Live): Helper[] => live.agents[0]?.helpers ?? []

const SECRETS = {
    prompt: 'HELPER-PROMPT-SECRET-3e1f',
    output: 'GREP-OUTPUT-SECRET-77a2',
    found: 'HELPER-RESULT-SECRET-b09c',
}

/**
 * #11's implementer starts a searcher, which greps for `createSlots`; the
 * live file as it is while the helper runs (`until: 'running'`), or once its
 * result is back (`until: 'done'`). Only one is waited for, since the file
 * is written at most once a second.
 */
const turnWithHelper = async ({ until }: { until: 'running' | 'done' }) => {
    const file = join(realpathSync(repo), 'run-1', 'live.json')
    const live = createLiveFile({ file })
    const seen: { live: Live | null } = { live: null }
    const helperBack = toolResult({
        tool_use_id: 'toolu_helper',
        parent: null,
        content: `${SECRETS.found}: 3 callers.`,
    })
    const waitRunning = async () => {
        seen.live = await waitForLive({
            file,
            until: (found) => helpersOf(found)[0]?.action?.tool === 'Grep',
        })
    }
    const waitDone = async () => {
        seen.live = await waitForLive({
            file,
            until: (found) => helpersOf(found)[0]?.done === true,
        })
    }
    const agentCall = {
        subagent_type: 'searcher',
        description: 'Find the callers',
        prompt: `${SECRETS.prompt}: find every caller of createSlots.`,
        run_in_background: false,
    }
    const grep = { pattern: 'createSlots', path: realpathSync(repo) }
    const query = playing({
        steps: [
            INIT,
            assistant({
                id: 'msg-agent',
                parent: null,
                model: 'claude-opus-5-5',
                content: [
                    {
                        type: 'tool_use',
                        id: 'toolu_helper',
                        name: 'Agent',
                        input: agentCall,
                    },
                ],
            }),
            (options: Options) =>
                guarded({
                    options,
                    tool_name: 'Agent',
                    tool_input: agentCall,
                    tool_use_id: 'toolu_helper',
                }),
            assistant({
                id: 'msg-grep',
                parent: 'toolu_helper',
                model: 'claude-haiku-5-5',
                content: [
                    {
                        type: 'tool_use',
                        id: 'toolu_grep',
                        name: 'Grep',
                        input: grep,
                    },
                ],
            }),
            (options: Options) =>
                guarded({
                    options,
                    tool_name: 'Grep',
                    tool_input: grep,
                    tool_use_id: 'toolu_grep',
                    helper: true,
                }),
            toolResult({
                tool_use_id: 'toolu_grep',
                parent: 'toolu_helper',
                content: `${SECRETS.output}\nsrc/gate-runner.ts:12`,
            }),
            ...(until === 'running'
                ? [waitRunning, helperBack]
                : [helperBack, waitDone]),
            result({ structured_output: IMPLEMENTER_DONE }),
        ],
    })
    const launcher = live.launcher(
        createClaudeLauncher({ query, claude_path: CLAUDE_PATH })
    )
    const turn = await launcher.launch({
        role: 'implementer',
        ticket: 11,
        prompt: 'Build ticket #11.',
        cwd: repo,
        may_edit_tests: false,
        config: CONFIG,
        messaging: null,
        model: 'opus',
    })
    await launcher.closeAll()
    live.close()
    expect(turn.ok).toBe(true)
    return seen.live
}

describe('helpers in the live file (#636)', () => {
    test("while a helper runs, its agent's entry lists it with its model, latest action and time, not done", async () => {
        const running = await turnWithHelper({ until: 'running' })

        expect(running).not.toBeNull()
        if (running === null) return
        expect(running.agents[0]).toMatchObject({
            ticket: 11,
            role: 'implementer',
        })
        const helpers = helpersOf(running)
        expect(helpers).toHaveLength(1)
        const at = helpers[0]?.action?.at
        expect(typeof at).toBe('string')
        expect(Number.isNaN(Date.parse(String(at)))).toBe(false)
        expect(helpers[0]).toMatchObject({
            model: 'haiku',
            action: { tool: 'Grep', target: 'createSlots' },
            done: false,
        })
        // Short words only: no prompt and no output.
        for (const secret of Object.values(SECRETS)) {
            expect(JSON.stringify(running)).not.toContain(secret)
        }
    }, 15_000)

    test("once a helper's result is back, its agent's entry lists it as done, keeping its model and latest action", async () => {
        const done = await turnWithHelper({ until: 'done' })

        expect(done).not.toBeNull()
        if (done === null) return
        expect(helpersOf(done)).toHaveLength(1)
        expect(helpersOf(done)[0]).toMatchObject({
            model: 'haiku',
            action: { tool: 'Grep', target: 'createSlots' },
            done: true,
        })
        for (const secret of Object.values(SECRETS)) {
            expect(JSON.stringify(done)).not.toContain(secret)
        }
    }, 15_000)

    test("a helper's actions go in the live feed, with its ticket and Haiku", async () => {
        const running = await turnWithHelper({ until: 'running' })

        expect(running).not.toBeNull()
        expect(running?.feed ?? []).toContainEqual(
            expect.objectContaining({
                ticket: 11,
                model: 'haiku',
                tool: 'Grep',
                target: 'createSlots',
                at: expect.any(String),
            })
        )
    }, 15_000)
})
