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

import { afterEach, describe, expect, test } from 'bun:test'
import { z } from 'zod'

import type { AgentLauncher } from './agent-launcher'
import { createAgyLauncher } from './agy-launcher'
import { resultJsonSchema } from './claude-options'
import { AGY_MODEL_NAMES } from './provider'
import { createProviderLauncher } from './provider-launcher'
import { roleInstructions } from './role-instructions'
import { LENS_ROLES, type AgentRole } from './role-results'
import { MAX_TURNS } from './role-turns'
import type { TurnProgress } from './turn-progress'

import type { EngineConfig } from '../config/engine-config'
import { guardRoleOf } from '../guards/role-rules'
import {
    cleanupDir,
    createFakeAgySpawner,
    createTempRoot,
    makeAgyConfig,
    type FakeAgySpawnArgs,
    type FakeAgyTurnSpec,
} from '../testing/agy-e2e-helpers'

/**
 * E2E contract tests for Spec #777 Feature F12 (`agy-launcher.ts` and
 * `provider-launcher.ts`) — Tier 1 equivalence classes.
 * (Tier 2 boundary and lifecycle tests live in
 * `agy-launcher-lifecycle.e2e.test.ts`.)
 */

const roots: string[] = []
const AGY_BIN = '/opt/fake/bin/agy'

afterEach(() => {
    while (roots.length > 0) {
        const dir = roots.pop()
        if (dir !== undefined) cleanupDir({ dir })
    }
})

const makeWorkspace = () => {
    const root = createTempRoot({ prefix: 'luca-agy-launch-' })
    roots.push(root)
    const cwd = join(root, 'worktree')
    const temp_root = join(root, 'tmp')
    mkdirSync(join(cwd, 'src'), { recursive: true })
    mkdirSync(temp_root, { recursive: true })
    writeFileSync(join(cwd, 'src', 'app.ts'), 'export const app = 1\n')
    return { cwd, temp_root, config: makeAgyConfig({ provider: 'agy' }) }
}

const readJson = ({ path }: { path: string }): unknown =>
    JSON.parse(readFileSync(path, 'utf8'))

const okTurn = ({
    id = 'conv-1',
    model = 'gemini-4-neon-high',
    cwd = '/repo',
    output = { outcome: 'done' },
    delay_ms,
    on_spawn,
}: {
    id?: string
    model?: string
    cwd?: string
    output?: unknown
    delay_ms?: number
    on_spawn?: (args: FakeAgySpawnArgs) => void
} = {}): FakeAgyTurnSpec => ({
    ...(delay_ms === undefined ? {} : { delay_ms }),
    ...(on_spawn === undefined ? {} : { on_spawn }),
    lines: [
        {
            event: 'init',
            conversation_id: id,
            init: { model, cwd, tools: ['view_file', 'finish'] },
        },
        {
            event: 'result',
            result: {
                conversation_id: id,
                status: 'SUCCESS',
                response: 'done',
                duration_seconds: 1.5,
                num_turns: 2,
                structured_output: output,
                usage: {
                    input_tokens: 120,
                    output_tokens: 45,
                    thinking_tokens: 15,
                    cache_read_tokens: 300,
                    total_tokens: 480,
                },
            },
        },
    ],
})

