import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

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

describe('launch spawning and turn files (AC4)', () => {
    test('spawns expected CLI argv, reads denials.jsonl, and records open session', async () => {
        let state_dir = ''
        const fake = fakeAgySpawner({
            turns: [
                {
                    events: [
                        agyInit({ conversation_id: 'conv-42' }),
                        agyResult({
                            conversation_id: 'conv-42',
                            structured_output: { verdict: 'done' },
                        }),
                    ],
                    on_spawn: ({ env }) => {
                        state_dir = env.LUCA_AGY_STATE_DIR ?? ''
                        writeFileSync(
                            join(state_dir, 'denials.jsonl'),
                            `${JSON.stringify({
                                tool_name: 'run_command',
                                reason: 'Denied git push',
                            })}\n`
                        )
                    },
                },
            ],
        })
        const launcher = createAgyLauncher({
            agy_path: AGY_PATH,
            spawn: fake.spawn,
            temp_root: dirs.temp_root,
            turn_timeout_ms: 90_000,
        })

        const turn = await launcher.launch({
            role: 'test-writer',
            ticket: 7,
            prompt: 'Write tests.',
            cwd: dirs.worktree,
            may_edit_tests: true,
            config: AGY_CONFIG,
            messaging: null,
            model: 'gemini-3.8-flash-high',
            effort: 'high',
        })

        expect(turn).toMatchObject({
            ok: true,
            session_id: 'conv-42',
            structured_output: { verdict: 'done' },
        })
        expect(turn.session?.guard_denials).toEqual([
            { tool_name: 'run_command', reason: 'Denied git push' },
        ])
        expect(fake.calls[0]?.command).toBe(AGY_PATH)
        expect(fake.calls[0]?.argv).toEqual([
            '-p',
            'Write tests.',
            '--model',
            'gemini-3.8-flash-high',
            '--output-format',
            'stream-json',
            '--json-schema',
            join(state_dir, 'schema.json'),
            '--add-dir',
            join(state_dir, 'hooks'),
            '--sandbox',
            '--disable-slash-commands',
            '--print-timeout',
            '90s',
        ])
        await launcher.closeAll()
    })
})

