import {
    mkdirSync,
    mkdtempSync,
    readFileSync,
    realpathSync,
    rmSync,
    writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, test } from 'bun:test'

import { runAgyHook, type AgyHookState } from './agy-hook'
import { parseDenialsJsonl } from './agy-stream-events'

import { EngineConfigSchema } from '../config/engine-config'
import { guardRoleOf } from '../guards/role-rules'

const HOOK_SCRIPT = join(import.meta.dir, 'agy-hook.ts')

const CONFIG = EngineConfigSchema.parse({
    checks: {
        test: 'bun test',
        types: 'bunx --bun tsc --noEmit',
        lint: 'bun run lint',
    },
    test_file_patterns: ['src/**/*.test.ts'],
    test_setup_files: ['src/test-setup.ts'],
})

let temp_dirs: string[] = []

const makeTempDir = (): string => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'agy-hook-test-')))
    temp_dirs.push(dir)
    return dir
}

const makeHookState = ({
    root,
    overrides = {},
}: {
    root: string
    overrides?: Partial<AgyHookState>
}): AgyHookState => {
    const worktree = join(root, 'wt')
    const state_dir = join(root, 'state')
    const home = join(root, 'home')
    mkdirSync(join(worktree, 'src'), { recursive: true })
    mkdirSync(state_dir, { recursive: true })
    mkdirSync(join(home, '.gemini'), { recursive: true })
    const role = overrides.role ?? 'implementer'
    return {
        role,
        guard_role: overrides.guard_role ?? guardRoleOf({ role }),
        cwd: overrides.cwd ?? worktree,
        worktree_real: overrides.worktree_real ?? worktree,
        state_dir_real: overrides.state_dir_real ?? state_dir,
        home_real: overrides.home_real ?? home,
        may_edit_tests: overrides.may_edit_tests ?? role === 'test-writer',
        config: overrides.config ?? CONFIG,
        max_turns: overrides.max_turns ?? 5,
        instructions: overrides.instructions ?? 'Role instructions body',
        turn_index: overrides.turn_index ?? 0,
    }
}

const runHookSubprocess = async ({
    cwd,
    stdin,
    state_dir,
}: {
    cwd: string
    stdin: string
    state_dir: string | undefined
}): Promise<{ exit_code: number; stdout: string; stderr: string }> => {
    const env: Record<string, string> = {}
    for (const [k, v] of Object.entries(process.env)) {
        if (v !== undefined && k !== 'LUCA_AGY_STATE_DIR') {
            env[k] = v
        }
    }
    if (state_dir !== undefined) {
        env.LUCA_AGY_STATE_DIR = state_dir
    }
    const child = Bun.spawn([process.execPath, HOOK_SCRIPT], {
        cwd,
        env,
        stdin: new Blob([stdin]),
        stdout: 'pipe',
        stderr: 'pipe',
    })
    const [stdout, stderr, exit_code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
    ])
    return { exit_code, stdout, stderr }
}

afterEach(() => {
    for (const dir of temp_dirs) {
        rmSync(dir, { recursive: true, force: true })
    }
    temp_dirs = []
})

