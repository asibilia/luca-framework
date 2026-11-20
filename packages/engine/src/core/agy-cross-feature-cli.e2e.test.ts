import {
    existsSync,
    mkdirSync,
    readFileSync,
    realpathSync,
    writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

import { afterEach, describe, expect, test } from 'bun:test'
import { z } from 'zod'

import { decideUsageLine } from './decide-usage-line'

import {
    engineArgs,
    parseRunArgs as parseBoardRunArgs,
} from '../../../board/server/engine-launch'
import { createAgyLauncher } from '../agents/agy-launcher'
import type { ProviderId } from '../agents/provider'
import { createProviderLauncher } from '../agents/provider-launcher'
import { roleInstructions } from '../agents/role-instructions'
import { parseRunArgs } from '../cli/run-args'
import { resumeRun, runSpec } from '../cli/run-modes'
import { fakeClaudeLauncher } from '../cli/run-modes-helpers'
import { replayRun } from '../journal/replay'
import {
    cleanupDir,
    createFakeAgySpawner,
    createTempRoot,
    makeAgyConfig,
} from '../testing/agy-e2e-helpers'
import { recordsFrom } from '../testing/intake-fixtures'
import {
    HAPPY_TURNS,
    VALID_STORY_TURN,
    makePracticeRepo,
    practiceTracker,
} from '../testing/practice-repo'
import { practiceTicket } from '../testing/run-fixtures'

/** Tier 3 pairwise cross-feature E2E tests for Spec #777 (pairs 12–15). */

const HookCmdSchema = z.object({
    hooks: z.record(
        z.string(),
        z.array(z.object({ hooks: z.array(z.object({ command: z.string() })) }))
    ),
})
const InjectSchema = z.object({
    injectSteps: z.array(
        z.object({ systemMessage: z.object({ systemMessage: z.string() }) })
    ),
})

const roots: string[] = []

afterEach(() => {
    while (roots.length > 0) {
        const dir = roots.pop()
        if (dir !== undefined) cleanupDir({ dir })
    }
})

const makeDirs = () => {
    const root = createTempRoot({ prefix: 'luca-agy-t3-cli-' })
    roots.push(root)
    const cwd = join(root, 'worktree')
    const temp_root = join(root, 'tmp')
    mkdirSync(join(cwd, 'src'), { recursive: true })
    mkdirSync(temp_root, { recursive: true })
    writeFileSync(join(cwd, 'src/app.ts'), 'export const app = 1\n')
    return {
        root,
        cwd: realpathSync(cwd),
        temp_root: realpathSync(temp_root),
    }
}

const callFromAddDir = async ({
    argv,
    env,
    event,
    payload,
}: {
    argv: string[]
    env: Record<string, string>
    event: 'SessionStart' | 'PreToolUse' | 'PreInvocation'
    payload: Record<string, unknown>
}) => {
    const addDir = argv[argv.indexOf('--add-dir') + 1] ?? ''
    const hooks = HookCmdSchema.parse(
        JSON.parse(readFileSync(join(addDir, '.agents/hooks.json'), 'utf8'))
    )
    const command = hooks.hooks[event]?.[0]?.hooks[0]?.command ?? ''
    const proc = Bun.spawn(command.split(' '), {
        stdin: new TextEncoder().encode(JSON.stringify(payload)),
        stdout: 'pipe',
        stderr: 'pipe',
        env,
    })
    const [exit_code, stdout] = await Promise.all([
        proc.exited,
        new Response(proc.stdout).text(),
    ])
    const json: unknown = JSON.parse(stdout)
    return { exit_code, json }
}

const okLines = ({
    id,
    structured_output = { outcome: 'done' },
    model = 'gemini-4-neon-high',
}: {
    id: string
    structured_output?: unknown
    model?: string
}): Record<string, unknown>[] => [
    { event: 'init', conversation_id: id, init: { model } },
    {
        event: 'result',
        result: { conversation_id: id, status: 'SUCCESS', structured_output },
    },
]

const usageCheck = ({
    config,
    shared_readings,
}: {
    config: ReturnType<typeof makeAgyConfig>
    shared_readings: Record<string, unknown>[]
}) =>
    decideUsageLine({
        state: replayRun({
            records: recordsFrom({
                entries: [
                    {
                        kind: 'run_started',
                        ticket: null,
                        role: null,
                        content: {
                            spec_number: 10,
                            config,
                            base_branch: 'main',
                        },
                    },
                    {
                        kind: 'ticket_snapshot',
                        ticket: 11,
                        role: null,
                        content: practiceTicket({ number: 11 }),
                    },
                ],
            }),
        }),
        records: [],
        spec_number: 10,
        next: [{ type: 'launch_agent' }],
        usage_lines: { weekly_line: 80, five_hour_line: 85 },
        shared_readings,
    })

describe('Tier 3 — pairwise launcher, instructions, CLI, and Paseo board integration', () => {
    test('Pair 12 (F10+F12): createAgyLauncher state.json, hooks.json, and LUCA_AGY_STATE_DIR drive real agy-hook.ts', async () => {
        const { cwd, temp_root } = makeDirs()
        let ss0: unknown = null
        let ss1: unknown = null
        let stateDir = ''
        const { spawner } = createFakeAgySpawner({
            turns: [
                {
                    on_spawn: async ({ argv, env }) => {
                        stateDir = env.LUCA_AGY_STATE_DIR ?? ''
                        ss0 = (
                            await callFromAddDir({
                                argv,
                                env,
                                event: 'SessionStart',
                                payload: { hookEventName: 'SessionStart', cwd },
                            })
                        ).json
                        await callFromAddDir({
                            argv,
                            env,
                            event: 'PreToolUse',
                            payload: {
                                hookEventName: 'PreToolUse',
                                toolCall: {
                                    name: 'search_web',
                                    args: { Query: 'x' },
                                },
                            },
                        })
                    },
                    lines: okLines({ id: 'conv-p12' }),
                },
                {
                    on_spawn: async ({ argv, env }) => {
                        ss1 = (
                            await callFromAddDir({
                                argv,
                                env,
                                event: 'SessionStart',
                                payload: { hookEventName: 'SessionStart', cwd },
                            })
                        ).json
                        await callFromAddDir({
                            argv,
                            env,
                            event: 'PreInvocation',
                            payload: {
                                hookEventName: 'PreInvocation',
                                invocationNum: 3,
                            },
                        })
                    },
                    lines: okLines({ id: 'conv-p12' }),
                },
            ],
        })
        const launcher = createAgyLauncher({
            agy_path: '/fake/agy',
            spawn: spawner,
            temp_root,
        })
        const first = await launcher.launch({
            role: 'implementer',
            ticket: 11,
            prompt: 'p',
            cwd,
            may_edit_tests: false,
            config: makeAgyConfig({ provider: 'agy' }),
            messaging: null,
            model: 'gemini-4-neon-high',
            effort: 'medium',
            max_turns: 3,
        })
        expect(first.ok).toBe(true)
        if (first.ok) expect(first.session?.guard_denials).toHaveLength(1)
        expect(ss0).toMatchObject({
            injectSteps: [
                { systemMessage: { systemMessage: expect.any(String) } },
            ],
        })
        const second = await launcher.followUp({
            session_id: 'conv-p12',
            role: 'implementer',
            ticket: 11,
            message: 'again',
            cwd,
            config: makeAgyConfig({ provider: 'agy' }),
        })
        expect(ss1).toEqual({})
        expect(second).toMatchObject({
            ok: false,
            failure: 'agent',
            out_of_turns: true,
        })
        await launcher.closeAll()
        expect(existsSync(stateDir)).toBe(false)
    })

    test('Pair 13 (F11+F12): createAgyLauncher injects agy roleInstructions via SessionStart', async () => {
        const { cwd, temp_root } = makeDirs()
        const config = makeAgyConfig({ provider: 'agy' })
        const injected: Record<string, string> = {}
        const roles = ['implementer', 'learner', 'story-writer'] as const
        const { spawner } = createFakeAgySpawner({
            turns: roles.map((role) => ({
                on_spawn: async ({ argv, env }) => {
                    const res = await callFromAddDir({
                        argv,
                        env,
                        event: 'SessionStart',
                        payload: { hookEventName: 'SessionStart', cwd },
                    })
                    injected[role] =
                        InjectSchema.parse(res.json).injectSteps[0]
                            ?.systemMessage.systemMessage ?? ''
                },
                lines: okLines({
                    id: `conv-${role}`,
                    structured_output: {},
                }),
            })),
        })
        const launcher = createAgyLauncher({
            agy_path: '/fake/agy',
            spawn: spawner,
            temp_root,
        })
        for (const role of roles) {
            await launcher.launch({
                role,
                ticket: 11,
                prompt: 'p',
                cwd,
                may_edit_tests: false,
                config,
                messaging: null,
                model: 'gemini-4-neon-high',
                effort: 'medium',
            })
            expect(injected[role]).toBe(
                roleInstructions({
                    role,
                    may_edit_tests: false,
                    config,
                    messaging: false,
                    provider: 'agy',
                })
            )
            expect(injected[role]).not.toContain('## Helpers')
            expect(injected[role]).not.toContain('## Agent messages')
        }
        await launcher.closeAll()
    })

    test('Pair 14 (F13+F14): Paseo parseRunArgs + engineArgs round-trips into engine cli parseRunArgs', () => {
        const items: { raw: string; spec: number; provider?: ProviderId }[] = [
            { raw: '#42 --provider=AGY', spec: 42, provider: 'agy' },
            { raw: '7 --provider claude', spec: 7, provider: 'claude' },
            { raw: '99', spec: 99 },
        ]
        for (const item of items) {
            const parsed = parseBoardRunArgs({ args: item.raw })
            expect(parsed.ok).toBe(true)
            if (!parsed.ok || parsed.target.kind !== 'spec') {
                throw new Error('expected spec target')
            }
            const argv = engineArgs({
                target: parsed.target,
                repo: '/tmp/repo',
                run_id: 'r-rt',
            })
            expect(
                parseRunArgs({
                    argv,
                    cwd: '/tmp',
                    env: { LUCA_BOARD_TOKEN: 'tok-1' },
                })
            ).toEqual({
                ok: true,
                args: {
                    mode: 'spec',
                    spec_number: item.spec,
                    repo: '/tmp/repo',
                    run_id: 'r-rt',
                    base_branch: null,
                    board: { plugin_id: 'luca-board', token: 'tok-1' },
                    ...(item.provider === undefined
                        ? {}
                        : { provider: item.provider }),
                },
            })
        }
    })

    test('Pair 15 (F12+F13): createProviderLauncher, RunLauncherSource, and decideUsageLine isolate agy', async () => {
        const { cwd } = makeDirs()
        const agyLauncher = createProviderLauncher({ provider: 'agy' })
        expect(
            await agyLauncher.launch({
                role: 'implementer',
                ticket: 11,
                prompt: 'p',
                cwd,
                may_edit_tests: false,
                config: makeAgyConfig({ provider: 'agy' }),
                messaging: null,
                model: 'opus',
                effort: 'medium',
            })
        ).toMatchObject({ ok: false, failure: 'stop' })
        await agyLauncher.closeAll?.()

        const shared_readings = [
            {
                arrived_at: '2026-11-20T12:00:00.000Z',
                rateLimitType: 'five_hour',
                unifiedWindows: {
                    five_hour: { utilization: 0.99, resetsAt: 1890000000 },
                },
            },
        ]
        const claudeConfig = makeAgyConfig({ provider: 'claude' })
        expect(
            usageCheck({
                config: makeAgyConfig({ provider: 'agy' }),
                shared_readings,
            })
        ).toBeNull()
        expect(
            usageCheck({ config: claudeConfig, shared_readings })?.type
        ).toBe('start_usage_line_wait')

        const root = createTempRoot({ prefix: 'luca-agy-t3-p15-' })
        roots.push(root)
        const { repo } = await makePracticeRepo({ root, config: claudeConfig })
        const runs_dir = join(root, 'runs')
        const fake = fakeClaudeLauncher({
            turns: [...HAPPY_TURNS, VALID_STORY_TURN(10)],
        })
        const calls: string[] = []
        const tracker = practiceTracker()
        const end = await runSpec({
            spec_number: 10,
            repo,
            run_id: 'p15-run',
            base_branch: 'main',
            runs_dir,
            tracker,
            launcher: ({ provider }) => {
                calls.push(provider)
                return fake.launcher
            },
            provider: 'agy',
            usage: {
                read_lines: async () => ({
                    weekly_line: 80,
                    five_hour_line: 85,
                }),
                read_shared: async () => shared_readings,
                share: async () => undefined,
            },
            board: null,
            log: () => undefined,
        })
        expect(end.ok).toBe(true)
        const resumed = await resumeRun({
            run_id: 'p15-run',
            runs_dir,
            repo: null,
            tracker: () => tracker,
            launcher: ({ provider }) => {
                calls.push(provider)
                return fake.launcher
            },
            board: null,
            log: () => undefined,
        })
        expect(resumed.ok).toBe(true)
        expect(calls).toEqual(['agy', 'agy'])
    }, 120_000)
})
