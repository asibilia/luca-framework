import { mkdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, describe, expect, test } from 'bun:test'
import { z } from 'zod'

import { decidePlan } from './decide-plan'

import { callWords, liveText } from '../../../board/client/live-line'
import { windowWords } from '../../../board/shared/board-state-usage'
import { createAgyLauncher } from '../agents/agy-launcher'
import { parseAgyQuotaReset } from '../agents/agy-stream'
import { checkAgyToolCall } from '../agents/agy-tool-rules'
import type { TurnProgress } from '../agents/turn-progress'
import { guardRoleOf } from '../guards/role-rules'
import { replayRun } from '../journal/replay'
import { limitWaitComment, windowName } from '../limits/limit-wait'
import { sessionSignal } from '../limits/plan-signals'
import {
    cleanupDir,
    createFakeAgySpawner,
    createTempRoot,
    makeAgyConfig,
    readJsonLines,
    type FakeAgyTurnSpec,
} from '../testing/agy-e2e-helpers'
import { recordsFrom } from '../testing/intake-fixtures'

/** Tier 3 pairwise cross-feature E2E tests for Spec #777 (pairs 8–11). */

const HOOK_SCRIPT = join(import.meta.dir, '../agents/agy-hook.ts')
const BOARD_DIR = join(import.meta.dir, '../../../board')

const ThemeSchema = z.object({ colors: z.record(z.string(), z.string()) })
const BoardLookSchema = z.object({
    modelColor: z.custom<
        (args: { model: string; theme: z.infer<typeof ThemeSchema> }) => string
    >((v) => typeof v === 'function'),
})

const roots: string[] = []

afterEach(() => {
    while (roots.length > 0) {
        const dir = roots.pop()
        if (dir !== undefined) cleanupDir({ dir })
    }
})

const makeDirs = () => {
    const root = createTempRoot({ prefix: 'luca-agy-t3-rt-' })
    roots.push(root)
    const cwd = join(root, 'worktree')
    const temp_root = join(root, 'tmp')
    const home_real = join(root, 'home')
    mkdirSync(join(cwd, 'src'), { recursive: true })
    mkdirSync(temp_root, { recursive: true })
    mkdirSync(home_real, { recursive: true })
    writeFileSync(join(cwd, 'src/app.ts'), 'export const app = 1\n')
    return {
        root,
        cwd: realpathSync(cwd),
        temp_root: realpathSync(temp_root),
        home_real: realpathSync(home_real),
    }
}

