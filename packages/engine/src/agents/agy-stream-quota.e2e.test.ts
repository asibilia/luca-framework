import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { createAgyLauncher } from './agy-launcher'
import { agyTargetOf, checkAgyModel, parseAgyQuotaReset } from './agy-stream'
import type { TurnProgress } from './turn-progress'

import { limitWaitComment, windowName } from '../limits/limit-wait'
import { sessionSignal } from '../limits/plan-signals'
import {
    cleanupDir,
    createFakeAgySpawner,
    createTempRoot,
    makeAgyConfig,
    type FakeAgyTurnSpec,
} from '../testing/agy-e2e-helpers'

/**
 * Tier 1 E2E contract tests for Spec #777 Feature #7 (Ticket #779):
 * `agy-stream.ts` + `agy_quota` in `limit-wait.ts` and `plan-signals.ts`.
 */

type Fixture = { root: string; worktree: string; temp_root: string }

let fixture: Fixture | null = null

const getFixture = (): Fixture => {
    if (fixture === null) throw new Error('missing fixture')
    return fixture
}

const snapshotProgress = ({
    progress,
}: {
    progress: TurnProgress
}): TurnProgress => ({
    tokens: progress.tokens,
    action: progress.action === null ? null : { ...progress.action },
    open_call: progress.open_call === null ? null : { ...progress.open_call },
    rate_limit_events: progress.rate_limit_events.map((e) => ({ ...e })),
})

const initLine = ({
    id,
    model = 'gemini-4-neon-high',
    cwd,
}: {
    id: string
    model?: string
    cwd: string
}) => ({ event: 'init', conversation_id: id, init: { model, cwd } })

const stepLine = ({
    id,
    index,
    state,
    type,
    tool,
    params,
    usage,
}: {
    id: string
    index: number
    state: 'ACTIVE' | 'DONE' | 'ERROR'
    type: 'tool' | 'finish' | 'agent_response'
    tool?: string
    params?: Record<string, unknown>
    usage?: Record<string, number>
}) => ({
    event: 'step_update',
    step_update: {
        conversation_id: id,
        step_index: index,
        state,
        step_type: type,
        ...(tool === undefined ? {} : { tool_name: tool }),
        ...(params === undefined
            ? {}
            : { tool_info: { name: tool ?? type, parameters: params } }),
        ...(usage === undefined ? {} : { usage }),
    },
})

const runSingleTurn = async ({
    fx,
    turn,
    model = 'gemini-4-neon-high',
    now,
    on_progress,
}: {
    fx: Fixture
    turn: FakeAgyTurnSpec
    model?: string
    now?: () => number
    on_progress?: (progress: TurnProgress) => void
}) => {
    const fake = createFakeAgySpawner({ turns: [turn] })
    const launcher = createAgyLauncher({
        agy_path: '/fake/agy',
        spawn: fake.spawner,
        temp_root: fx.temp_root,
        now,
    })
    try {
        return await launcher.launch({
            role: 'implementer',
            ticket: 779,
            prompt: 'Run turn',
            cwd: fx.worktree,
            may_edit_tests: false,
            config: makeAgyConfig({ provider: 'agy' }),
            messaging: null,
            model,
            effort: 'medium',
            on_progress,
        })
    } finally {
        await launcher.closeAll()
    }
}

beforeEach(() => {
    const root = createTempRoot({ prefix: 'luca-agy-stream-t1-' })
    const worktree = join(root, 'worktree')
    const temp_root = join(root, 'tmp')
    mkdirSync(join(worktree, 'src'), { recursive: true })
    mkdirSync(temp_root, { recursive: true })
    fixture = { root, worktree, temp_root }
})

afterEach(() => {
    if (fixture !== null) {
        cleanupDir({ dir: fixture.root })
        fixture = null
    }
})