const launch = ({
    launcher,
    cwd,
    config,
    ...rest
}: {
    launcher: { launch: AgentLauncher['launch'] }
    cwd: string
    config: EngineConfig
} & Partial<Parameters<AgentLauncher['launch']>[0]>) =>
    launcher.launch({
        role: 'implementer',
        ticket: 11,
        prompt: 'Work.',
        cwd,
        may_edit_tests: false,
        config,
        messaging: null,
        model: 'gemini-4-neon-high',
        effort: 'medium',
        ...rest,
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

const StateStub = z.object({ role: z.string(), turn_index: z.number() })

describe('F12: agy-launcher.ts & provider-launcher.ts — Tier 1 equivalence classes', () => {
    test('launch() writes schema.json, state.json, and hooks/.agents/hooks.json in temp_root with zero cwd writes', async () => {
        const { cwd, temp_root, config } = makeWorkspace()
        const beforeCwd = readdirSync(cwd)
        const hookScript = '/opt/luca/agy-hook.ts'
        let files: { state?: unknown; schema?: unknown; hooks?: unknown } = {}

        const { spawner, calls } = createFakeAgySpawner({
            turns: [
                okTurn({
                    id: 'conv-happy',
                    cwd,
                    on_spawn: ({ env }) => {
                        const dir = env.LUCA_AGY_STATE_DIR ?? ''
                        files = {
                            state: readJson({ path: join(dir, 'state.json') }),
                            schema: readJson({
                                path: join(dir, 'schema.json'),
                            }),
                            hooks: readJson({
                                path: join(
                                    dir,
                                    'hooks',
                                    '.agents',
                                    'hooks.json'
                                ),
                            }),
                        }
                    },
                }),
            ],
        })

        const launcher = createAgyLauncher({
            agy_path: AGY_BIN,
            spawn: spawner,
            temp_root,
            hook_script_path: hookScript,
            turn_timeout_ms: 120_000,
        })
        const turn = await launch({
            launcher,
            cwd,
            config,
            prompt: 'Build #11.',
        })

        expect(turn).toMatchObject({
            ok: true,
            session_id: 'conv-happy',
            structured_output: { outcome: 'done' },
            session: {
                session_id: 'conv-happy',
                model: 'gemini-4-neon-high',
                api_key_source: 'none',
                subscription_type: 'agy',
                claude_code_version: null,
                total_cost_usd: 0,
                num_turns: 2,
                duration_ms: 1500,
                usage: {
                    input_tokens: 120,
                    output_tokens: 60,
                    cache_read_input_tokens: 300,
                    cache_creation_input_tokens: 0,
                },
            },
        })

        const call = calls[0]
        const dir = call?.env.LUCA_AGY_STATE_DIR ?? ''
        expect(call?.command).toBe(AGY_BIN)
        expect(call?.cwd).toBe(cwd)
        expect(dir.startsWith(temp_root)).toBe(true)
        const expected = [
            '-p',
            'Build #11.',
            '--model',
            'gemini-4-neon-high',
            '--effort',
            'medium',
            '--output-format',
            'stream-json',
            '--json-schema',
            join(dir, 'schema.json'),
            '--add-dir',
            join(dir, 'hooks'),
            '--sandbox',
            '--disable-slash-commands',
            '--print-timeout',
            '120s',
        ]
        expect(call?.argv).toEqual(expected)

        expect(files.schema).toEqual(resultJsonSchema({ role: 'implementer' }))
        const instructions = roleInstructions({
            role: 'implementer',
            may_edit_tests: false,
            config,
            messaging: false,
            provider: 'agy',
        })
        expect(instructions).not.toContain('## Helpers')
        expect(instructions).not.toContain('## Agent messages')
        expect(files.state).toMatchObject({
            role: 'implementer',
            guard_role: guardRoleOf({ role: 'implementer' }),
            cwd,
            worktree_real: realpathSync(cwd),
            state_dir_real: realpathSync(dir),
            home_real: realpathSync(homedir()),
            may_edit_tests: false,
            max_turns: MAX_TURNS.implementer,
            turn_index: 0,
            instructions,
        })

        const hook = [
            {
                hooks: [
                    {
                        type: 'command',
                        command: `${process.execPath} ${hookScript}`,
                    },
                ],
            },
        ]
        expect(files.hooks).toEqual({
            hooks: {
                SessionStart: hook,
                PreToolUse: [{ matcher: '*', ...hook[0] }],
                PreInvocation: hook,
            },
        })
        expect(readdirSync(cwd)).toEqual(beforeCwd)

        await launcher.closeAll()
        expect(existsSync(dir)).toBe(false)
    })

    test('followUp() passes --conversation, increments turn_index, preserves model/effort, and resets per-turn files', async () => {
        const { cwd, temp_root, config } = makeWorkspace()
        const seen: [number, boolean, boolean][] = []
        const capture = (dir: string) => {
            const state = StateStub.parse(
                readJson({ path: join(dir, 'state.json') })
            )
            const denials = join(dir, 'denials.jsonl')
            seen.push([
                state.turn_index,
                existsSync(denials) && readFileSync(denials, 'utf8').length > 0,
                existsSync(join(dir, 'out-of-turns.flag')),
            ])
        }

        const { spawner, calls } = createFakeAgySpawner({
            turns: [
                okTurn({
                    id: 'conv-fu',
                    model: 'gemini-4-argon-high',
                    output: { step: 1 },
                    on_spawn: ({ env }) => {
                        const dir = env.LUCA_AGY_STATE_DIR ?? ''
                        capture(dir)
                        writeFileSync(
                            join(dir, 'denials.jsonl'),
                            '{"tool_name":"search_web","reason":"banned"}\n'
                        )
                        writeFileSync(join(dir, 'out-of-turns.flag'), '1\n')
                    },
                }),
                okTurn({
                    id: 'conv-fu',
                    model: 'gemini-4-argon-high',
                    output: { step: 2 },
                    on_spawn: ({ env }) =>
                        capture(env.LUCA_AGY_STATE_DIR ?? ''),
                }),
            ],
        })

        const launcher = createAgyLauncher({
            agy_path: AGY_BIN,
            spawn: spawner,
            temp_root,
        })
        await launch({
            launcher,
            cwd,
            config,
            model: 'gemini-4-argon-high',
            effort: 'high',
        })
        const second = await launcher.followUp({
            session_id: 'conv-fu',
            role: 'implementer',
            ticket: 11,
            message: 'Lint failed: fix it.',
            cwd,
            config,
        })
        await launcher.closeAll()

        expect(second).toMatchObject({
            ok: true,
            session_id: 'conv-fu',
            structured_output: { step: 2 },
            session: { guard_denials: [] },
        })
        expect(seen).toEqual([
            [0, false, false],
            [1, false, false],
        ])
        const a1 = calls[0]?.argv ?? []
        const a2 = calls[1]?.argv ?? []
        expect(
            [
                '-p',
                '--conversation',
                '--model',
                '--effort',
                '--json-schema',
                '--add-dir',
            ].map((flag) => flagValue({ argv: a2, flag }))
        ).toEqual([
            'Lint failed: fix it.',
            'conv-fu',
            'gemini-4-argon-high',
            'high',
            flagValue({ argv: a1, flag: '--json-schema' }),
            flagValue({ argv: a1, flag: '--add-dir' }),
        ])
    })

    test('concurrent multi-lens launches in the same cwd use isolated temp dirs with zero cwd mutations', async () => {
        const { cwd, temp_root, config } = makeWorkspace()
        const beforeCwd = readdirSync(cwd)
        const roles: AgentRole[] = [LENS_ROLES[0], LENS_ROLES[2], LENS_ROLES[3]]
        const { spawner, calls } = createFakeAgySpawner({
            turns: roles.map((_, i) =>
                okTurn({
                    id: `lens-${i}`,
                    model: AGY_MODEL_NAMES[i],
                    delay_ms: 15,
                    output: { verdict: 'approve' },
                })
            ),
        })
        const launcher = createAgyLauncher({
            agy_path: AGY_BIN,
            spawn: spawner,
            temp_root,
        })

        const turns = await Promise.all(
            roles.map((role, i) =>
                launch({
                    launcher,
                    cwd,
                    config,
                    role,
                    ticket: 10,
                    model: AGY_MODEL_NAMES[i],
                    effort: 'xhigh',
                })
            )
        )

        expect(turns.every((turn) => turn.ok)).toBe(true)
        expect(turns.map((turn) => turn.session?.model).toSorted()).toEqual(
            [...AGY_MODEL_NAMES].toSorted()
        )
        const stateDirs = calls.map((call) => call.env.LUCA_AGY_STATE_DIR ?? '')
        const addDirs = calls.map((call) =>
            flagValue({ argv: call.argv, flag: '--add-dir' })
        )
        expect(new Set(stateDirs).size).toBe(3)
        expect(new Set(addDirs).size).toBe(3)
        const launchedRoles = stateDirs.map(
            (dir) =>
                StateStub.parse(readJson({ path: join(dir, 'state.json') }))
                    .role
        )
        expect(launchedRoles.toSorted()).toEqual(roles.toSorted())
        expect(readdirSync(cwd)).toEqual(beforeCwd)

        await launcher.closeAll()
        expect(readdirSync(temp_root)).toEqual([])
    })

    test('closeSession() cleans only that session temp_dir and closeAll() cleans remaining sessions', async () => {
        const { cwd, temp_root, config } = makeWorkspace()
        const { spawner, calls } = createFakeAgySpawner({
            turns: [okTurn({ id: 'conv-a' }), okTurn({ id: 'conv-b' })],
        })
        const launcher = createAgyLauncher({
            agy_path: AGY_BIN,
            spawn: spawner,
            temp_root,
        })

        await launch({
            launcher,
            cwd,
            config,
            role: 'test-writer',
            may_edit_tests: true,
        })
        await launch({ launcher, cwd, config, ticket: 12 })

        const dirA = calls[0]?.env.LUCA_AGY_STATE_DIR ?? ''
        const dirB = calls[1]?.env.LUCA_AGY_STATE_DIR ?? ''
        expect(existsSync(dirA)).toBe(true)
        expect(existsSync(dirB)).toBe(true)

        await launcher.closeSession({ session_id: 'conv-a' })
        expect(existsSync(dirA)).toBe(false)
        expect(existsSync(dirB)).toBe(true)

        await launcher.closeSession({ session_id: 'never-existed' })
        expect(existsSync(dirB)).toBe(true)

        expect(
            await launcher.followUp({
                session_id: 'conv-a',
                role: 'test-writer',
                ticket: 11,
                message: 'hi',
                cwd,
                config,
            })
        ).toMatchObject({ ok: false, failure: 'engine', session_gone: true })

        await launcher.closeAll()
        expect(existsSync(dirB)).toBe(false)
        expect(readdirSync(temp_root)).toEqual([])
    })

    test('createProviderLauncher dispatches to Claude vs Agy launcher by provider', async () => {
        const { cwd } = makeWorkspace()
        const claudeLauncher = createProviderLauncher({ provider: 'claude' })
        const agyLauncher = createProviderLauncher({ provider: 'agy' })

        expect(
            await launch({
                launcher: claudeLauncher,
                cwd,
                config: makeAgyConfig({ provider: 'claude' }),
            })
        ).toEqual({
            ok: false,
            failure: 'stop',
            error: 'Agents launch only on opus, sonnet, haiku: gemini-4-neon-high',
        })
        expect(
            await launch({
                launcher: agyLauncher,
                cwd,
                config: makeAgyConfig({ provider: 'agy' }),
                model: 'opus',
            })
        ).toEqual({
            ok: false,
            failure: 'stop',
            error: 'Agents on agy launch only on gemini-4-neon-high, gemini-4-argon-high, gemini-3.8-flash-high: opus',
        })

        await claudeLauncher.closeAll?.()
        await agyLauncher.closeAll?.()
    })

    test('on_progress hears live TurnProgress updates and denials.jsonl attaches to session.guard_denials', async () => {
        const { cwd, temp_root, config } = makeWorkspace()
        const heard: TurnProgress[] = []
        const base = {
            conversation_id: 'conv-prog',
            step_index: 2,
            step_type: 'tool',
            tool_name: 'view_file',
        }
        const [init, result] = okTurn({ id: 'conv-prog' }).lines ?? []
        const { spawner } = createFakeAgySpawner({
            turns: [
                {
                    lines: [
                        init ?? {},
                        {
                            event: 'step_update',
                            step_update: {
                                ...base,
                                state: 'ACTIVE',
                                tool_info: {
                                    name: 'view_file',
                                    parameters: {
                                        AbsolutePath: join(
                                            cwd,
                                            'src',
                                            'app.ts'
                                        ),
                                    },
                                },
                                usage: {
                                    input_tokens: 40,
                                    output_tokens: 10,
                                    thinking_tokens: 5,
                                    cache_read_tokens: 100,
                                    total_tokens: 155,
                                },
                            },
                        },
                        {
                            event: 'step_update',
                            step_update: { ...base, state: 'DONE' },
                        },
                        result ?? {},
                    ],
                    on_spawn: ({ env }) => {
                        writeFileSync(
                            join(env.LUCA_AGY_STATE_DIR ?? '', 'denials.jsonl'),
                            '{"tool_name":"run_command","reason":"No background commands."}\n'
                        )
                    },
                },
            ],
        })

        const launcher = createAgyLauncher({
            agy_path: AGY_BIN,
            spawn: spawner,
            temp_root,
        })
        const turn = await launch({
            launcher,
            cwd,
            config,
            on_progress: (progress) => heard.push(structuredClone(progress)),
        })
        await launcher.closeAll()

        expect(turn.ok).toBe(true)
        expect(heard.length).toBeGreaterThanOrEqual(2)
        expect(heard.some((item) => item.open_call?.tool === 'view_file')).toBe(
            true
        )
        expect(heard.at(-1)?.open_call).toBeNull()
        expect(heard.at(-1)?.action).toMatchObject({
            tool: 'view_file',
            target: 'src/app.ts',
        })
        expect(heard.at(-1)?.tokens).toBeGreaterThanOrEqual(155)
        expect(turn.session?.guard_denials).toEqual([
            { tool_name: 'run_command', reason: 'No background commands.' },
        ])
    })
})