const runHook = async ({
    command,
    env,
    payload,
}: {
    command: string
    env: Record<string, string>
    payload: Record<string, unknown>
}) => {
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

const stepEv = ({
    index,
    state,
    tool_name,
    parameters,
    usage,
    step_type = 'tool',
}: {
    index: number
    state: 'ACTIVE' | 'DONE'
    tool_name?: string
    parameters?: Record<string, unknown>
    usage?: Record<string, number>
    step_type?: 'tool' | 'finish'
}) => ({
    event: 'step_update',
    step_update: {
        step_index: index,
        state,
        step_type,
        ...(tool_name === undefined ? {} : { tool_name }),
        ...(parameters === undefined ? {} : { tool_info: { parameters } }),
        ...(usage === undefined ? {} : { usage }),
    },
})

const launchAgy = async ({
    cwd,
    temp_root,
    turns,
    model = 'gemini-4-neon-high',
    role = 'implementer',
    on_progress,
    now,
}: {
    cwd: string
    temp_root: string
    turns: FakeAgyTurnSpec[]
    model?: string
    role?: 'implementer' | 'test-writer'
    on_progress?: (p: TurnProgress) => void
    now?: () => number
}) => {
    const { spawner } = createFakeAgySpawner({ turns })
    const launcher = createAgyLauncher({
        agy_path: '/fake/agy',
        spawn: spawner,
        temp_root,
        ...(now === undefined ? {} : { now }),
    })
    const turn = await launcher.launch({
        role,
        ticket: 11,
        prompt: 'p',
        cwd,
        may_edit_tests: role === 'test-writer',
        config: makeAgyConfig({ provider: 'agy' }),
        messaging: null,
        model,
        effort: 'medium',
        ...(on_progress === undefined ? {} : { on_progress }),
    })
    return { launcher, turn }
}

const p8Turn = ({ cwd }: { cwd: string }): FakeAgyTurnSpec => {
    const u = {
        input_tokens: 100,
        output_tokens: 20,
        thinking_tokens: 45,
        cache_read_tokens: 10,
    }
    return {
        on_spawn: ({ env }) => {
            const p = join(env.LUCA_AGY_STATE_DIR ?? '', 'denials.jsonl')
            writeFileSync(
                p,
                `${JSON.stringify({ tool_name: 'search_web', reason: 'no' })}\n`
            )
        },
        lines: [
            {
                event: 'init',
                conversation_id: 'conv-p8',
                init: { model: 'gemini-4-argon-high' },
            },
            stepEv({
                index: 1,
                state: 'ACTIVE',
                tool_name: 'view_file',
                parameters: { AbsolutePath: join(cwd, 'src/app.ts') },
            }),
            stepEv({ index: 1, state: 'DONE', usage: u }),
            {
                event: 'result',
                result: {
                    conversation_id: 'conv-p8',
                    status: 'SUCCESS',
                    duration_seconds: 1.5,
                    num_turns: 2,
                    structured_output: '{"outcome":"done"}',
                    usage: u,
                },
            },
        ],
    }
}

const p10Turn = ({ cwd }: { cwd: string }): FakeAgyTurnSpec => ({
    lines: [
        {
            event: 'init',
            conversation_id: 'conv-p10',
            init: { model: 'gemini-4-argon-high' },
        },
        stepEv({
            index: 1,
            state: 'ACTIVE',
            tool_name: 'replace_file_content',
            parameters: { TargetFile: join(cwd, 'src/app.ts') },
        }),
        stepEv({
            index: 2,
            state: 'ACTIVE',
            tool_name: 'run_command',
            parameters: { CommandLine: 'bun test src/app.test.ts' },
        }),
        stepEv({
            index: 3,
            state: 'ACTIVE',
            tool_name: 'finish',
            step_type: 'finish',
        }),
        {
            event: 'result',
            result: {
                conversation_id: 'conv-p10',
                status: 'SUCCESS',
                structured_output: { ok: true },
            },
        },
    ],
})

describe('Tier 3 — pairwise stream, quota, board UI, and tool-rule/hook integration', () => {
    test('Pair 8 (F7+F12): createAgyLauncher streams TurnProgress and collects thinking_tokens and guard_denials', async () => {
        const { cwd, temp_root } = makeDirs()
        const seen: TurnProgress[] = []
        const { launcher, turn } = await launchAgy({
            cwd,
            temp_root,
            turns: [p8Turn({ cwd })],
            model: 'gemini-4-argon-high',
            on_progress: (p) => seen.push(p),
        })
        await launcher.closeAll()
        expect(turn.ok).toBe(true)
        expect(seen.some((p) => p.open_call?.tool === 'view_file')).toBe(true)
        expect(seen.at(-1)?.open_call).toBeNull()
        expect(seen.at(-1)?.action?.target).toBe('src/app.ts')
        if (turn.ok) {
            expect(turn.structured_output).toEqual({ outcome: 'done' })
            expect(turn.session?.subscription_type).toBe('agy')
            expect(turn.session?.usage.output_tokens).toBe(65)
            expect(turn.session?.guard_denials).toEqual([
                { tool_name: 'search_web', reason: 'no' },
            ])
        }
    })

    test('Pair 9 (F7+limit-wait): RESOURCE_EXHAUSTED drives parseAgyQuotaReset, sessionSignal, decidePlan, and limitWaitComment', async () => {
        const { cwd, temp_root } = makeDirs()
        const nowMs = Date.parse('2026-11-20T12:00:00.000Z')
        const config = makeAgyConfig({ provider: 'agy' })
        const { launcher, turn } = await launchAgy({
            cwd,
            temp_root,
            role: 'test-writer',
            now: () => nowMs,
            turns: [
                {
                    lines: [
                        {
                            event: 'init',
                            conversation_id: 'conv-p9',
                            init: { model: 'gemini-4-neon-high' },
                        },
                        {
                            event: 'result',
                            result: {
                                conversation_id: 'conv-p9',
                                status: 'ERROR',
                                error: 'RESOURCE_EXHAUSTED: Resets in 15m',
                            },
                        },
                    ],
                },
            ],
        })
        await launcher.closeAll()
        expect(turn.ok).toBe(false)
        if (!turn.ok && turn.session !== undefined) {
            expect(turn.failure).toBe('plan')
            const epoch = parseAgyQuotaReset({
                text: 'Resets in 15m',
                now_ms: nowMs,
            })
            expect(epoch).toBe(Math.floor(nowMs / 1000) + 900)
            expect(sessionSignal({ session: turn.session })).toEqual({
                kind: 'limit',
                rate_limit_type: 'agy_quota',
                resets_at: epoch,
            })
            const records = recordsFrom({
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
                        kind: 'agent_session',
                        ticket: 11,
                        role: 'test-writer',
                        content: {
                            role: 'test-writer',
                            session: turn.session,
                        },
                    },
                ],
            })
            const plan = decidePlan({
                state: replayRun({ records }),
                spec_number: 10,
            })
            expect(plan?.type).toBe('start_limit_wait')
            if (plan?.type === 'start_limit_wait') {
                expect(
                    windowName({ rate_limit_type: plan.rate_limit_type })
                ).toBe('Antigravity quota')
                expect(limitWaitComment(plan)).toContain(
                    "the plan's Antigravity quota usage limit"
                )
            }
        }
    })

    test('Pair 10 (F7+F8): TurnProgress tool names and agy_quota integrate with modelColor, callWords, and windowWords', async () => {
        const { cwd, temp_root } = makeDirs()
        const rn = await import(
            join(BOARD_DIR, 'client/testing/render-native.ts')
        )
        const bl = await import(join(BOARD_DIR, 'client/board-look.ts'))
        const { THEME } = z.object({ THEME: ThemeSchema }).parse(rn)
        const { modelColor } = BoardLookSchema.parse(bl)
        const snapshots: TurnProgress[] = []
        const { launcher } = await launchAgy({
            cwd,
            temp_root,
            turns: [p10Turn({ cwd })],
            model: 'gemini-4-argon-high',
            on_progress: (p) => snapshots.push(p),
        })
        await launcher.closeAll()
        const actions = snapshots
            .map((s) => s.action)
            .filter((a): a is NonNullable<typeof a> => a !== null)
        expect(
            actions.map((a) => callWords({ tool: a.tool, target: a.target }))
        ).toEqual([
            '✎ editing src/app.ts',
            '▸ bun test src/app.test.ts',
            '✓ finishing',
        ])
        expect(
            liveText({
                live: {
                    ticket: 11,
                    role: 'implementer',
                    model: 'gemini-4-argon-high',
                    tokens: 50,
                    action: actions[1] ?? null,
                    open_call: null,
                    activity: [],
                    helpers: [],
                },
                now: Date.parse('2026-11-20T12:01:00.000Z'),
            })
        ).toBe('implementer ▸ bun test src/app.test.ts')
        expect(modelColor({ model: 'gemini-4-argon-high', theme: THEME })).toBe(
            '#e8833a'
        )
        expect(windowWords({ window: 'agy_quota' })).toBe('Antigravity quota')
    })

    test('Pair 11 (F9+F10): agy-hook.ts enforces checkAgyToolCall symlink, state-dir, and role rules', async () => {
        const { root, cwd, home_real } = makeDirs()
        const state_dir_real = join(root, 'state')
        mkdirSync(state_dir_real, { recursive: true })
        mkdirSync(join(home_real, '.gemini'), { recursive: true })
        writeFileSync(join(home_real, '.gemini/oauth.json'), '{"secret":1}')
        symlinkSync(
            join(home_real, '.gemini/oauth.json'),
            join(cwd, 'src/leaked-link.json')
        )
        const state = {
            role: 'story-writer' as const,
            guard_role: guardRoleOf({ role: 'story-writer' }),
            cwd,
            worktree_real: cwd,
            state_dir_real,
            home_real,
            may_edit_tests: false,
            config: makeAgyConfig({ provider: 'agy' }),
            max_turns: 10,
            turn_index: 0,
            instructions: 'story rules',
        }
        writeFileSync(join(state_dir_real, 'state.json'), JSON.stringify(state))
        const denials: { tool_name: string; reason: string }[] = []
        for (const [name, args] of [
            ['view_file', { AbsolutePath: join(cwd, 'src/app.ts') }],
            ['view_file', { AbsolutePath: join(cwd, 'src/leaked-link.json') }],
            ['view_file', { AbsolutePath: join(state_dir_real, 'state.json') }],
            ['run_command', { CommandLine: 'ls' }],
        ] as const) {
            const direct = checkAgyToolCall({
                state,
                tool_name: name,
                tool_input: args,
            })
            const res = await runHook({
                command: `${process.execPath} ${HOOK_SCRIPT}`,
                env: {
                    PATH: process.env.PATH ?? '/usr/bin:/bin',
                    LUCA_AGY_STATE_DIR: state_dir_real,
                },
                payload: {
                    hookEventName: 'PreToolUse',
                    toolCall: { name, args },
                },
            })
            expect(res.exit_code).toBe(0)
            if (direct.allow) expect(res.json).toEqual({ decision: 'allow' })
            else {
                expect(res.json).toEqual({
                    decision: 'deny',
                    reason: direct.reason,
                })
                denials.push({ tool_name: name, reason: direct.reason })
            }
        }
        expect(
            readJsonLines({ path: join(state_dir_real, 'denials.jsonl') })
        ).toEqual(denials)
    })
})