describe('AC5: fail-closed behavior in agy-hook.ts subprocess', () => {
    test('fails closed on missing LUCA_AGY_STATE_DIR across PreToolUse, PreInvocation, SessionStart, and unknown events', async () => {
        const root = makeTempDir()
        const cases: [string, number, Record<string, unknown>][] = [
            [
                JSON.stringify({
                    hookEventName: 'PreToolUse',
                    toolCall: { name: 'finish', args: {} },
                }),
                0,
                {
                    decision: 'deny',
                    reason: 'Luca hook could not read guard state.',
                },
            ],
            [
                JSON.stringify({
                    hookEventName: 'PreInvocation',
                    invocationNum: 0,
                }),
                0,
                {
                    terminationBehavior: 'terminate',
                    injectSteps: [
                        {
                            errorMessage: {
                                userMessage:
                                    'Luca hook could not read guard state.',
                            },
                        },
                    ],
                },
            ],
            [JSON.stringify({ hookEventName: 'SessionStart' }), 1, {}],
            [
                JSON.stringify({ hookEventName: 'FutureEvent' }),
                0,
                {
                    decision: 'deny',
                    reason: 'Luca hook could not read guard state.',
                },
            ],
            [
                'not valid json {',
                0,
                {
                    decision: 'deny',
                    reason: 'Luca hook could not read guard state.',
                },
            ],
        ]
        for (const [stdin, expected_code, expected_json] of cases) {
            const res = await runHookSubprocess({
                cwd: root,
                stdin,
                state_dir: undefined,
            })
            expect(res.exit_code).toBe(expected_code)
            expect(JSON.parse(res.stdout)).toEqual(expected_json)
        }
    })

    test('fails closed on missing or invalid state.json', async () => {
        const root = makeTempDir()
        const state_dir = join(root, 'state')
        mkdirSync(state_dir, { recursive: true })

        const missing = await runHookSubprocess({
            cwd: root,
            stdin: JSON.stringify({
                hookEventName: 'PreToolUse',
                toolCall: { name: 'view_file', args: { Path: 'src/a.ts' } },
            }),
            state_dir,
        })
        expect(missing.exit_code).toBe(0)
        expect(JSON.parse(missing.stdout)).toEqual({
            decision: 'deny',
            reason: 'Luca hook could not read guard state.',
        })

        writeFileSync(join(state_dir, 'state.json'), '{bad json')
        const corrupt = await runHookSubprocess({
            cwd: root,
            stdin: JSON.stringify({ hookEventName: 'SessionStart' }),
            state_dir,
        })
        expect(corrupt.exit_code).toBe(1)
        expect(JSON.parse(corrupt.stdout)).toEqual({})

        writeFileSync(
            join(state_dir, 'state.json'),
            JSON.stringify({ role: 'bad' })
        )
        const invalid_schema = await runHookSubprocess({
            cwd: root,
            stdin: JSON.stringify({
                hookEventName: 'PreInvocation',
                invocationNum: 0,
            }),
            state_dir,
        })
        expect(invalid_schema.exit_code).toBe(0)
        expect(JSON.parse(invalid_schema.stdout)).toEqual({
            terminationBehavior: 'terminate',
            injectSteps: [
                {
                    errorMessage: {
                        userMessage: 'Luca hook could not read guard state.',
                    },
                },
            ],
        })
    })
})

