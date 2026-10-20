import { realpathSync } from 'node:fs'
import { join } from 'node:path'

import type { Options } from '@anthropic-ai/claude-agent-sdk'
import { describe, expect, test } from 'bun:test'

import { createLiveFile } from './live-file'

import { createClaudeLauncher } from '../agents/claude-launcher'
import {
    CLAUDE_PATH,
    CONFIG,
    IMPLEMENTER_DONE,
    INIT,
    repo,
    repoPerTest,
    result,
} from '../agents/claude-launcher-helpers'
import {
    waitForLive,
    type LiveFile,
    type LiveHelper,
} from '../testing/live-file-fixtures'
import { assistant, playing, preToolUse, toolResult } from '../testing/sdk-play'

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

/**
 * Plays one tool call through the launch's guard hooks, as the SDK would,
 * and expects it let through.
 */
const guarded = async (args: Parameters<typeof preToolUse>[0]) => {
    expect(await preToolUse(args)).toEqual({})
}

const helpersOf = (live: LiveFile): LiveHelper[] =>
    live.agents[0]?.helpers ?? []

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
    const seen: { live: LiveFile | null } = { live: null }
    const helperBack = toolResult({
        tool_use_id: 'toolu_helper',
        content: `${SECRETS.found}: 3 callers.`,
    })
    const waitRunning = async () => {
        seen.live = await waitForLive({
            file,
            ms: 4000,
            until: (found) => helpersOf(found)[0]?.action?.tool === 'Grep',
        })
    }
    const waitDone = async () => {
        seen.live = await waitForLive({
            file,
            ms: 4000,
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
        expect(running?.feed).toContainEqual(
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
