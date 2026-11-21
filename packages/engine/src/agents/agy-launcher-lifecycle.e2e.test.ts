import {
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

import { afterEach, describe, expect, test } from 'bun:test'
import { z } from 'zod'

import {
    createAgyLauncher,
    type AgySpawnedProcess,
    type AgySpawner,
} from './agy-launcher'
import { MAX_TURNS } from './role-turns'

import type { EngineConfig } from '../config/engine-config'
import {
    cleanupDir,
    createFakeAgySpawner,
    createTempRoot,
    makeAgyConfig,
    ndjsonStream,
    type FakeAgySpawnArgs,
} from '../testing/agy-e2e-helpers'

/**
 * E2E contract tests for Spec #777 Feature F12 (`agy-launcher.ts`) — Tier 2
 * boundary, error, env-sanitization, timeout escalation, and fatal temp-dir
 * cleanup behavior. (Tier 1 tests live in `agy-launcher.e2e.test.ts`.)
 */

const roots: string[] = []
const AGY_BIN = '/opt/fake/bin/agy'

afterEach(() => {
    while (roots.length > 0) {
        const dir = roots.pop()
        if (dir !== undefined) cleanupDir({ dir })
    }
})

const makeWorkspace = (): {
    cwd: string
    temp_root: string
    config: EngineConfig
} => {
    const root = createTempRoot({ prefix: 'luca-agy-life-' })
    roots.push(root)
    const cwd = join(root, 'worktree')
    const temp_root = join(root, 'tmp')
    mkdirSync(join(cwd, 'src'), { recursive: true })
    mkdirSync(temp_root, { recursive: true })
    writeFileSync(join(cwd, 'src', 'app.ts'), 'export const app = 1\n')
    return { cwd, temp_root, config: makeAgyConfig({ provider: 'agy' }) }
}

const initLine = ({
    id = 'conv-1',
    model = 'gemini-4-neon-high',
}: { id?: string; model?: string } = {}) => ({
    event: 'init',
    conversation_id: id,
    init: { model, cwd: '/repo', tools: ['view_file', 'finish'] },
})

const resultLine = ({
    id,
    status = 'SUCCESS',
    error,
    output = {
        outcome: 'done',
        bad_test: null,
        summary: 'Done.',
        assumptions: [],
        run_notes: [],
    },
}: {
    id?: string
    status?: 'SUCCESS' | 'ERROR'
    error?: string
    output?: unknown
} = {}) => ({
    event: 'result',
    result: {
        ...(id === undefined ? {} : { conversation_id: id }),
        status,
        ...(error === undefined ? {} : { error }),
        duration_seconds: 0.5,
        num_turns: 1,
        structured_output: output,
        usage: {
            input_tokens: 10,
            output_tokens: 5,
            thinking_tokens: 0,
            cache_read_tokens: 0,
            total_tokens: 15,
        },
    },
})

const launchArgs = ({
    cwd,
    config,
    ticket = 11,
    model = 'gemini-4-neon-high',
    max_turns,
}: {
    cwd: string
    config: EngineConfig
    ticket?: number
    model?: string
    max_turns?: number
}) => ({
    role: 'implementer' as const,
    ticket,
    prompt: 'Work.',
    cwd,
    may_edit_tests: false,
    config,
    messaging: null,
    model,
    effort: 'medium' as const,
    ...(max_turns === undefined ? {} : { max_turns }),
})

const flagValue = ({
    argv,
    flag,
}: {
    argv: string[]
    flag: string
}): string | undefined => {
    const index = argv.indexOf(flag)
    return index === -1 ? undefined : argv[index + 1]
}

describe('F12: agy-launcher.ts — Tier 2 boundaries & negative paths', () => {
    test('refuses non-agy models pre-spawn with 0 spawns and 0 temp dirs created', async () => {
        const { cwd, temp_root, config } = makeWorkspace()
        const { spawner, calls } = createFakeAgySpawner({ turns: [] })
        const launcher = createAgyLauncher({
            agy_path: AGY_BIN,
            spawn: spawner,
            temp_root,
        })

        for (const model of [
            'opus',
            'sonnet',
            'gemini-3.8-flash-low',
            'GEMINI-4-NEON-HIGH',
            'gpt-5',
        ]) {
            const turn = await launcher.launch(
                launchArgs({ cwd, config, model })
            )
            expect(turn).toEqual({
                ok: false,
                failure: 'stop',
                error: `Agents on agy launch only on gemini-4-neon-high, gemini-4-argon-high, gemini-3.8-flash-high: ${model}`,
            })
        }

        expect(calls).toHaveLength(0)
        expect(readdirSync(temp_root)).toEqual([])
    })

    test('missing agy binary returns failure stop with 0 spawns and 0 temp dirs', async () => {
        const { cwd, temp_root } = makeWorkspace()
        const emptyBin = join(temp_root, 'empty-bin')
        mkdirSync(emptyBin, { recursive: true })
        const script = [
            "import { readdirSync } from 'node:fs'",
            "import { createAgyLauncher } from './agy-launcher'",
            "import { makeAgyConfig } from '../testing/agy-e2e-helpers'",
            'let spawns = 0',
            'const launcher = createAgyLauncher({',
            '  temp_root: process.env.TEST_TEMP_ROOT,',
            "  spawn: () => { spawns += 1; throw new Error('unexpected spawn') },",
            '})',
            'const turn = await launcher.launch({',
            "  role: 'implementer', ticket: 11, prompt: 'Do work.',",
            '  cwd: process.env.TEST_CWD ?? "", may_edit_tests: false,',
            "  config: makeAgyConfig({ provider: 'agy' }), messaging: null,",
            "  model: 'gemini-4-neon-high', effort: 'medium',",
            '})',
            'console.log(JSON.stringify({ turn, spawns, entries: readdirSync(process.env.TEST_TEMP_ROOT ?? "") }))',
        ].join('\n')
        const proc = Bun.spawnSync([process.execPath, '-e', script], {
            cwd: import.meta.dir,
            env: {
                PATH: emptyBin,
                HOME: join(cwd, '..', 'home'),
                TEST_CWD: cwd,
                TEST_TEMP_ROOT: temp_root,
            },
        })
        expect(proc.exitCode).toBe(0)
        const out = z
            .object({
                turn: z.record(z.string(), z.unknown()),
                spawns: z.number(),
                entries: z.array(z.string()),
            })
            .parse(JSON.parse(proc.stdout.toString()))
        expect(out.turn).toEqual({
            ok: false,
            failure: 'stop',
            error: 'No `agy` binary on PATH.',
        })
        expect(out.spawns).toBe(0)
        expect(out.entries).toEqual(['empty-bin'])
    })

    test('child env keeps only allowlist + LUCA_AGY_STATE_DIR and strips banned/secret keys', async () => {
        const { cwd, temp_root, config } = makeWorkspace()
        const { spawner, calls } = createFakeAgySpawner({
            turns: [
                {
                    lines: [
                        initLine({ id: 'conv-env' }),
                        resultLine({ id: 'conv-env' }),
                    ],
                },
            ],
        })

        const launcher = createAgyLauncher({
            agy_path: AGY_BIN,
            spawn: spawner,
            temp_root,
            env: {
                PATH: '/usr/bin:/bin',
                HOME: '/tmp/fake-home',
                USER: 'luca',
                LOGNAME: 'luca',
                SHELL: '/bin/zsh',
                TMPDIR: temp_root,
                LANG: 'en_US.UTF-8',
                LC_ALL: 'en_US.UTF-8',
                LC_CTYPE: 'UTF-8',
                TERM: 'xterm-256color',
                GEMINI_API_KEY: 'secret-gemini-key',
                GOOGLE_API_KEY: 'secret-google-key',
                ANTHROPIC_API_KEY: 'secret-anthropic-key',
                ANTHROPIC_AUTH_TOKEN: 'secret-token',
                ANTHROPIC_BASE_URL: 'https://evil.example.com',
                AWS_SECRET_ACCESS_KEY: 'secret-aws',
                CLOUDFLARE_API_TOKEN: 'secret-cf',
            },
        })

        const turn = await launcher.launch(launchArgs({ cwd, config }))
        await launcher.closeAll()

        expect(turn.ok).toBe(true)
        const childEnv = calls[0]?.env ?? {}
        expect(childEnv.LUCA_AGY_STATE_DIR?.startsWith(temp_root)).toBe(true)
        expect(childEnv).toMatchObject({
            PATH: '/usr/bin:/bin',
            HOME: '/tmp/fake-home',
            USER: 'luca',
            LOGNAME: 'luca',
            SHELL: '/bin/zsh',
            TMPDIR: temp_root,
            LANG: 'en_US.UTF-8',
            LC_ALL: 'en_US.UTF-8',
            LC_CTYPE: 'UTF-8',
            TERM: 'xterm-256color',
        })
        for (const forbidden of [
            'GEMINI_API_KEY',
            'GOOGLE_API_KEY',
            'ANTHROPIC_API_KEY',
            'ANTHROPIC_AUTH_TOKEN',
            'ANTHROPIC_BASE_URL',
            'AWS_SECRET_ACCESS_KEY',
            'CLOUDFLARE_API_TOKEN',
        ]) {
            expect(childEnv[forbidden]).toBeUndefined()
        }
    })

    test('followUp returns session_gone on unknown/closed sessions and preserves session on role/ticket mismatch', async () => {
        const { cwd, temp_root, config } = makeWorkspace()
        const { spawner, calls } = createFakeAgySpawner({
            turns: [
                {
                    lines: [
                        initLine({ id: 'conv-open' }),
                        resultLine({ id: 'conv-open' }),
                    ],
                },
                {
                    lines: [
                        initLine({ id: 'conv-open' }),
                        resultLine({
                            id: 'conv-open',
                            output: { recovered: true },
                        }),
                    ],
                },
            ],
        })
        const launcher = createAgyLauncher({
            agy_path: AGY_BIN,
            spawn: spawner,
            temp_root,
        })

        expect(
            await launcher.followUp({
                session_id: 'never-started',
                role: 'implementer',
                ticket: 11,
                message: 'Retry',
                cwd,
                config,
            })
        ).toEqual({
            ok: false,
            failure: 'engine',
            session_id: 'never-started',
            session_gone: true,
            error: 'No open agent session never-started: it closed or never started.',
        })

        await launcher.launch(launchArgs({ cwd, config }))

        expect(
            await launcher.followUp({
                session_id: 'conv-open',
                role: 'test-writer',
                ticket: 11,
                message: 'Wrong role',
                cwd,
                config,
            })
        ).toEqual({
            ok: false,
            failure: 'engine',
            session_id: 'conv-open',
            error: 'Session conv-open belongs to the implementer on #11, not the test-writer on #11.',
        })

        expect(
            await launcher.followUp({
                session_id: 'conv-open',
                role: 'implementer',
                ticket: 99,
                message: 'Wrong ticket',
                cwd,
                config,
            })
        ).toEqual({
            ok: false,
            failure: 'engine',
            session_id: 'conv-open',
            error: 'Session conv-open belongs to the implementer on #11, not the implementer on #99.',
        })

        const valid = await launcher.followUp({
            session_id: 'conv-open',
            role: 'implementer',
            ticket: 11,
            message: 'Valid follow-up',
            cwd,
            config,
        })
        expect(valid).toMatchObject({
            ok: true,
            session_id: 'conv-open',
            structured_output: { recovered: true },
        })

        await launcher.closeSession({ session_id: 'conv-open' })
        expect(
            await launcher.followUp({
                session_id: 'conv-open',
                role: 'implementer',
                ticket: 11,
                message: 'After close',
                cwd,
                config,
            })
        ).toEqual({
            ok: false,
            failure: 'engine',
            session_id: 'conv-open',
            session_gone: true,
            error: 'No open agent session conv-open: it closed or never started.',
        })
        expect(calls).toHaveLength(2)
    })

    test('wall-clock turn_timeout_ms sends SIGTERM, escalates to SIGKILL after 2s, closes session, and removes temp_dir', async () => {
        const { cwd, temp_root, config } = makeWorkspace()
        const signals: (number | NodeJS.Signals)[] = []
        let resolveExited: (code: number) => void = () => {}

        const ignoringSigtermSpawner: AgySpawner = () => {
            const exited = new Promise<number>((resolve) => {
                resolveExited = resolve
            })
            const proc: AgySpawnedProcess = {
                stdout: ndjsonStream({
                    lines: [initLine({ id: 'conv-hang' })],
                }),
                stderr: ndjsonStream({ lines: [] }),
                exited,
                kill: (signal = 'SIGTERM') => {
                    signals.push(signal)
                    if (signal === 'SIGKILL') resolveExited(137)
                },
            }
            return proc
        }

        const launcher = createAgyLauncher({
            agy_path: AGY_BIN,
            spawn: ignoringSigtermSpawner,
            temp_root,
            turn_timeout_ms: 500,
        })
        const turn = await launcher.launch(launchArgs({ cwd, config }))

        expect(signals).toEqual(['SIGTERM', 'SIGKILL'])
        expect(turn).toMatchObject({
            ok: false,
            failure: 'agent',
            session_closed: true,
            error: 'The implementer timed out after 1s.',
        })
        expect(readdirSync(temp_root)).toEqual([])
        expect(
            await launcher.followUp({
                session_id: 'conv-hang',
                role: 'implementer',
                ticket: 11,
                message: 'After timeout',
                cwd,
                config,
            })
        ).toMatchObject({ ok: false, failure: 'engine', session_gone: true })
    }, 10_000)

    test('fatal errors (non-Gemini init, RESOURCE_EXHAUSTED, missing conversation_id, conversation not found) remove temp_dir cleanly', async () => {
        const { cwd, temp_root, config } = makeWorkspace()

        // 1. init with non-Gemini model -> stop
        const nonGemini = createFakeAgySpawner({
            turns: [
                {
                    hang: true,
                    lines: [initLine({ id: 'c1', model: 'claude-opus-5' })],
                },
            ],
        })
        const t1 = await createAgyLauncher({
            agy_path: AGY_BIN,
            spawn: nonGemini.spawner,
            temp_root,
        }).launch(launchArgs({ cwd, config }))
        expect(t1).toMatchObject({ ok: false, failure: 'stop' })
        expect(nonGemini.calls[0]?.killed_with).toContain('SIGTERM')
        expect(readdirSync(temp_root)).toEqual([])

        // 2. RESOURCE_EXHAUSTED -> plan with agy_quota
        const quota = createFakeAgySpawner({
            turns: [
                {
                    exit_code: 1,
                    lines: [
                        initLine({ id: 'c2' }),
                        resultLine({
                            id: 'c2',
                            status: 'ERROR',
                            error: 'RESOURCE_EXHAUSTED: Resets in 1h30m',
                        }),
                    ],
                },
            ],
        })
        const t2 = await createAgyLauncher({
            agy_path: AGY_BIN,
            spawn: quota.spawner,
            temp_root,
            now: () => 1_700_000_000_000,
        }).launch(launchArgs({ cwd, config }))
        expect(t2).toMatchObject({ ok: false, failure: 'plan' })
        expect(t2.session?.rate_limit_events).toMatchObject([
            {
                status: 'rejected',
                rateLimitType: 'agy_quota',
                resetsAt: 1_700_005_400,
            },
        ])
        expect(readdirSync(temp_root)).toEqual([])

        // 3. SUCCESS missing conversation_id -> engine
        const noConv = createFakeAgySpawner({
            turns: [
                {
                    lines: [
                        {
                            event: 'init',
                            init: {
                                model: 'gemini-4-neon-high',
                                cwd,
                                tools: [],
                            },
                        },
                        resultLine(),
                    ],
                },
            ],
        })
        const t3 = await createAgyLauncher({
            agy_path: AGY_BIN,
            spawn: noConv.spawner,
            temp_root,
        }).launch(launchArgs({ cwd, config }))
        expect(t3).toMatchObject({
            ok: false,
            failure: 'engine',
            error: 'agy finished without a conversation_id.',
        })
        expect(readdirSync(temp_root)).toEqual([])

        // 4. followUp conversation not found -> session_gone + temp_dir removed
        const gone = createFakeAgySpawner({
            turns: [
                { lines: [initLine({ id: 'c4' }), resultLine({ id: 'c4' })] },
                {
                    exit_code: 1,
                    lines: [
                        resultLine({
                            id: 'c4',
                            status: 'ERROR',
                            error: 'conversation not found: c4',
                        }),
                    ],
                },
            ],
        })
        const l4 = createAgyLauncher({
            agy_path: AGY_BIN,
            spawn: gone.spawner,
            temp_root,
        })
        await l4.launch(launchArgs({ cwd, config }))
        const t4 = await l4.followUp({
            session_id: 'c4',
            role: 'implementer',
            ticket: 11,
            message: 'hi',
            cwd,
            config,
        })
        expect(t4).toMatchObject({
            ok: false,
            failure: 'engine',
            session_gone: true,
        })
        expect(readdirSync(temp_root)).toEqual([])
        expect(existsSync(gone.calls[0]?.env.LUCA_AGY_STATE_DIR ?? '')).toBe(
            false
        )
    })

    test('rounds print-timeout up via Math.ceil(turn_timeout_ms / 1000) and honors max_turns override in state.json', async () => {
        const { cwd, temp_root, config } = makeWorkspace()
        const seenMaxTurns: number[] = []
        const captureMaxTurns = ({ env }: FakeAgySpawnArgs) => {
            const raw = readFileSync(
                join(env.LUCA_AGY_STATE_DIR ?? '', 'state.json'),
                'utf8'
            )
            seenMaxTurns.push(
                z.object({ max_turns: z.number() }).parse(JSON.parse(raw))
                    .max_turns
            )
        }

        const { spawner, calls } = createFakeAgySpawner({
            turns: [
                {
                    lines: [initLine({ id: 'c1' }), resultLine({ id: 'c1' })],
                    on_spawn: captureMaxTurns,
                },
                {
                    lines: [initLine({ id: 'c2' }), resultLine({ id: 'c2' })],
                    on_spawn: captureMaxTurns,
                },
            ],
        })
        const launcher = createAgyLauncher({
            agy_path: AGY_BIN,
            spawn: spawner,
            temp_root,
            turn_timeout_ms: 1500,
        })

        await launcher.launch(launchArgs({ cwd, config, max_turns: 12 }))
        await launcher.launch(launchArgs({ cwd, config, ticket: 12 }))
        await launcher.closeAll()

        expect(
            flagValue({ argv: calls[0]?.argv ?? [], flag: '--print-timeout' })
        ).toBe('2s')
        expect(seenMaxTurns).toEqual([12, MAX_TURNS.implementer])
    })
})