describe('AC6: valid state SessionStart, PreToolUse, and PreInvocation behavior', () => {
    test('SessionStart injects state.instructions on turn_index 0 and returns {} on turn_index > 0', async () => {
        const root = makeTempDir()
        const state0 = makeHookState({
            root,
            overrides: {
                turn_index: 0,
                instructions: 'Follow your role rules.',
            },
        })
        writeFileSync(
            join(state0.state_dir_real, 'state.json'),
            JSON.stringify(state0)
        )
        const first = await runHookSubprocess({
            cwd: state0.worktree_real,
            stdin: JSON.stringify({
                hookEventName: 'SessionStart',
                conversationId: 'conv-1',
                cwd: state0.worktree_real,
            }),
            state_dir: state0.state_dir_real,
        })
        expect(first.exit_code).toBe(0)
        expect(JSON.parse(first.stdout)).toEqual({
            injectSteps: [
                {
                    systemMessage: {
                        systemMessage: 'Follow your role rules.',
                    },
                },
            ],
        })

        writeFileSync(
            join(state0.state_dir_real, 'state.json'),
            JSON.stringify({ ...state0, turn_index: 1 })
        )
        const follow_up = await runHookSubprocess({
            cwd: state0.worktree_real,
            stdin: JSON.stringify({ hookEventName: 'SessionStart' }),
            state_dir: state0.state_dir_real,
        })
        expect(follow_up.exit_code).toBe(0)
        expect(JSON.parse(follow_up.stdout)).toEqual({})
    })

    test('PreToolUse allows permitted tools and records denials to denials.jsonl', async () => {
        const root = makeTempDir()
        const state = makeHookState({
            root,
            overrides: { role: 'implementer', may_edit_tests: false },
        })
        writeFileSync(
            join(state.state_dir_real, 'state.json'),
            JSON.stringify(state)
        )

        const allowed = await runHookSubprocess({
            cwd: state.worktree_real,
            stdin: JSON.stringify({
                hookEventName: 'PreToolUse',
                toolCall: {
                    id: '1',
                    name: 'view_file',
                    args: { AbsolutePath: 'src/index.ts' },
                },
            }),
            state_dir: state.state_dir_real,
        })
        expect(allowed.exit_code).toBe(0)
        expect(JSON.parse(allowed.stdout)).toEqual({ decision: 'allow' })

        const denied_secret = await runHookSubprocess({
            cwd: state.worktree_real,
            stdin: JSON.stringify({
                hookEventName: 'PreToolUse',
                toolCall: {
                    id: '2',
                    name: 'view_file',
                    args: {
                        AbsolutePath: join(state.home_real, '.gemini', 'creds'),
                    },
                },
            }),
            state_dir: state.state_dir_real,
        })
        expect(denied_secret.exit_code).toBe(0)
        expect(JSON.parse(denied_secret.stdout)).toEqual({
            decision: 'deny',
            reason: 'Reading secret files is not allowed.',
        })

        const denied_test = await runHookSubprocess({
            cwd: state.worktree_real,
            stdin: JSON.stringify({
                hookEventName: 'PreToolUse',
                toolCall: {
                    id: '3',
                    name: 'write_to_file',
                    args: { TargetFile: 'src/foo.test.ts' },
                },
            }),
            state_dir: state.state_dir_real,
        })
        expect(denied_test.exit_code).toBe(0)
        expect(JSON.parse(denied_test.stdout)).toEqual({
            decision: 'deny',
            reason: 'A implementer may not write src/foo.test.ts.',
        })

        const denials = parseDenialsJsonl({
            text: readFileSync(
                join(state.state_dir_real, 'denials.jsonl'),
                'utf8'
            ),
        })
        expect(denials).toEqual([
            {
                tool_name: 'view_file',
                reason: 'Reading secret files is not allowed.',
            },
            {
                tool_name: 'write_to_file',
                reason: 'A implementer may not write src/foo.test.ts.',
            },
        ])
    })

    test('PreInvocation enforces max_turns and writes out-of-turns.flag; unknown events deny', async () => {
        const root = makeTempDir()
        const state = makeHookState({
            root,
            overrides: { max_turns: 3 },
        })
        writeFileSync(
            join(state.state_dir_real, 'state.json'),
            JSON.stringify(state)
        )

        const under = await runHookSubprocess({
            cwd: state.worktree_real,
            stdin: JSON.stringify({
                hookEventName: 'PreInvocation',
                invocationNum: 2,
            }),
            state_dir: state.state_dir_real,
        })
        expect(under.exit_code).toBe(0)
        expect(JSON.parse(under.stdout)).toEqual({})

        const at_limit = await runHookSubprocess({
            cwd: state.worktree_real,
            stdin: JSON.stringify({
                hookEventName: 'PreInvocation',
                invocationNum: 3,
            }),
            state_dir: state.state_dir_real,
        })
        expect(at_limit.exit_code).toBe(0)
        expect(JSON.parse(at_limit.stdout)).toEqual({
            terminationBehavior: 'terminate',
            injectSteps: [
                { errorMessage: { userMessage: 'Turn limit reached.' } },
            ],
        })
        expect(
            readFileSync(
                join(state.state_dir_real, 'out-of-turns.flag'),
                'utf8'
            ).trim()
        ).toBe('1')

        // Direct pure call checks malformed PreToolUse and unknown event fail-closed behavior.
        const bad_tool = await runAgyHook({
            stdin_text: JSON.stringify({
                hookEventName: 'PreToolUse',
                toolCall: {},
            }),
            state_dir: state.state_dir_real,
        })
        expect(bad_tool.exit_code).toBe(0)
        expect(bad_tool.output.decision).toBe('deny')

        const unknown = await runAgyHook({
            stdin_text: JSON.stringify({ hookEventName: 'SomethingElse' }),
            state_dir: state.state_dir_real,
        })
        expect(unknown).toEqual({
            exit_code: 0,
            output: {
                decision: 'deny',
                reason: 'Unknown hook event: SomethingElse.',
            },
        })
    })

    test('records malformed PreToolUse denials, allows finish with args: null, handles PreInvocation edge cases, and rejects whitespace state_dir / negative bounds', async () => {
        const root = makeTempDir()
        const state = makeHookState({
            root,
            overrides: { max_turns: 0 },
        })
        writeFileSync(
            join(state.state_dir_real, 'state.json'),
            JSON.stringify(state)
        )

        for (const toolCall of [{}, { name: '' }]) {
            const bad = await runAgyHook({
                stdin_text: JSON.stringify({
                    hookEventName: 'PreToolUse',
                    toolCall,
                }),
                state_dir: state.state_dir_real,
            })
            expect(bad).toEqual({
                exit_code: 0,
                output: {
                    decision: 'deny',
                    reason: 'Luca hook received malformed PreToolUse payload.',
                },
            })
        }
        const denials = parseDenialsJsonl({
            text: readFileSync(
                join(state.state_dir_real, 'denials.jsonl'),
                'utf8'
            ),
        })
        expect(denials).toEqual([
            {
                tool_name: 'unknown',
                reason: 'Luca hook received malformed PreToolUse payload.',
            },
            {
                tool_name: 'unknown',
                reason: 'Luca hook received malformed PreToolUse payload.',
            },
        ])

        const finish_null = await runAgyHook({
            stdin_text: JSON.stringify({
                hookEventName: 'PreToolUse',
                toolCall: { name: 'finish', args: null },
            }),
            state_dir: state.state_dir_real,
        })
        expect(finish_null).toEqual({
            exit_code: 0,
            output: { decision: 'allow' },
        })

        for (const payload of [
            { hookEventName: 'PreInvocation' },
            { hookEventName: 'PreInvocation', invocationNum: null },
            { hookEventName: 'PreInvocation', invocationNum: '5' },
        ]) {
            expect(
                await runAgyHook({
                    stdin_text: JSON.stringify(payload),
                    state_dir: state.state_dir_real,
                })
            ).toEqual({ exit_code: 0, output: {} })
        }

        const zero_limit = await runAgyHook({
            stdin_text: JSON.stringify({
                hookEventName: 'PreInvocation',
                invocationNum: 0,
            }),
            state_dir: state.state_dir_real,
        })
        expect(zero_limit).toEqual({
            exit_code: 0,
            output: {
                terminationBehavior: 'terminate',
                injectSteps: [
                    { errorMessage: { userMessage: 'Turn limit reached.' } },
                ],
            },
        })
        expect(
            readFileSync(
                join(state.state_dir_real, 'out-of-turns.flag'),
                'utf8'
            ).trim()
        ).toBe('1')

        const ws_dir = await runAgyHook({
            stdin_text: JSON.stringify({
                hookEventName: 'PreToolUse',
                toolCall: { name: 'finish', args: {} },
            }),
            state_dir: '   ',
        })
        expect(ws_dir).toEqual({
            exit_code: 0,
            output: {
                decision: 'deny',
                reason: 'Luca hook could not read guard state.',
            },
        })

        for (const bad_bound of [
            { ...state, turn_index: -1 },
            { ...state, max_turns: -1 },
        ]) {
            writeFileSync(
                join(state.state_dir_real, 'state.json'),
                JSON.stringify(bad_bound)
            )
            expect(
                await runAgyHook({
                    stdin_text: JSON.stringify({
                        hookEventName: 'PreToolUse',
                        toolCall: { name: 'finish', args: {} },
                    }),
                    state_dir: state.state_dir_real,
                })
            ).toEqual({
                exit_code: 0,
                output: {
                    decision: 'deny',
                    reason: 'Luca hook could not read guard state.',
                },
            })
        }
    })
})