describe('Tier 1 — agy-stream, limit-wait, and plan-signals contracts', () => {
    test('checkAgyModel accepts Gemini model names case-insensitively', () => {
        for (const model of [
            'gemini-4-neon-high',
            'gemini-4-argon-high',
            'gemini-3.8-flash-high',
            'Gemini-3.8-flash-low',
            'GEMINI-4-ARGON-HIGH',
            'gemini-2.5-pro',
        ]) {
            expect(checkAgyModel({ model })).toBe(true)
        }
    })

    test('parseAgyQuotaReset parses full and partial Reset durations into epoch seconds', () => {
        const now_ms = 1_700_000_000_450
        const base = 1_700_000_000

        expect(parseAgyQuotaReset({ text: 'Resets in 1h20m30s', now_ms })).toBe(
            base + 4830
        )
        expect(parseAgyQuotaReset({ text: 'Resets in 45m', now_ms })).toBe(
            base + 2700
        )
        expect(parseAgyQuotaReset({ text: 'Resets in 15s', now_ms })).toBe(
            base + 15
        )
        expect(parseAgyQuotaReset({ text: 'Resets in 2h5s', now_ms })).toBe(
            base + 7205
        )
        expect(
            parseAgyQuotaReset({
                text: 'RESOURCE_EXHAUSTED: Quota hit. Resets in 10m5s.',
                now_ms,
            })
        ).toBe(base + 605)
    })

    test('agyTargetOf extracts worktree-relative paths, 3-word commands, search queries/patterns, and empty finish target', () => {
        const wt = getFixture().worktree

        expect(
            agyTargetOf({
                tool_name: 'view_file',
                parameters: { AbsolutePath: join(wt, 'src', 'index.ts') },
                worktree: wt,
            })
        ).toBe('src/index.ts')
        expect(
            agyTargetOf({
                tool_name: 'write_to_file',
                parameters: { TargetFile: 'src/new-file.ts' },
                worktree: wt,
            })
        ).toBe('src/new-file.ts')
        expect(
            agyTargetOf({
                tool_name: 'run_command',
                parameters: {
                    CommandLine: 'bun test packages/engine --bail\necho done',
                },
                worktree: wt,
            })
        ).toBe('bun test packages/engine')
        expect(
            agyTargetOf({
                tool_name: 'grep_search',
                parameters: { Query: 'parseAgyQuotaReset' },
                worktree: wt,
            })
        ).toBe('parseAgyQuotaReset')
        expect(
            agyTargetOf({
                tool_name: 'find_by_name',
                parameters: { Pattern: '*.e2e.test.ts' },
                worktree: wt,
            })
        ).toBe('*.e2e.test.ts')
        expect(
            agyTargetOf({
                tool_name: 'list_dir',
                parameters: { DirectoryPath: join(wt, 'src') },
                worktree: wt,
            })
        ).toBe('src')
        expect(
            agyTargetOf({
                tool_name: 'finish',
                parameters: { outcome: 'done' },
                worktree: wt,
            })
        ).toBe('')
    })

    test('NDJSON stream emits TurnProgress with open_call lifecycle, targets, and usage heartbeats', async () => {
        const fx = getFixture()
        const wt = fx.worktree
        const id = 'conv-progress-1'
        const updates: TurnProgress[] = []

        const turn = await runSingleTurn({
            fx,
            on_progress: (progress) => {
                updates.push(snapshotProgress({ progress }))
            },
            turn: {
                lines: [
                    initLine({ id, cwd: wt }),
                    stepLine({
                        id,
                        index: 1,
                        state: 'ACTIVE',
                        type: 'tool',
                        tool: 'view_file',
                        params: { AbsolutePath: join(wt, 'src', 'app.ts') },
                    }),
                    stepLine({
                        id,
                        index: 1,
                        state: 'DONE',
                        type: 'tool',
                        tool: 'view_file',
                        usage: {
                            input_tokens: 100,
                            output_tokens: 20,
                            thinking_tokens: 10,
                            cache_read_tokens: 30,
                            total_tokens: 160,
                        },
                    }),
                    stepLine({
                        id,
                        index: 2,
                        state: 'ACTIVE',
                        type: 'tool',
                        tool: 'run_command',
                        params: { CommandLine: 'bun test src --bail' },
                    }),
                    stepLine({
                        id,
                        index: 2,
                        state: 'DONE',
                        type: 'tool',
                        tool: 'run_command',
                    }),
                    stepLine({
                        id,
                        index: 3,
                        state: 'ACTIVE',
                        type: 'finish',
                        tool: 'finish',
                        params: {},
                    }),
                    stepLine({
                        id,
                        index: 3,
                        state: 'DONE',
                        type: 'finish',
                        tool: 'finish',
                    }),
                    stepLine({
                        id,
                        index: 4,
                        state: 'DONE',
                        type: 'agent_response',
                        usage: {
                            input_tokens: 120,
                            output_tokens: 45,
                            thinking_tokens: 15,
                            cache_read_tokens: 30,
                            total_tokens: 210,
                        },
                    }),
                    {
                        event: 'result',
                        result: {
                            conversation_id: id,
                            status: 'SUCCESS',
                            duration_seconds: 1.2,
                            num_turns: 1,
                            structured_output: { outcome: 'done' },
                            usage: {
                                input_tokens: 120,
                                output_tokens: 45,
                                thinking_tokens: 15,
                                cache_read_tokens: 30,
                                total_tokens: 210,
                            },
                        },
                    },
                ],
            },
        })

        expect(turn.ok).toBe(true)
        expect(updates.length).toBeGreaterThanOrEqual(7)

        const viewOpen = updates.find((u) => u.open_call?.tool === 'view_file')
        expect(viewOpen?.open_call?.target).toBe('src/app.ts')
        expect(viewOpen?.action).toMatchObject({
            tool: 'view_file',
            target: 'src/app.ts',
        })

        const runOpen = updates.find((u) => u.open_call?.tool === 'run_command')
        expect(runOpen?.open_call?.target).toBe('bun test src')

        const finishOpen = updates.find((u) => u.open_call?.tool === 'finish')
        expect(finishOpen?.open_call?.target).toBe('')

        const last = updates.at(-1)
        expect(last?.open_call).toBeNull()
        expect(last?.tokens).toBeGreaterThan(0)
    })

    test('AgentSession summarizes thinking_tokens into output_tokens, model_usage, structured_output JSON, and guard_denials', async () => {
        const fx = getFixture()
        const id = 'conv-summary-1'
        const model = 'gemini-4-argon-high'

        const turn = await runSingleTurn({
            fx,
            model,
            turn: {
                on_spawn: ({ env }) => {
                    const dir = env.LUCA_AGY_STATE_DIR
                    if (dir === undefined) throw new Error('missing state dir')
                    const lines = [
                        { tool_name: 'run_command', reason: 'push blocked' },
                        { tool_name: 'write_to_file', reason: 'no test edits' },
                    ].map((d) => JSON.stringify(d))
                    writeFileSync(
                        join(dir, 'denials.jsonl'),
                        `${lines.join('\n')}\n`
                    )
                },
                lines: [
                    initLine({ id, model, cwd: fx.worktree }),
                    {
                        event: 'result',
                        result: {
                            conversation_id: id,
                            status: 'SUCCESS',
                            duration_seconds: 4.25,
                            num_turns: 3,
                            structured_output:
                                '{"outcome":"approved","summary":"Verified"}',
                            usage: {
                                input_tokens: 500,
                                output_tokens: 120,
                                thinking_tokens: 80,
                                cache_read_tokens: 250,
                                total_tokens: 950,
                            },
                        },
                    },
                ],
            },
        })

        expect(turn.ok).toBe(true)
        if (turn.ok) {
            expect(turn.session_id).toBe(id)
            expect(turn.structured_output).toEqual({
                outcome: 'approved',
                summary: 'Verified',
            })
        }
        const expectedUsage = {
            input_tokens: 500,
            output_tokens: 200,
            cache_read_input_tokens: 250,
            cache_creation_input_tokens: 0,
        }
        expect(turn.session).toEqual({
            session_id: id,
            model,
            claude_code_version: null,
            api_key_source: 'none',
            subscription_type: 'agy',
            num_turns: 3,
            duration_ms: 4250,
            usage: expectedUsage,
            model_usage: { [model]: expectedUsage },
            total_cost_usd: 0,
            permission_denials: [],
            guard_denials: [
                { tool_name: 'run_command', reason: 'push blocked' },
                { tool_name: 'write_to_file', reason: 'no test edits' },
            ],
            rate_limit_events: [],
            billing_error: false,
            helpers_started: 0,
        })
    })

    test('quota failures via ERROR result or stderr yield plan failure, agy_quota rate_limit_events, and limit sessionSignal', async () => {
        const fx = getFixture()
        const nowMs = 1_700_000_000_000
        const baseSec = 1_700_000_000

        const cases: { turn: FakeAgyTurnSpec; offset: number }[] = [
            {
                offset: 3900,
                turn: {
                    lines: [
                        initLine({ id: 'q1', cwd: fx.worktree }),
                        {
                            event: 'result',
                            result: {
                                conversation_id: 'q1',
                                status: 'ERROR',
                                error: 'RESOURCE_EXHAUSTED: Resets in 1h5m',
                            },
                        },
                    ],
                },
            },
            {
                offset: 1800,
                turn: {
                    lines: [
                        initLine({ id: 'q2', cwd: fx.worktree }),
                        {
                            event: 'result',
                            result: {
                                conversation_id: 'q2',
                                status: 'ERROR',
                                error: 'HTTP 429 limit. Resets in 30m',
                            },
                        },
                    ],
                },
            },
            {
                offset: 45,
                turn: {
                    lines: [initLine({ id: 'q3', cwd: fx.worktree })],
                    stderr: 'Daily quota exceeded. Resets in 45s',
                    exit_code: 1,
                },
            },
        ]

        for (const item of cases) {
            const turn = await runSingleTurn({
                fx,
                turn: item.turn,
                now: () => nowMs,
            })
            expect(turn.ok).toBe(false)
            if (!turn.ok) {
                expect(turn.failure).toBe('plan')
                expect(turn.session).toBeDefined()
                if (turn.session !== undefined) {
                    expect(turn.session.rate_limit_events).toEqual([
                        {
                            status: 'rejected',
                            rateLimitType: 'agy_quota',
                            resetsAt: baseSec + item.offset,
                            arrived_at: new Date(nowMs).toISOString(),
                        },
                    ])
                    const signal = sessionSignal({ session: turn.session })
                    expect(signal).toEqual({
                        kind: 'limit',
                        rate_limit_type: 'agy_quota',
                        resets_at: baseSec + item.offset,
                    })
                }
            }
        }
    })

    test('windowName and limitWaitComment map agy_quota to "Antigravity quota" while preserving Claude windows', () => {
        expect(windowName({ rate_limit_type: 'agy_quota' })).toBe(
            'Antigravity quota'
        )
        expect(windowName({ rate_limit_type: 'five_hour' })).toBe('five-hour')
        expect(windowName({ rate_limit_type: 'seven_day' })).toBe('weekly')
        expect(windowName({ rate_limit_type: 'seven_day_opus' })).toBe(
            'weekly Opus'
        )
        expect(windowName({ rate_limit_type: 'seven_day_sonnet' })).toBe(
            'weekly Sonnet'
        )
        expect(windowName({ rate_limit_type: null })).toBe('unnamed')
        expect(windowName({ rate_limit_type: 'custom_window' })).toBe(
            'custom_window'
        )

        const comment = limitWaitComment({
            rate_limit_type: 'agy_quota',
            resets_at: '2026-11-20T15:00:00.000Z',
            until: '2026-11-20T15:01:00.000Z',
        })
        expect(comment).toContain("plan's Antigravity quota usage limit")
    })
})
