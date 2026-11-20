import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { createAgyLauncher } from './agy-launcher'
import { agyTargetOf, checkAgyModel, parseAgyQuotaReset } from './agy-stream'

import { sessionSignal } from '../limits/plan-signals'
import {
    cleanupDir,
    createFakeAgySpawner,
    createTempRoot,
    makeAgyConfig,
    type FakeAgyTurnSpec,
} from '../testing/agy-e2e-helpers'

/**
 * Tier 2 boundary & outcome-precedence E2E tests for Spec #777 Feature #7:
 * non-Gemini model stop, malformed NDJSON, 60-char target cap, invalid JSON
 * structured_output, missing quota reset duration, 6-level outcome precedence,
 * and duration_seconds wall-clock fallback.
 */

type Fixture = { root: string; worktree: string; temp_root: string }

let fixture: Fixture | null = null

const getFixture = (): Fixture => {
    if (fixture === null) throw new Error('missing fixture')
    return fixture
}

const launchArgs = ({ worktree }: { worktree: string }) => ({
    role: 'implementer' as const,
    ticket: 779,
    prompt: 'Boundary test',
    cwd: worktree,
    may_edit_tests: false,
    config: makeAgyConfig({ provider: 'agy' }),
    messaging: null,
    model: 'gemini-4-neon-high',
    effort: 'medium' as const,
})

const initLine = ({
    id,
    model = 'gemini-4-neon-high',
    cwd,
}: {
    id?: string
    model?: string
    cwd: string
}) => ({
    event: 'init',
    ...(id === undefined ? {} : { conversation_id: id }),
    init: { model, cwd },
})

const okResult = ({
    id,
    structured_output = { outcome: 'done' },
    duration_seconds = 1,
}: {
    id?: string
    structured_output?: unknown
    duration_seconds?: number
}) => ({
    event: 'result',
    result: {
        ...(id === undefined ? {} : { conversation_id: id }),
        status: 'SUCCESS',
        structured_output,
        ...(duration_seconds === undefined ? {} : { duration_seconds }),
        num_turns: 1,
    },
})

const writeOutOfTurns = ({ env }: { env: Record<string, string> }) => {
    if (env.LUCA_AGY_STATE_DIR !== undefined) {
        writeFileSync(join(env.LUCA_AGY_STATE_DIR, 'out-of-turns.flag'), '1')
    }
}

const runBatch = async ({
    fx,
    turns,
    turn_timeout_ms,
    now,
    fn,
}: {
    fx: Fixture
    turns: FakeAgyTurnSpec[]
    turn_timeout_ms?: number
    now?: () => number
    fn: (args: {
        launcher: ReturnType<typeof createAgyLauncher>
        calls: ReturnType<typeof createFakeAgySpawner>['calls']
    }) => Promise<void>
}) => {
    const fake = createFakeAgySpawner({ turns })
    const launcher = createAgyLauncher({
        agy_path: '/fake/agy',
        spawn: fake.spawner,
        temp_root: fx.temp_root,
        turn_timeout_ms,
        now,
    })
    try {
        await fn({ launcher, calls: fake.calls })
    } finally {
        await launcher.closeAll()
    }
}

