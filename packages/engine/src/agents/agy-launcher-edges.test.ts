import {
    existsSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
    symlinkSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, test } from 'bun:test'

import { createAgyLauncher } from './agy-launcher'
import {
    AGY_CONFIG,
    AGY_PATH,
    agyInit,
    agyResult,
    fakeAgySpawner,
    useAgyTestDirs,
} from './agy-launcher-helpers'
import { AgyHookStateSchema } from './agy-tool-rules'

const dirs = useAgyTestDirs()
let extra_dirs: string[] = []

afterEach(() => {
    for (const dir of extra_dirs) {
        rmSync(dir, { recursive: true, force: true })
    }
    extra_dirs = []
})

const baseLaunch = ({ cwd = dirs.worktree }: { cwd?: string } = {}) => ({
    role: 'implementer' as const,
    ticket: 11,
    prompt: 'Do work.',
    cwd,
    may_edit_tests: false,
    config: AGY_CONFIG,
    messaging: null,
    model: 'gemini-4-neon-high',
    effort: 'medium' as const,
})

describe('agy-launcher Bug 2 and M5 lifecycle edge cases (#4–#11)', () => {
    test('duplicate conversation_id cleans up superseded temp dir so closeAll leaves none', async () => {
        const fake = fakeAgySpawner({
            turns: [
                {
                    events: [
                        agyInit({ conversation_id: 'dup-id' }),
                        agyResult({ conversation_id: 'dup-id' }),
                    ],
                },
                {
                    events: [
                        agyInit({ conversation_id: 'dup-id' }),
                        agyResult({ conversation_id: 'dup-id' }),
                    ],
                },
            ],
        })
        const launcher = createAgyLauncher({
            agy_path: AGY_PATH,
            spawn: fake.spawn,
            temp_root: dirs.temp_root,
        })

        const first = await launcher.launch(baseLaunch())
        expect(first.ok).toBe(true)
        const first_dirs = readdirSync(dirs.temp_root)
        expect(first_dirs).toHaveLength(1)

        const second = await launcher.launch(baseLaunch())
        expect(second.ok).toBe(true)
        const second_dirs = readdirSync(dirs.temp_root)
        expect(second_dirs).toHaveLength(1)
        expect(second_dirs[0]).not.toBe(first_dirs[0])

        await launcher.closeAll()
        expect(readdirSync(dirs.temp_root)).toEqual([])
    })

    test('nonexistent cwd fails with engine error and creates zero temp dirs (#4)', async () => {
        const fake = fakeAgySpawner()
        const launcher = createAgyLauncher({
            agy_path: AGY_PATH,
            spawn: fake.spawn,
            temp_root: dirs.temp_root,
        })

        const turn = await launcher.launch(
            baseLaunch({ cwd: join(dirs.worktree, 'does-not-exist') })
        )
        expect(turn).toMatchObject({ ok: false, failure: 'engine' })
        expect(fake.calls).toHaveLength(0)
        expect(readdirSync(dirs.temp_root)).toEqual([])
    })

    test('non-quota ERROR retains session with conversation_id and cleans up without conversation_id (#5, #6)', async () => {
        const fake = fakeAgySpawner({
            turns: [
                {
                    events: [
                        agyInit({ conversation_id: 'conv-err-keep' }),
                        agyResult({
                            conversation_id: 'conv-err-keep',
                            status: 'ERROR',
                            error: 'Tool failed.',
                        }),
                    ],
                },
                {
                    events: [
                        agyResult({
                            conversation_id: 'conv-err-keep',
                            status: 'SUCCESS',
                            structured_output: { fixed: true },
                        }),
                    ],
                },
                {
                    events: [
                        agyResult({
                            conversation_id: null,
                            status: 'ERROR',
                            error: 'Early failure.',
                        }),
                    ],
                },
                {
                    events: [],
                    stderr: 'crashed hard',
                    exit_code: 2,
                },
            ],
        })
        const launcher = createAgyLauncher({
            agy_path: AGY_PATH,
            spawn: fake.spawn,
            temp_root: dirs.temp_root,
        })

        const kept = await launcher.launch(baseLaunch())
        expect(kept).toMatchObject({
            ok: false,
            failure: 'agent',
            session_id: 'conv-err-keep',
        })
        expect(readdirSync(dirs.temp_root)).toHaveLength(1)

        const resumed = await launcher.followUp({
            session_id: 'conv-err-keep',
            role: 'implementer',
            ticket: 11,
            message: 'Try again.',
            cwd: dirs.worktree,
            config: AGY_CONFIG,
        })
        expect(resumed).toMatchObject({
            ok: true,
            session_id: 'conv-err-keep',
            structured_output: { fixed: true },
        })
        await launcher.closeAll()
        expect(readdirSync(dirs.temp_root)).toEqual([])

        const no_id_err = await launcher.launch(baseLaunch())
        expect(no_id_err).toMatchObject({
            ok: false,
            failure: 'agent',
            error: 'Early failure.',
        })
        expect(readdirSync(dirs.temp_root)).toEqual([])

        const crash_no_result = await launcher.launch(baseLaunch())
        expect(crash_no_result).toMatchObject({
            ok: false,
            failure: 'engine',
            error: 'agy exited with code 2 without a result event: crashed hard',
        })
        expect(readdirSync(dirs.temp_root)).toEqual([])
    })

    test('followUp missing agy binary and spawn throw clean up session and temp_dir (#7, #8)', async () => {
        const fake = fakeAgySpawner({
            turns: [
                {
                    events: [
                        agyInit({ conversation_id: 'conv-bin' }),
                        agyResult({ conversation_id: 'conv-bin' }),
                    ],
                },
                {
                    events: [
                        agyInit({ conversation_id: 'conv-spawn-throw' }),
                        agyResult({ conversation_id: 'conv-spawn-throw' }),
                    ],
                },
            ],
        })

        const original_which = Bun.which
        let allow_which = true
        Bun.which = (_name: string) => (allow_which ? AGY_PATH : null)
        try {
            const launcher = createAgyLauncher({
                spawn: fake.spawn,
                temp_root: dirs.temp_root,
            })
            const launched = await launcher.launch(baseLaunch())
            expect(launched.ok).toBe(true)

            allow_which = false
            const missing_bin = await launcher.followUp({
                session_id: 'conv-bin',
                role: 'implementer',
                ticket: 11,
                message: 'Continue.',
                cwd: dirs.worktree,
                config: AGY_CONFIG,
            })
            expect(missing_bin).toEqual({
                ok: false,
                failure: 'stop',
                session_id: 'conv-bin',
                error: 'No `agy` binary on PATH.',
            })
            expect(readdirSync(dirs.temp_root)).toEqual([])
        } finally {
            Bun.which = original_which
        }

        let spawn_count = 0
        const launcher_throw = createAgyLauncher({
            agy_path: AGY_PATH,
            spawn: (args) => {
                spawn_count += 1
                if (spawn_count === 2) throw new Error('EAGAIN followUp')
                return fake.spawn(args)
            },
            temp_root: dirs.temp_root,
        })
        const first = await launcher_throw.launch(baseLaunch())
        expect(first.ok).toBe(true)
        const fu_throw = await launcher_throw.followUp({
            session_id: 'conv-spawn-throw',
            role: 'implementer',
            ticket: 11,
            message: 'Continue.',
            cwd: dirs.worktree,
            config: AGY_CONFIG,
        })
        expect(fu_throw).toEqual({
            ok: false,
            failure: 'engine',
            session_id: 'conv-spawn-throw',
            error: 'Failed to spawn agy: EAGAIN followUp',
        })
        expect(readdirSync(dirs.temp_root)).toEqual([])
    })

    test('followUp wall-clock timeout kills process, cleans up, sets session_closed, and closeSession/closeAll are idempotent (#9, #10)', async () => {
        const fake = fakeAgySpawner({
            turns: [
                {
                    events: [
                        agyInit({ conversation_id: 'conv-fu-to' }),
                        agyResult({ conversation_id: 'conv-fu-to' }),
                    ],
                },
                {
                    hang: true,
                    events: [],
                },
                {
                    events: [
                        agyInit({ conversation_id: 'conv-idem' }),
                        agyResult({ conversation_id: 'conv-idem' }),
                    ],
                },
            ],
        })
        const launcher = createAgyLauncher({
            agy_path: AGY_PATH,
            spawn: fake.spawn,
            temp_root: dirs.temp_root,
            turn_timeout_ms: 25,
        })

        const launched = await launcher.launch(baseLaunch())
        expect(launched.ok).toBe(true)
        const state_dir = fake.calls[0]?.env.LUCA_AGY_STATE_DIR ?? ''
        expect(existsSync(state_dir)).toBe(true)

        const timed_out = await launcher.followUp({
            session_id: 'conv-fu-to',
            role: 'implementer',
            ticket: 11,
            message: 'Hang.',
            cwd: dirs.worktree,
            config: AGY_CONFIG,
        })
        expect(timed_out).toMatchObject({
            ok: false,
            failure: 'agent',
            session_id: 'conv-fu-to',
            session_closed: true,
        })
        expect(fake.calls[1]?.signals).toEqual(['SIGTERM'])
        expect(existsSync(state_dir)).toBe(false)
        expect(readdirSync(dirs.temp_root)).toEqual([])

        const third = await launcher.launch(baseLaunch())
        expect(third.ok).toBe(true)
        await launcher.closeSession({ session_id: 'conv-idem' })
        await launcher.closeSession({ session_id: 'conv-idem' })
        await launcher.closeAll()
        await launcher.closeAll()
        expect(readdirSync(dirs.temp_root)).toEqual([])
    })

    test('launch with symlinked cwd passes worktree_real to spawn while state.cwd preserves raw symlink (#11)', async () => {
        const link_parent = mkdtempSync(join(tmpdir(), 'agy-sym-parent-'))
        extra_dirs.push(link_parent)
        const symlink_cwd = join(link_parent, 'wt-link')
        symlinkSync(dirs.worktree, symlink_cwd)

        let captured_state: unknown
        const fake = fakeAgySpawner({
            turns: [
                {
                    events: [
                        agyInit({ conversation_id: 'conv-sym' }),
                        agyResult({ conversation_id: 'conv-sym' }),
                    ],
                    on_spawn: ({ env }) => {
                        const dir = env.LUCA_AGY_STATE_DIR ?? ''
                        captured_state = JSON.parse(
                            readFileSync(join(dir, 'state.json'), 'utf8')
                        )
                    },
                },
            ],
        })
        const launcher = createAgyLauncher({
            agy_path: AGY_PATH,
            spawn: fake.spawn,
            temp_root: dirs.temp_root,
        })

        const turn = await launcher.launch(baseLaunch({ cwd: symlink_cwd }))
        await launcher.closeAll()

        expect(turn.ok).toBe(true)
        expect(fake.calls[0]?.cwd).toBe(dirs.worktree)
        const parsed = AgyHookStateSchema.parse(captured_state)
        expect(parsed.worktree_real).toBe(dirs.worktree)
        expect(parsed.cwd).toBe(symlink_cwd)
    })

    test('createAgyLauncher survives throwing on_progress and cleans up temp_dir on stdout stream error (Bug 1)', async () => {
        const fake = fakeAgySpawner({
            turns: [
                {
                    events: [
                        agyInit({ conversation_id: 'conv-prog-ok' }),
                        {
                            event: 'step_update',
                            step_update: {
                                step_index: 1,
                                state: 'ACTIVE',
                                step_type: 'tool',
                                tool_name: 'view_file',
                                tool_info: {
                                    name: 'view_file',
                                    parameters: {
                                        AbsolutePath: `${dirs.worktree}/src/a.ts`,
                                    },
                                },
                            },
                        },
                        agyResult({
                            conversation_id: 'conv-prog-ok',
                            structured_output: { saved: true },
                        }),
                    ],
                },
            ],
        })
        const launcher = createAgyLauncher({
            agy_path: AGY_PATH,
            spawn: fake.spawn,
            temp_root: dirs.temp_root,
        })

        const ok_turn = await launcher.launch({
            ...baseLaunch(),
            on_progress: () => {
                throw new Error('disk full writing live.json')
            },
        })
        expect(ok_turn).toMatchObject({
            ok: true,
            session_id: 'conv-prog-ok',
            structured_output: { saved: true },
        })
        await launcher.closeAll()
        expect(readdirSync(dirs.temp_root)).toEqual([])

        const failing_launcher = createAgyLauncher({
            agy_path: AGY_PATH,
            spawn: () => ({
                stdout: new ReadableStream<Uint8Array>({
                    pull() {
                        throw new Error('broken launcher pipe')
                    },
                }),
                stderr: new ReadableStream<Uint8Array>({
                    start(controller) {
                        controller.close()
                    },
                }),
                exited: Promise.resolve(0),
                kill: () => {},
            }),
            temp_root: dirs.temp_root,
        })

        const err_turn = await failing_launcher.launch(baseLaunch())
        expect(err_turn).toMatchObject({
            ok: false,
            failure: 'engine',
            error: 'The agent session failed: broken launcher pipe',
        })
        expect(readdirSync(dirs.temp_root)).toEqual([])
    })
})