describe('followUp resume, turn_index, resets, and guards (AC5)', () => {
    test('followUp resumes via --conversation, increments turn_index, and resets denials & out-of-turns.flag', async () => {
        let state_dir = ''
        const turn_indices: number[] = []
        const fake = fakeAgySpawner({
            turns: [
                {
                    events: [
                        agyInit({ conversation_id: 'conv-open' }),
                        agyResult({
                            conversation_id: 'conv-open',
                            structured_output: { pass: 1 },
                        }),
                    ],
                    on_spawn: ({ env }) => {
                        state_dir = env.LUCA_AGY_STATE_DIR ?? ''
                        const parsed = AgyHookStateSchema.parse(
                            JSON.parse(
                                readFileSync(
                                    join(state_dir, 'state.json'),
                                    'utf8'
                                )
                            )
                        )
                        turn_indices.push(parsed.turn_index)
                        writeFileSync(
                            join(state_dir, 'denials.jsonl'),
                            `${JSON.stringify({
                                tool_name: 'run_command',
                                reason: 'Stale denial',
                            })}\n`
                        )
                        writeFileSync(
                            join(state_dir, 'out-of-turns.flag'),
                            '1\n'
                        )
                    },
                },
                {
                    events: [
                        agyResult({
                            conversation_id: 'conv-open',
                            structured_output: { pass: 2 },
                        }),
                    ],
                    on_spawn: ({ env }) => {
                        const dir = env.LUCA_AGY_STATE_DIR ?? ''
                        const parsed = AgyHookStateSchema.parse(
                            JSON.parse(
                                readFileSync(join(dir, 'state.json'), 'utf8')
                            )
                        )
                        turn_indices.push(parsed.turn_index)
                        expect(
                            readFileSync(join(dir, 'denials.jsonl'), 'utf8')
                        ).toBe('')
                        expect(existsSync(join(dir, 'out-of-turns.flag'))).toBe(
                            false
                        )
                    },
                },
            ],
        })
        const launcher = createAgyLauncher({
            agy_path: AGY_PATH,
            spawn: fake.spawn,
            temp_root: dirs.temp_root,
            turn_timeout_ms: 60_000,
        })

        const first = await launcher.launch({
            role: 'implementer',
            ticket: 5,
            prompt: 'Build.',
            cwd: dirs.worktree,
            may_edit_tests: false,
            config: AGY_CONFIG,
            messaging: null,
            model: 'gemini-4-argon-high',
            effort: 'medium',
        })
        expect(first).toMatchObject({
            ok: false,
            failure: 'agent',
            out_of_turns: true,
            session_id: 'conv-open',
        })

        const second = await launcher.followUp({
            session_id: 'conv-open',
            role: 'implementer',
            ticket: 5,
            message: 'Fix lint.',
            cwd: dirs.worktree,
            config: AGY_CONFIG,
        })
        await launcher.closeAll()

        expect(second).toMatchObject({
            ok: true,
            session_id: 'conv-open',
            structured_output: { pass: 2 },
        })
        expect(second.session?.guard_denials).toEqual([])
        expect(turn_indices).toEqual([0, 1])
        expect(fake.calls[1]?.argv).toEqual([
            '-p',
            'Fix lint.',
            '--conversation',
            'conv-open',
            '--model',
            'gemini-4-argon-medium',
            '--output-format',
            'stream-json',
            '--json-schema',
            join(state_dir, 'schema.json'),
            '--add-dir',
            join(state_dir, 'hooks'),
            '--sandbox',
            '--disable-slash-commands',
            '--print-timeout',
            '60s',
        ])
    })

    test('followUp rejects unknown/closed sessions and role/ticket mismatches without spawning', async () => {
        const fake = fakeAgySpawner({
            turns: [
                {
                    events: [
                        agyInit({ conversation_id: 'conv-1' }),
                        agyResult({ conversation_id: 'conv-1' }),
                    ],
                },
            ],
        })
        const launcher = createAgyLauncher({
            agy_path: AGY_PATH,
            spawn: fake.spawn,
            temp_root: dirs.temp_root,
        })

        const missing = await launcher.followUp({
            session_id: 'conv-unknown',
            role: 'implementer',
            ticket: 1,
            message: 'Hello',
            cwd: dirs.worktree,
            config: AGY_CONFIG,
        })
        expect(missing).toEqual({
            ok: false,
            failure: 'engine',
            session_id: 'conv-unknown',
            session_gone: true,
            error: 'No open agent session conv-unknown: it closed or never started.',
        })

        await launcher.launch({
            role: 'implementer',
            ticket: 1,
            prompt: 'Start',
            cwd: dirs.worktree,
            may_edit_tests: false,
            config: AGY_CONFIG,
            messaging: null,
            model: 'gemini-4-neon-high',
            effort: 'medium',
        })

        const wrong = await launcher.followUp({
            session_id: 'conv-1',
            role: 'test-writer',
            ticket: 2,
            message: 'Fix',
            cwd: dirs.worktree,
            config: AGY_CONFIG,
        })
        expect(wrong).toEqual({
            ok: false,
            failure: 'engine',
            session_id: 'conv-1',
            error: 'Session conv-1 belongs to the implementer on #1, not the test-writer on #2.',
        })

        await launcher.closeSession({ session_id: 'conv-1' })
        const closed = await launcher.followUp({
            session_id: 'conv-1',
            role: 'implementer',
            ticket: 1,
            message: 'After close',
            cwd: dirs.worktree,
            config: AGY_CONFIG,
        })
        expect(closed).toEqual({
            ok: false,
            failure: 'engine',
            session_id: 'conv-1',
            session_gone: true,
            error: 'No open agent session conv-1: it closed or never started.',
        })
        expect(fake.calls).toHaveLength(1)
    })
})