beforeEach(() => {
    const root = createTempRoot({ prefix: 'luca-agy-stream-t2-' })
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

describe('Tier 2 — agy-stream boundaries, malformed inputs, and outcome precedence', () => {
    test('checkAgyModel rejects non-Gemini models and non-Gemini init.model triggers stop even when result follows', async () => {
        for (const bad of [
            'claude-opus-5',
            'opus',
            'gpt-5',
            'my-gemini-4-neon-high',
            ' gemini-4-neon-high',
            '',
        ]) {
            expect(checkAgyModel({ model: bad })).toBe(false)
        }

        const fx = getFixture()
        await runBatch({
            fx,
            turns: [
                {
                    lines: [
                        initLine({
                            id: 'conv-unsafe',
                            model: 'claude-opus-4',
                            cwd: fx.worktree,
                        }),
                        okResult({ id: 'conv-unsafe' }),
                    ],
                },
            ],
            fn: async ({ launcher, calls }) => {
                const turn = await launcher.launch(
                    launchArgs({ worktree: fx.worktree })
                )
                expect(turn).toMatchObject({
                    ok: false,
                    failure: 'stop',
                    error: 'Only Gemini models run agy agents: claude-opus-4',
                })
                expect(calls[0]?.killed_with).toContain('SIGTERM')
            },
        })
    })

    test('NDJSON stream ignores blank, non-JSON, and truncated JSON lines without throwing', async () => {
        const fx = getFixture()
        await runBatch({
            fx,
            turns: [
                {
                    lines: [
                        '',
                        '   ',
                        'WARNING: telemetry disabled',
                        '{"event":"step_update","step_update":{"truncated":',
                        initLine({ id: 'conv-resilient', cwd: fx.worktree }),
                        'not-json-at-all',
                        okResult({
                            id: 'conv-resilient',
                            duration_seconds: 0.5,
                        }),
                    ],
                },
            ],
            fn: async ({ launcher }) => {
                const turn = await launcher.launch(
                    launchArgs({ worktree: fx.worktree })
                )
                expect(turn).toMatchObject({
                    ok: true,
                    session_id: 'conv-resilient',
                    structured_output: { outcome: 'done' },
                })
            },
        })
    })

    test('agyTargetOf caps targets at 60 chars, collapses outside-worktree paths to basename, and handles empty inputs', () => {
        const wt = getFixture().worktree

        const longRelPath = `src/${'a'.repeat(80)}.ts`
        const truncatedPath = agyTargetOf({
            tool_name: 'view_file',
            parameters: { Path: longRelPath },
            worktree: wt,
        })
        expect(truncatedPath).toHaveLength(60)
        expect(truncatedPath).toBe(longRelPath.slice(0, 60))

        const truncatedCmd = agyTargetOf({
            tool_name: 'run_command',
            parameters: { CommandLine: `bun ${'x'.repeat(70)} arg3 arg4` },
            worktree: wt,
        })
        expect(truncatedCmd).toHaveLength(60)

        expect(
            agyTargetOf({
                tool_name: 'view_file',
                parameters: { AbsolutePath: '/etc/ssh/sshd_config' },
                worktree: wt,
            })
        ).toBe('sshd_config')
        expect(
            agyTargetOf({
                tool_name: 'write_to_file',
                parameters: { TargetFile: '../../outside/secret.env' },
                worktree: wt,
            })
        ).toBe('secret.env')
        expect(
            agyTargetOf({
                tool_name: 'view_file',
                parameters: null,
                worktree: wt,
            })
        ).toBe('')
        expect(
            agyTargetOf({
                tool_name: 'grep_search',
                parameters: {},
                worktree: wt,
            })
        ).toBe('')
    })

    test('invalid JSON string in result.structured_output is kept as raw string without throwing', async () => {
        const fx = getFixture()
        await runBatch({
            fx,
            turns: [
                {
                    lines: [
                        initLine({ id: 'conv-bad-json', cwd: fx.worktree }),
                        okResult({
                            id: 'conv-bad-json',
                            structured_output: '{broken-json',
                        }),
                    ],
                },
            ],
            fn: async ({ launcher }) => {
                const turn = await launcher.launch(
                    launchArgs({ worktree: fx.worktree })
                )
                expect(turn).toMatchObject({
                    ok: true,
                    structured_output: '{broken-json',
                })
            },
        })
    })

    test('missing Reset duration makes parseAgyQuotaReset return null and omits resetsAt from rate_limit_events', async () => {
        const now_ms = 1_700_000_000_000
        for (const text of [
            'Quota exceeded, try again later',
            '',
            'Resets in soon',
            'Resets in ',
        ]) {
            expect(parseAgyQuotaReset({ text, now_ms })).toBeNull()
        }

        const fx = getFixture()
        await runBatch({
            fx,
            now: () => now_ms,
            turns: [
                {
                    lines: [
                        initLine({ id: 'conv-no-reset', cwd: fx.worktree }),
                        {
                            event: 'result',
                            result: {
                                conversation_id: 'conv-no-reset',
                                status: 'ERROR',
                                error: 'RESOURCE_EXHAUSTED: try again later',
                            },
                        },
                    ],
                },
            ],
            fn: async ({ launcher }) => {
                const turn = await launcher.launch(
                    launchArgs({ worktree: fx.worktree })
                )
                expect(turn.ok).toBe(false)
                if (!turn.ok) {
                    expect(turn.failure).toBe('plan')
                    const event = turn.session?.rate_limit_events[0]
                    expect(event).toEqual({
                        status: 'rejected',
                        rateLimitType: 'agy_quota',
                        arrived_at: new Date(now_ms).toISOString(),
                    })
                    expect(event !== undefined && 'resetsAt' in event).toBe(
                        false
                    )
                    if (turn.session !== undefined) {
                        const signal = sessionSignal({ session: turn.session })
                        expect(signal).toEqual({
                            kind: 'limit',
                            rate_limit_type: 'agy_quota',
                            resets_at: null,
                        })
                    }
                }
            },
        })
    })

    test('outcome precedence levels 1–3: timeout beats all, unsafe init.model beats out-of-turns, out-of-turns beats SUCCESS', async () => {
        const fx = getFixture()
        await runBatch({
            fx,
            turn_timeout_ms: 500,
            turns: [
                {
                    hang: true,
                    lines: [initLine({ id: 'conv-hang', cwd: fx.worktree })],
                },
                {
                    on_spawn: writeOutOfTurns,
                    lines: [
                        initLine({
                            id: 'conv-unsafe-oot',
                            model: 'gpt-5',
                            cwd: fx.worktree,
                        }),
                        okResult({ id: 'conv-unsafe-oot' }),
                    ],
                },
                {
                    on_spawn: writeOutOfTurns,
                    lines: [
                        initLine({ id: 'conv-oot', cwd: fx.worktree }),
                        okResult({ id: 'conv-oot' }),
                    ],
                },
            ],
            fn: async ({ launcher }) => {
                const args = launchArgs({ worktree: fx.worktree })
                expect(await launcher.launch(args)).toMatchObject({
                    ok: false,
                    failure: 'agent',
                    session_closed: true,
                    error: 'The implementer timed out after 1s.',
                })
                expect(await launcher.launch(args)).toMatchObject({
                    ok: false,
                    failure: 'stop',
                    error: 'Only Gemini models run agy agents: gpt-5',
                })
                expect(await launcher.launch(args)).toMatchObject({
                    ok: false,
                    failure: 'agent',
                    out_of_turns: true,
                    error: 'Reached the turn limit.',
                })
            },
        })
    })

    test('outcome precedence levels 4–6: SUCCESS missing conversation_id, SUCCESS non-zero exit, ERROR, and crash without result', async () => {
        const fx = getFixture()
        await runBatch({
            fx,
            turns: [
                {
                    lines: [initLine({ cwd: fx.worktree }), okResult({})],
                },
                {
                    lines: [
                        initLine({ id: 'conv-exit-2', cwd: fx.worktree }),
                        okResult({ id: 'conv-exit-2' }),
                    ],
                    exit_code: 2,
                },
                {
                    lines: [
                        initLine({ id: 'conv-err', cwd: fx.worktree }),
                        {
                            event: 'result',
                            result: {
                                conversation_id: 'conv-err',
                                status: 'ERROR',
                                error: 'Model failed to converge',
                            },
                        },
                    ],
                },
                {
                    lines: [initLine({ id: 'conv-crash', cwd: fx.worktree })],
                    stderr: 'segmentation fault',
                    exit_code: 139,
                },
            ],
            fn: async ({ launcher }) => {
                const args = launchArgs({ worktree: fx.worktree })
                expect(await launcher.launch(args)).toMatchObject({
                    ok: false,
                    failure: 'engine',
                    error: 'agy finished without a conversation_id.',
                })
                expect(await launcher.launch(args)).toMatchObject({
                    ok: false,
                    failure: 'engine',
                    error: 'agy exited with code 2 after SUCCESS.',
                })
                expect(await launcher.launch(args)).toMatchObject({
                    ok: false,
                    failure: 'agent',
                    error: 'Model failed to converge',
                })
                const crash = await launcher.launch(args)
                expect(crash).toMatchObject({ ok: false, failure: 'engine' })
                if (!crash.ok) {
                    expect(crash.error).toContain(
                        'agy exited with code 139 without a result event'
                    )
                    expect(crash.error).toContain('segmentation fault')
                }
            },
        })
    })

    test('followUp conversation-not-found yields session_gone and missing/negative duration_seconds uses wall-clock fallback', async () => {
        const fx = getFixture()
        let clockMs = 1_700_000_000_000

        await runBatch({
            fx,
            now: () => clockMs,
            turns: [
                {
                    on_spawn: async () => {
                        await Promise.resolve()
                        clockMs += 2500
                    },
                    lines: [
                        initLine({ id: 'conv-fu-1', cwd: fx.worktree }),
                        {
                            event: 'result',
                            result: {
                                conversation_id: 'conv-fu-1',
                                status: 'SUCCESS',
                                structured_output: { outcome: 'done' },
                            },
                        },
                    ],
                },
                {
                    lines: [
                        {
                            event: 'result',
                            result: {
                                conversation_id: 'conv-fu-1',
                                status: 'ERROR',
                                error: 'Error: conversation not found',
                            },
                        },
                    ],
                },
                {
                    on_spawn: async () => {
                        await Promise.resolve()
                        clockMs += 1800
                    },
                    lines: [
                        initLine({ id: 'conv-fu-2', cwd: fx.worktree }),
                        okResult({ id: 'conv-fu-2', duration_seconds: -4 }),
                    ],
                },
                {
                    lines: [],
                    stderr: 'no such conversation conv-fu-2',
                    exit_code: 1,
                },
            ],
            fn: async ({ launcher }) => {
                const first = await launcher.launch(
                    launchArgs({ worktree: fx.worktree })
                )
                expect(first.ok).toBe(true)
                expect(first.session?.duration_ms).toBe(2500)

                const goneErr = await launcher.followUp({
                    session_id: 'conv-fu-1',
                    role: 'implementer',
                    ticket: 779,
                    message: 'Fix lint',
                    cwd: fx.worktree,
                    config: makeAgyConfig({ provider: 'agy' }),
                })
                expect(goneErr).toMatchObject({
                    ok: false,
                    failure: 'engine',
                    session_gone: true,
                    session_id: 'conv-fu-1',
                })

                const second = await launcher.launch(
                    launchArgs({ worktree: fx.worktree })
                )
                expect(second.ok).toBe(true)
                expect(second.session?.duration_ms).toBe(1800)

                const goneStderr = await launcher.followUp({
                    session_id: 'conv-fu-2',
                    role: 'implementer',
                    ticket: 779,
                    message: 'Fix lint',
                    cwd: fx.worktree,
                    config: makeAgyConfig({ provider: 'agy' }),
                })
                expect(goneStderr).toMatchObject({
                    ok: false,
                    failure: 'engine',
                    session_gone: true,
                    session_id: 'conv-fu-2',
                })
            },
        })
    })
})
