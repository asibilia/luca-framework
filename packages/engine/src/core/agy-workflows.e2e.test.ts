import {
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    realpathSync,
    writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

import { $ } from 'bun'

import { afterEach, describe, expect, test } from 'bun:test'
import { z } from 'zod'

import { decideUsageLine } from './decide-usage-line'

import { createAgyLauncher } from '../agents/agy-launcher'
import type { ProviderId } from '../agents/provider'
import { resumeRun, runSpec } from '../cli/run-modes'
import { fakeClaudeLauncher, recordsOf } from '../cli/run-modes-helpers'
import { replayRun } from '../journal/replay'
import { fileUsageLine, shareReadings } from '../limits/usage-line'
import {
    cleanupDir,
    createFakeAgySpawner,
    createTempRoot,
    makeAgyConfig,
} from '../testing/agy-e2e-helpers'
import {
    CLEAN_LENS_TURNS,
    IMPLEMENTER_RESULT,
    VALID_STORY_TURN,
    happyTurns,
    makePracticeRepo,
    practiceTracker,
} from '../testing/practice-repo'

/** Tier 4 real-world E2E workflow scenarios for Spec #777 (Scenarios 1–2). */

const HookHandlerSchema = z.object({
    type: z.literal('command'),
    command: z.string(),
})
const HookCmdSchema = z.object({
    luca: z.object({
        SessionStart: z.array(HookHandlerSchema),
        PreToolUse: z.array(
            z.object({
                matcher: z.string(),
                hooks: z.array(HookHandlerSchema),
            })
        ),
        PreInvocation: z.array(HookHandlerSchema),
    }),
})

const roots: string[] = []

afterEach(() => {
    while (roots.length > 0) {
        const dir = roots.pop()
        if (dir !== undefined) cleanupDir({ dir })
    }
})

const hookCall = async ({
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
    const command =
        event === 'PreToolUse'
            ? (hooks.luca.PreToolUse[0]?.hooks[0]?.command ?? '')
            : (hooks.luca[event][0]?.command ?? '')
    const proc = Bun.spawn(['sh', '-c', command], {
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

const agyLines = ({
    id,
    structured_output,
    model = 'gemini-4-neon-high',
}: {
    id: string
    structured_output?: unknown
    model?: string
}): Record<string, unknown>[] => [
    { event: 'init', conversation_id: id, init: { model } },
    {
        event: 'result',
        result: {
            conversation_id: id,
            status: 'SUCCESS',
            ...(structured_output === undefined ? {} : { structured_output }),
        },
    },
]

const setupUsageFixture = async ({ root }: { root: string }) => {
    const lines_file = join(root, 'board/usage-lines.json')
    const shared_file = join(root, 'state/plan-readings.json')
    mkdirSync(join(root, 'board'), { recursive: true })
    writeFileSync(
        lines_file,
        JSON.stringify({ weekly_line: 80, five_hour_line: 85 })
    )
    const nowMs = Date.parse('2026-11-20T12:00:00.000Z')
    const resets_at = Math.floor((nowMs + 3_600_000) / 1000)
    await shareReadings({
        file: shared_file,
        readings: [
            { window: 'five_hour', percent: 95, resets_at, arrival: nowMs },
            {
                window: 'seven_day',
                percent: 95,
                resets_at: resets_at + 86_400,
                arrival: nowMs,
            },
        ],
    })
    return fileUsageLine({
        lines_file,
        shared_file,
        now: () => nowMs,
        log: () => undefined,
    })
}

const initCleanRepo = async ({ cwd }: { cwd: string }) => {
    mkdirSync(join(cwd, 'src'), { recursive: true })
    await $`git init -b main && git config user.email t@e.com && git config user.name T`
        .cwd(cwd)
        .quiet()
    writeFileSync(join(cwd, 'src/app.ts'), 'export const x = 1\n')
    writeFileSync(join(cwd, 'src/app.test.ts'), 'export {}\n')
    await $`git add . && git commit -m init`.cwd(cwd).quiet()
}

const preTool = async ({
    argv,
    env,
    name,
    args,
}: {
    argv: string[]
    env: Record<string, string>
    name: string
    args: Record<string, unknown>
}) =>
    (
        await hookCall({
            argv,
            env,
            event: 'PreToolUse',
            payload: { hookEventName: 'PreToolUse', toolCall: { name, args } },
        })
    ).json

describe('Tier 4 — realistic multi-feature agy workflows (Scenarios 1–2)', () => {
    test('Scenario 1: runSpec --provider agy isolates 95% Claude usage lines and resumes on agy when config says claude', async () => {
        const root = createTempRoot({ prefix: 'luca-agy-w1-' })
        roots.push(root)
        const { repo } = await makePracticeRepo({
            root,
            config: makeAgyConfig({
                provider: 'claude',
                floors: {
                    'test-writer': 'sonnet',
                    implementer: 'haiku',
                    learner: 'opus',
                },
            }),
        })
        const runs_dir = join(root, 'runs')
        const usage = await setupUsageFixture({ root })
        const tracker = practiceTracker()
        const { testWriter, implementer, reviewer } = happyTurns()
        const providers: ProviderId[] = []
        const phase1 = fakeClaudeLauncher({
            turns: [
                testWriter,
                {
                    role: 'implementer',
                    ticket: 11,
                    failure: 'stop',
                    error: 'Interrupted.',
                },
            ],
        })
        const common = { runs_dir, usage, board: null, log: () => undefined }
        const stopped = await runSpec({
            ...common,
            spec_number: 10,
            repo,
            run_id: 'w1-run',
            base_branch: 'main',
            tracker,
            launcher: ({ provider }) => {
                providers.push(provider)
                return phase1.launcher
            },
            provider: 'agy',
        })
        expect(stopped.ok).toBe(false)
        expect(phase1.closed()).toBe(1)

        const mid = recordsOf({ runs_dir, run_id: 'w1-run' })
        expect(mid.some((r) => r.kind === 'usage_line_wait_started')).toBe(
            false
        )
        expect(
            decideUsageLine({
                state: replayRun({ records: mid }),
                records: mid,
                spec_number: 10,
                next: [{ type: 'launch_agent' }],
                usage_lines: await usage.read_lines(),
                shared_readings: await usage.read_shared(),
            })
        ).toBeNull()

        const phase2 = fakeClaudeLauncher({
            turns: [
                implementer,
                reviewer,
                ...CLEAN_LENS_TURNS(10),
                VALID_STORY_TURN(10),
            ],
        })
        const resumed = await resumeRun({
            ...common,
            run_id: 'w1-run',
            repo: null,
            tracker: () => tracker,
            launcher: ({ provider }) => {
                providers.push(provider)
                return phase2.launcher
            },
        })
        expect(resumed).toEqual({
            ok: true,
            message: expect.stringContaining('PR opened'),
        })
        expect(providers).toEqual(['agy', 'agy'])
        expect(phase2.closed()).toBe(1)
        const fin = recordsOf({ runs_dir, run_id: 'w1-run' })
        expect(fin.some((r) => r.kind === 'usage_line_wait_started')).toBe(
            false
        )
        if (fin[0]?.kind === 'run_started') {
            expect(fin[0].content.config.models?.floors).toEqual({
                'test-writer': 'gemini-4-argon-high',
                implementer: 'gemini-3.8-flash-high',
                learner: 'gemini-4-neon-high',
            })
        }
        expect(tracker.pullRequests()).toHaveLength(1)
    }, 120_000)

    test('Scenario 2: multi-turn createAgyLauncher + real agy-hook.ts handles hooks and zero cwd writes', async () => {
        const root = createTempRoot({ prefix: 'luca-agy-w2-' })
        roots.push(root)
        const rawCwd = join(root, 'worktree')
        const rawTemp = join(root, 'temp')
        mkdirSync(rawTemp, { recursive: true })
        await initCleanRepo({ cwd: rawCwd })
        const cwd = realpathSync(rawCwd)
        const temp_root = realpathSync(rawTemp)
        const initialEntries = readdirSync(cwd).toSorted()

        let tempDir = ''
        let turn0Ss: unknown = null
        let turn1Ss: unknown = null
        const { spawner, calls } = createFakeAgySpawner({
            turns: [
                {
                    on_spawn: async ({ argv, env }) => {
                        tempDir = env.LUCA_AGY_STATE_DIR ?? ''
                        turn0Ss = (
                            await hookCall({
                                argv,
                                env,
                                event: 'SessionStart',
                                payload: { hookEventName: 'SessionStart', cwd },
                            })
                        ).json
                        expect(
                            (
                                await hookCall({
                                    argv,
                                    env,
                                    event: 'PreInvocation',
                                    payload: {
                                        hookEventName: 'PreInvocation',
                                        invocationNum: 0,
                                    },
                                })
                            ).json
                        ).toEqual({})
                        expect(
                            await preTool({
                                argv,
                                env,
                                name: 'write_to_file',
                                args: { TargetFile: 'src/app.test.ts' },
                            })
                        ).toMatchObject({ decision: 'deny' })
                        expect(
                            await preTool({
                                argv,
                                env,
                                name: 'run_command',
                                args: {
                                    CommandLine: 'bun test',
                                    BypassSandbox: true,
                                },
                            })
                        ).toEqual({
                            decision: 'deny',
                            reason: 'Every command runs in the sandbox.',
                        })
                        expect(
                            await preTool({
                                argv,
                                env,
                                name: 'write_to_file',
                                args: { TargetFile: 'src/app.ts' },
                            })
                        ).toEqual({ decision: 'allow' })
                    },
                    lines: agyLines({
                        id: 'conv-w2',
                        model: 'gemini-4-argon-high',
                        structured_output: IMPLEMENTER_RESULT,
                    }),
                },
                {
                    on_spawn: async ({ argv, env }) => {
                        expect(
                            readFileSync(join(tempDir, 'denials.jsonl'), 'utf8')
                        ).toBe('')
                        expect(
                            existsSync(join(tempDir, 'out-of-turns.flag'))
                        ).toBe(false)
                        turn1Ss = (
                            await hookCall({
                                argv,
                                env,
                                event: 'SessionStart',
                                payload: { hookEventName: 'SessionStart', cwd },
                            })
                        ).json
                        // agy numbers invocations across the conversation;
                        // the follow-up counts from its first one (#777).
                        expect(
                            (
                                await hookCall({
                                    argv,
                                    env,
                                    event: 'PreInvocation',
                                    payload: {
                                        hookEventName: 'PreInvocation',
                                        invocationNum: 2,
                                    },
                                })
                            ).json
                        ).toEqual({})
                        expect(
                            (
                                await hookCall({
                                    argv,
                                    env,
                                    event: 'PreInvocation',
                                    payload: {
                                        hookEventName: 'PreInvocation',
                                        invocationNum: 4,
                                    },
                                })
                            ).json
                        ).toEqual({
                            terminationBehavior: 'terminate',
                            injectSteps: [
                                {
                                    errorMessage: {
                                        userMessage: 'Turn limit reached.',
                                    },
                                },
                            ],
                        })
                    },
                    lines: agyLines({
                        id: 'conv-w2',
                        model: 'gemini-4-argon-high',
                        structured_output: IMPLEMENTER_RESULT,
                    }),
                },
            ],
        })

        const config = makeAgyConfig({ provider: 'agy' })
        const launcher = createAgyLauncher({
            agy_path: '/fake/agy',
            spawn: spawner,
            temp_root,
        })
        const first = await launcher.launch({
            role: 'implementer',
            ticket: 11,
            prompt: 'implement',
            cwd,
            may_edit_tests: false,
            config,
            messaging: null,
            model: 'gemini-4-argon-high',
            effort: 'high',
            max_turns: 2,
        })
        expect(first.ok).toBe(true)
        if (first.ok) expect(first.session?.guard_denials).toHaveLength(2)
        expect(turn0Ss).toMatchObject({
            injectSteps: [
                { systemMessage: { systemMessage: expect.any(String) } },
            ],
        })

        const second = await launcher.followUp({
            session_id: 'conv-w2',
            role: 'implementer',
            ticket: 11,
            message: 'fix remaining',
            cwd,
            config,
        })
        expect(calls[1]?.argv).toContain('--conversation')
        expect(turn1Ss).toEqual({})
        expect(second).toMatchObject({
            ok: false,
            failure: 'agent',
            out_of_turns: true,
        })
        await launcher.closeAll()
        expect(existsSync(tempDir)).toBe(false)
        expect(readdirSync(cwd).toSorted()).toEqual(initialEntries)
        expect((await $`git status --porcelain`.cwd(cwd).text()).trim()).toBe(
            ''
        )
    })
})
