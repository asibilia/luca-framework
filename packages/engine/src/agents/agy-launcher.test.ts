import {
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    realpathSync,
    writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'
import { z } from 'zod'

import type { AgentMessaging } from './agent-launcher'
import {
    AGY_NO_MESSAGING_WARNING,
    checkAgyLaunchModel,
    createAgyLauncher,
    resolveAgyCliModel,
} from './agy-launcher'
import { buildAgyHooksJson } from './agy-launcher-files'
import { AgyHookStateSchema } from './agy-tool-rules'
import { DEFAULT_TURN_TIMEOUT_MS } from './claude-launcher'
import { AGY_MODEL_NAMES } from './provider'

import { guardRoleOf } from '../guards/role-rules'
import {
    AGY_CONFIG,
    AGY_PATH,
    agyInit,
    agyResult,
    fakeAgySpawner,
    useAgyTestDirs,
} from '../testing/agy-launcher-fixtures'

const dirs = useAgyTestDirs()

describe('pre-spawn model and binary checks (AC1)', () => {
    test('checkAgyLaunchModel and launch refuse non-agy models before spawning', async () => {
        const fake = fakeAgySpawner()
        const launcher = createAgyLauncher({
            agy_path: AGY_PATH,
            spawn: fake.spawn,
            temp_root: dirs.temp_root,
        })

        for (const model of AGY_MODEL_NAMES) {
            expect(checkAgyLaunchModel({ model })).toBeNull()
        }

        for (const bad of ['opus', 'sonnet', 'gemini-4-neon-low', 'gpt-5']) {
            const expected = `Agents on agy launch only on ${AGY_MODEL_NAMES.join(', ')}: ${bad}`
            expect(checkAgyLaunchModel({ model: bad })).toBe(expected)
            const turn = await launcher.launch({
                role: 'implementer',
                ticket: 11,
                prompt: 'Do work.',
                cwd: dirs.worktree,
                may_edit_tests: false,
                config: AGY_CONFIG,
                messaging: null,
                model: bad,
                effort: 'medium',
            })
            expect(turn).toEqual({
                ok: false,
                failure: 'stop',
                error: expected,
            })
        }
        expect(fake.calls).toHaveLength(0)
        expect(readdirSync(dirs.temp_root)).toEqual([])
    })

    test('missing agy binary stops before spawning or creating temp dirs', async () => {
        const fake = fakeAgySpawner()
        const original_which = Bun.which
        Bun.which = () => null
        try {
            const launcher = createAgyLauncher({
                spawn: fake.spawn,
                temp_root: dirs.temp_root,
            })
            const turn = await launcher.launch({
                role: 'implementer',
                ticket: 11,
                prompt: 'Do work.',
                cwd: dirs.worktree,
                may_edit_tests: false,
                config: AGY_CONFIG,
                messaging: null,
                model: 'gemini-4-neon-high',
                effort: 'medium',
            })
            expect(turn).toEqual({
                ok: false,
                failure: 'stop',
                error: 'No `agy` binary on PATH.',
            })
            expect(fake.calls).toHaveLength(0)
            expect(readdirSync(dirs.temp_root)).toEqual([])
        } finally {
            Bun.which = original_which
        }
    })
})

describe('child environment allowlist and credential stripping (AC2)', () => {
    test('keeps only allowlisted vars, strips API keys, and sets LUCA_AGY_STATE_DIR', async () => {
        const fake = fakeAgySpawner()
        const launcher = createAgyLauncher({
            agy_path: AGY_PATH,
            spawn: fake.spawn,
            temp_root: dirs.temp_root,
            env: {
                PATH: '/usr/bin:/bin',
                HOME: '/tmp/home',
                USER: 'tester',
                LOGNAME: 'tester',
                SHELL: '/bin/zsh',
                TMPDIR: '/tmp',
                LANG: 'en_US.UTF-8',
                LC_ALL: 'en_US.UTF-8',
                LC_CTYPE: 'en_US.UTF-8',
                TERM: 'xterm-256color',
                GEMINI_API_KEY: 'gem-secret',
                GOOGLE_API_KEY: 'goog-secret',
                ANTHROPIC_API_KEY: 'ant-secret',
                ANTHROPIC_AUTH_TOKEN: 'ant-token',
                ANTHROPIC_BASE_URL: 'https://proxy.example.com',
                AWS_SECRET_ACCESS_KEY: 'aws-secret',
            },
        })

        const turn = await launcher.launch({
            role: 'implementer',
            ticket: 11,
            prompt: 'Work.',
            cwd: dirs.worktree,
            may_edit_tests: false,
            config: AGY_CONFIG,
            messaging: null,
            model: 'gemini-4-argon-high',
            effort: 'medium',
        })
        await launcher.closeAll()

        expect(turn.ok).toBe(true)
        const child_env = fake.calls[0]?.env ?? {}
        expect(child_env.PATH).toBe('/usr/bin:/bin')
        expect(child_env.HOME).toBe('/tmp/home')
        expect(child_env.LUCA_AGY_STATE_DIR?.startsWith(dirs.temp_root)).toBe(
            true
        )
        for (const banned of [
            'GEMINI_API_KEY',
            'GOOGLE_API_KEY',
            'ANTHROPIC_API_KEY',
            'ANTHROPIC_AUTH_TOKEN',
            'ANTHROPIC_BASE_URL',
            'AWS_SECRET_ACCESS_KEY',
            'CLAUDE_CODE_DISABLE_AUTO_MEMORY',
        ]) {
            expect(Object.keys(child_env)).not.toContain(banned)
        }
    })

    test('strips credentials from process.env when env option is omitted', async () => {
        const saved = {
            GEMINI_API_KEY: process.env.GEMINI_API_KEY,
            GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
            ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
        }
        process.env.GEMINI_API_KEY = 'gem-leak'
        process.env.GOOGLE_API_KEY = 'goog-leak'
        process.env.ANTHROPIC_API_KEY = 'ant-leak'
        const fake = fakeAgySpawner()
        try {
            const launcher = createAgyLauncher({
                agy_path: AGY_PATH,
                spawn: fake.spawn,
                temp_root: dirs.temp_root,
            })
            await launcher.launch({
                role: 'implementer',
                ticket: 11,
                prompt: 'Work.',
                cwd: dirs.worktree,
                may_edit_tests: false,
                config: AGY_CONFIG,
                messaging: null,
                model: 'gemini-4-neon-high',
                effort: 'medium',
            })
            await launcher.closeAll()
        } finally {
            for (const [key, val] of Object.entries(saved)) {
                if (val === undefined) delete process.env[key]
                else process.env[key] = val
            }
        }
        const keys = Object.keys(fake.calls[0]?.env ?? {})
        expect(keys).not.toContain('GEMINI_API_KEY')
        expect(keys).not.toContain('GOOGLE_API_KEY')
        expect(keys).not.toContain('ANTHROPIC_API_KEY')
        expect(keys).toContain('LUCA_AGY_STATE_DIR')
    })
})

describe('per-session temp dir, hooks, and zero cwd writes (AC3)', () => {
    test('writes schema.json, AgyHookState state.json, and hooks/.agents/hooks.json with --add-dir', async () => {
        let captured_state: unknown
        let captured_schema: unknown
        let captured_hooks: unknown
        const fake = fakeAgySpawner({
            turns: [
                {
                    events: [agyInit({}), agyResult({})],
                    on_spawn: ({ env }) => {
                        const state_dir = env.LUCA_AGY_STATE_DIR
                        if (state_dir === undefined) {
                            throw new Error('missing LUCA_AGY_STATE_DIR')
                        }
                        captured_state = JSON.parse(
                            readFileSync(join(state_dir, 'state.json'), 'utf8')
                        )
                        captured_schema = JSON.parse(
                            readFileSync(join(state_dir, 'schema.json'), 'utf8')
                        )
                        captured_hooks = JSON.parse(
                            readFileSync(
                                join(state_dir, 'hooks/.agents/hooks.json'),
                                'utf8'
                            )
                        )
                    },
                },
            ],
        })
        const launcher = createAgyLauncher({
            agy_path: AGY_PATH,
            spawn: fake.spawn,
            temp_root: dirs.temp_root,
            hook_script_path: '/opt/luca/agy-hook.ts',
        })

        const turn = await launcher.launch({
            role: 'implementer',
            ticket: 12,
            prompt: 'Implement feature.',
            cwd: dirs.worktree,
            may_edit_tests: false,
            config: AGY_CONFIG,
            messaging: {
                address: 'implementer#12',
                send: () => ({ ok: true, detail: 'ok' }),
                deliver: () => null,
            },
            model: 'gemini-4-neon-high',
            effort: 'medium',
            max_turns: 42,
        })
        await launcher.closeAll()

        expect(turn.ok).toBe(true)
        const state = AgyHookStateSchema.parse(captured_state)
        expect(state).toMatchObject({
            role: 'implementer',
            guard_role: guardRoleOf({ role: 'implementer' }),
            worktree_real: realpathSync(dirs.worktree),
            home_real: realpathSync(homedir()),
            may_edit_tests: false,
            config: AGY_CONFIG,
            max_turns: 42,
            turn_index: 0,
        })
        expect(state.state_dir_real.startsWith(dirs.temp_root)).toBe(true)
        expect(state.instructions).not.toContain('send_message')
        expect(state.instructions).not.toContain('searcher')

        expect(captured_schema).toMatchObject({ type: 'object' })
        expect(captured_schema).not.toHaveProperty('$schema')

        const expected_cmd = `'${process.execPath}' '/opt/luca/agy-hook.ts'`
        expect(captured_hooks).toEqual({
            luca: {
                SessionStart: [{ type: 'command', command: expected_cmd }],
                PreToolUse: [
                    {
                        matcher: '*',
                        hooks: [{ type: 'command', command: expected_cmd }],
                    },
                ],
                PreInvocation: [{ type: 'command', command: expected_cmd }],
            },
        })

        const argv = fake.calls[0]?.argv ?? []
        expect(argv).not.toContain('--effort')
        const model_idx = argv.indexOf('--model')
        expect(argv[model_idx + 1]).toBe('gemini-4-neon-medium')
        const add_dir_idx = argv.indexOf('--add-dir')
        expect(add_dir_idx).toBeGreaterThan(-1)
        expect(argv[add_dir_idx + 1]).toBe(join(state.state_dir_real, 'hooks'))
        const timeout_idx = argv.indexOf('--print-timeout')
        expect(argv[timeout_idx + 1]).toBe(
            `${Math.ceil(DEFAULT_TURN_TIMEOUT_MS / 1000)}s`
        )
        expect(readdirSync(dirs.worktree)).toEqual([])
        expect(existsSync(join(dirs.worktree, '.agents'))).toBe(false)
    })

    test('concurrent lenses in the same cwd use isolated temp dirs and leave cwd untouched', async () => {
        const state_dirs: string[] = []
        const fake = fakeAgySpawner({
            turns: [
                {
                    delay_ms: 15,
                    events: [
                        agyInit({ conversation_id: 'conv-arch' }),
                        agyResult({ conversation_id: 'conv-arch' }),
                    ],
                    on_spawn: ({ env }) => {
                        if (env.LUCA_AGY_STATE_DIR !== undefined) {
                            state_dirs.push(env.LUCA_AGY_STATE_DIR)
                        }
                    },
                },
                {
                    delay_ms: 15,
                    events: [
                        agyInit({ conversation_id: 'conv-sec' }),
                        agyResult({ conversation_id: 'conv-sec' }),
                    ],
                    on_spawn: ({ env }) => {
                        if (env.LUCA_AGY_STATE_DIR !== undefined) {
                            state_dirs.push(env.LUCA_AGY_STATE_DIR)
                        }
                    },
                },
            ],
        })
        const launcher = createAgyLauncher({
            agy_path: AGY_PATH,
            spawn: fake.spawn,
            temp_root: dirs.temp_root,
        })

        const [arch, sec] = await Promise.all([
            launcher.launch({
                role: 'architecture-lens',
                ticket: 0,
                prompt: 'Review arch.',
                cwd: dirs.worktree,
                may_edit_tests: false,
                config: AGY_CONFIG,
                messaging: null,
                model: 'gemini-4-neon-high',
                effort: 'xhigh',
            }),
            launcher.launch({
                role: 'security-lens',
                ticket: 0,
                prompt: 'Review security.',
                cwd: dirs.worktree,
                may_edit_tests: false,
                config: AGY_CONFIG,
                messaging: null,
                model: 'gemini-4-neon-high',
                effort: 'xhigh',
            }),
        ])
        await launcher.closeAll()

        expect(arch.ok).toBe(true)
        expect(sec.ok).toBe(true)
        expect(state_dirs).toHaveLength(2)
        expect(new Set(state_dirs).size).toBe(2)
        expect(readdirSync(dirs.worktree)).toEqual([])
    })
})

describe('resolveAgyCliModel effort suffix mapping', () => {
    test('maps every Gemini tier and all five EffortLevel values with per-family clamping', () => {
        const cases: [
            string,
            Record<'low' | 'medium' | 'high' | 'xhigh' | 'max', string>,
        ][] = [
            [
                'gemini-4-neon-high',
                {
                    low: 'gemini-4-neon-low',
                    medium: 'gemini-4-neon-medium',
                    high: 'gemini-4-neon-high',
                    xhigh: 'gemini-4-neon-xhigh',
                    max: 'gemini-4-neon-xhigh',
                },
            ],
            [
                'gemini-4-hydrogen-high',
                {
                    low: 'gemini-4-hydrogen-low',
                    medium: 'gemini-4-hydrogen-medium',
                    high: 'gemini-4-hydrogen-high',
                    xhigh: 'gemini-4-hydrogen-xhigh',
                    max: 'gemini-4-hydrogen-xhigh',
                },
            ],
            [
                'gemini-4-argon-high',
                {
                    low: 'gemini-4-argon-low',
                    medium: 'gemini-4-argon-medium',
                    high: 'gemini-4-argon-high',
                    xhigh: 'gemini-4-argon-high',
                    max: 'gemini-4-argon-high',
                },
            ],
            [
                'gemini-3.8-flash-high',
                {
                    low: 'gemini-3.8-flash-low',
                    medium: 'gemini-3.8-flash-medium',
                    high: 'gemini-3.8-flash-high',
                    xhigh: 'gemini-3.8-flash-high',
                    max: 'gemini-3.8-flash-high',
                },
            ],
            [
                'gemini-4-other-xhigh',
                {
                    low: 'gemini-4-other-low',
                    medium: 'gemini-4-other-medium',
                    high: 'gemini-4-other-high',
                    xhigh: 'gemini-4-other-high',
                    max: 'gemini-4-other-high',
                },
            ],
        ]
        for (const [model, expected] of cases) {
            for (const effort of [
                'low',
                'medium',
                'high',
                'xhigh',
                'max',
            ] as const) {
                expect(resolveAgyCliModel({ model, effort })).toBe(
                    expected[effort]
                )
            }
        }
    })
})

describe('hook command quoting (#777)', () => {
    test('a hook command still runs when its paths hold spaces and quotes', async () => {
        const dir = join(dirs.temp_root, "luca's hooks dir")
        mkdirSync(dir, { recursive: true })
        const script = join(dir, 'agy hook.ts')
        writeFileSync(script, "console.log('hook ran')\n")
        const hooks = buildAgyHooksJson({
            bun_path: process.execPath,
            hook_script_path: script,
        })
        const command = z
            .object({
                luca: z.object({
                    SessionStart: z.array(z.object({ command: z.string() })),
                }),
            })
            .parse(hooks).luca.SessionStart[0]?.command
        expect(command).toBe(
            `'${process.execPath}' '${script.replace("'", `'\\''`)}'`
        )
        const proc = Bun.spawn(['sh', '-c', command ?? ''], {
            stdout: 'pipe',
            stderr: 'pipe',
        })
        const [exit_code, stdout] = await Promise.all([
            proc.exited,
            new Response(proc.stdout).text(),
        ])
        expect(exit_code).toBe(0)
        expect(stdout.trim()).toBe('hook ran')
    })
})

describe('agent messaging on agy (#777)', () => {
    const messaging: AgentMessaging = {
        address: 'implementer#11',
        send: () => ({ ok: true, detail: 'queued' }),
        deliver: () => null,
    }

    test('warns once when an agent with messaging launches, and launches it without messaging', async () => {
        const fake = fakeAgySpawner({
            turns: [
                { events: [agyInit({}), agyResult({})] },
                {
                    events: [
                        agyInit({ conversation_id: 'conv-2' }),
                        agyResult({ conversation_id: 'conv-2' }),
                    ],
                },
                {
                    events: [
                        agyInit({ conversation_id: 'conv-3' }),
                        agyResult({ conversation_id: 'conv-3' }),
                    ],
                },
            ],
        })
        const warnings: string[] = []
        const instructions: string[] = []
        const launcher = createAgyLauncher({
            agy_path: AGY_PATH,
            spawn: (args) => {
                const state_dir = args.env.LUCA_AGY_STATE_DIR ?? ''
                instructions.push(
                    AgyHookStateSchema.parse(
                        JSON.parse(
                            readFileSync(join(state_dir, 'state.json'), 'utf8')
                        )
                    ).instructions
                )
                return fake.spawn(args)
            },
            temp_root: dirs.temp_root,
            warn: (message) => warnings.push(message),
        })
        const launch = (with_messaging: AgentMessaging | null) =>
            launcher.launch({
                role: 'implementer',
                ticket: 11,
                prompt: 'Do work.',
                cwd: dirs.worktree,
                may_edit_tests: false,
                config: AGY_CONFIG,
                messaging: with_messaging,
                model: 'gemini-4-neon-high',
                effort: 'medium',
            })

        expect((await launch(null)).ok).toBe(true)
        expect(warnings).toEqual([])
        expect((await launch(messaging)).ok).toBe(true)
        expect((await launch(messaging)).ok).toBe(true)
        expect(warnings).toEqual([AGY_NO_MESSAGING_WARNING])
        for (const text of instructions) {
            expect(text).not.toContain('send_message')
        }
        await launcher.closeAll()
    })
})