describe('timeout and temp-dir cleanup (AC6, AC7)', () => {
    test('wall-clock timeout sends SIGTERM, cleans up temp_dir, and returns session_closed', async () => {
        let state_dir = ''
        const fake = fakeAgySpawner({
            turns: [
                {
                    hang: true,
                    events: [agyInit({ conversation_id: 'conv-timeout' })],
                    on_spawn: ({ env }) => {
                        state_dir = env.LUCA_AGY_STATE_DIR ?? ''
                    },
                },
            ],
        })
        const launcher = createAgyLauncher({
            agy_path: AGY_PATH,
            spawn: fake.spawn,
            temp_root: dirs.temp_root,
            turn_timeout_ms: 25,
        })

        const turn = await launcher.launch({
            role: 'implementer',
            ticket: 9,
            prompt: 'Hang.',
            cwd: dirs.worktree,
            may_edit_tests: false,
            config: AGY_CONFIG,
            messaging: null,
            model: 'gemini-4-neon-high',
            effort: 'medium',
        })

        expect(turn).toMatchObject({
            ok: false,
            failure: 'agent',
            session_closed: true,
            session_id: 'conv-timeout',
        })
        expect(turn.ok === false && turn.error).toMatch(
            /^The implementer timed out after \d+s\.$/
        )
        expect(fake.calls[0]?.signals).toEqual(['SIGTERM'])
        expect(existsSync(state_dir)).toBe(false)
        expect(readdirSync(dirs.temp_root)).toEqual([])

        const after = await launcher.followUp({
            session_id: 'conv-timeout',
            role: 'implementer',
            ticket: 9,
            message: 'Retry',
            cwd: dirs.worktree,
            config: AGY_CONFIG,
        })
        expect(after).toMatchObject({ ok: false, session_gone: true })
    })

    test('closeSession, closeAll, and fatal failures remove temp dirs cleanly', async () => {
        const fake = fakeAgySpawner({
            turns: [
                // 1. quota error -> plan
                {
                    events: [
                        agyInit({ conversation_id: 'conv-plan' }),
                        agyResult({
                            conversation_id: 'conv-plan',
                            status: 'ERROR',
                            error: 'RESOURCE_EXHAUSTED: Resets in 2m',
                        }),
                    ],
                },
                // 2. bad init model -> stop
                {
                    events: [
                        agyInit({
                            conversation_id: 'conv-stop',
                            model: 'gpt-5',
                        }),
                    ],
                },
                // 3. SUCCESS without conversation_id -> engine
                {
                    events: [agyResult({ conversation_id: null })],
                },
                // 4. open session closed via closeSession
                {
                    events: [
                        agyInit({ conversation_id: 'conv-a' }),
                        agyResult({ conversation_id: 'conv-a' }),
                    ],
                },
                // 5. open session closed via closeAll
                {
                    events: [
                        agyInit({ conversation_id: 'conv-b' }),
                        agyResult({ conversation_id: 'conv-b' }),
                    ],
                },
            ],
        })
        const launcher = createAgyLauncher({
            agy_path: AGY_PATH,
            spawn: fake.spawn,
            temp_root: dirs.temp_root,
        })

        const base = {
            role: 'implementer' as const,
            ticket: 1,
            prompt: 'Go.',
            cwd: dirs.worktree,
            may_edit_tests: false,
            config: AGY_CONFIG,
            messaging: null,
            model: 'gemini-4-neon-high',
            effort: 'medium' as const,
        }

        const plan_turn = await launcher.launch(base)
        expect(plan_turn).toMatchObject({ ok: false, failure: 'plan' })
        expect(readdirSync(dirs.temp_root)).toEqual([])

        const stop_turn = await launcher.launch(base)
        expect(stop_turn).toMatchObject({ ok: false, failure: 'stop' })
        expect(readdirSync(dirs.temp_root)).toEqual([])

        const no_id_turn = await launcher.launch(base)
        expect(no_id_turn).toMatchObject({
            ok: false,
            failure: 'engine',
            error: 'agy finished without a conversation_id.',
        })
        expect(readdirSync(dirs.temp_root)).toEqual([])

        const a = await launcher.launch(base)
        const b = await launcher.launch(base)
        expect(a.ok && b.ok).toBe(true)
        expect(readdirSync(dirs.temp_root)).toHaveLength(2)

        await launcher.closeSession({ session_id: 'conv-a' })
        expect(readdirSync(dirs.temp_root)).toHaveLength(1)

        await launcher.closeAll()
        expect(readdirSync(dirs.temp_root)).toEqual([])
    })

    test('spawn throw cleans up temp_dir and returns engine failure', async () => {
        const fake = fakeAgySpawner({
            throw_on_spawn: new Error('ENOENT spawn'),
        })
        const launcher = createAgyLauncher({
            agy_path: AGY_PATH,
            spawn: fake.spawn,
            temp_root: dirs.temp_root,
        })

        const turn = await launcher.launch({
            role: 'implementer',
            ticket: 3,
            prompt: 'Go.',
            cwd: dirs.worktree,
            may_edit_tests: false,
            config: AGY_CONFIG,
            messaging: null,
            model: 'gemini-4-neon-high',
            effort: 'medium',
        })
        expect(turn).toEqual({
            ok: false,
            failure: 'engine',
            error: 'Failed to spawn agy: ENOENT spawn',
        })
        expect(readdirSync(dirs.temp_root)).toEqual([])
    })

    test('followUp fatal plan failure cleans up session and temp_dir', async () => {
        const fake = fakeAgySpawner({
            turns: [
                {
                    events: [
                        agyInit({ conversation_id: 'conv-fu' }),
                        agyResult({ conversation_id: 'conv-fu' }),
                    ],
                },
                {
                    events: [
                        agyResult({
                            conversation_id: 'conv-fu',
                            status: 'ERROR',
                            error: '429 quota exceeded',
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

        const first = await launcher.launch({
            role: 'implementer',
            ticket: 4,
            prompt: 'Start.',
            cwd: dirs.worktree,
            may_edit_tests: false,
            config: AGY_CONFIG,
            messaging: null,
            model: 'gemini-4-neon-high',
            effort: 'medium',
        })
        expect(first.ok).toBe(true)

        const second = await launcher.followUp({
            session_id: 'conv-fu',
            role: 'implementer',
            ticket: 4,
            message: 'Continue.',
            cwd: dirs.worktree,
            config: AGY_CONFIG,
        })
        expect(second).toMatchObject({ ok: false, failure: 'plan' })
        expect(readdirSync(dirs.temp_root)).toEqual([])

        const after = await launcher.followUp({
            session_id: 'conv-fu',
            role: 'implementer',
            ticket: 4,
            message: 'Retry.',
            cwd: dirs.worktree,
            config: AGY_CONFIG,
        })
        expect(after).toMatchObject({ ok: false, session_gone: true })
    })
})
