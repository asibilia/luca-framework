import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    realpathSync,
    rmSync,
    writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { z } from 'zod'

import { EngineConfigSchema } from '../config/engine-config'
import { guardRoleOf } from '../guards/role-rules'

const HOOK_SCRIPT = join(import.meta.dir, 'agy-hook.ts')

const CONFIG = EngineConfigSchema.parse({
    checks: { test: 'bun test' },
    test_file_patterns: ['src/**/*.test.ts'],
    test_setup_files: [],
    rule_files: [],
})

const DenialLineSchema = z.object({
    tool_name: z.string(),
    reason: z.string(),
})

type HookFixture = {
    root: string
    worktree_real: string
    state_dir_real: string
    home_real: string
}

let fixture: HookFixture | null = null

const buildState = ({
    fx,
    role = 'implementer',
    may_edit_tests = false,
    max_turns = 60,
    turn_index = 0,
    instructions = 'Follow role instructions strictly.',
}: {
    fx: HookFixture
    role?: 'implementer' | 'test-writer' | 'ticket-reviewer' | 'learner'
    may_edit_tests?: boolean
    max_turns?: number
    turn_index?: number
    instructions?: string
}) => ({
    role,
    guard_role: guardRoleOf({ role }),
    cwd: fx.worktree_real,
    worktree_real: fx.worktree_real,
    state_dir_real: fx.state_dir_real,
    home_real: fx.home_real,
    may_edit_tests,
    config: CONFIG,
    max_turns,
    turn_index,
    instructions,
})

const writeState = ({
    fx,
    state,
}: {
    fx: HookFixture
    state: Record<string, unknown>
}) => {
    writeFileSync(join(fx.state_dir_real, 'state.json'), JSON.stringify(state))
}

const runHook = async ({
    stdin,
    state_dir,
}: {
    stdin: string
    state_dir?: string
}): Promise<{ exit_code: number; stdout: string; stderr: string }> => {
    const env: Record<string, string> = {
        PATH: process.env.PATH ?? '/usr/bin:/bin',
    }
    if (state_dir !== undefined) {
        env.LUCA_AGY_STATE_DIR = state_dir
    }
    const proc = Bun.spawn([process.execPath, HOOK_SCRIPT], {
        stdin: new TextEncoder().encode(stdin),
        stdout: 'pipe',
        stderr: 'pipe',
        env,
    })
    const [exit_code, stdout, stderr] = await Promise.all([
        proc.exited,
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
    ])
    return { exit_code, stdout, stderr }
}

beforeEach(() => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'luca-agy-hook-')))
    const worktree_real = join(root, 'worktree')
    const state_dir_real = join(root, 'state')
    const home_real = join(root, 'home')
    mkdirSync(join(worktree_real, 'src'), { recursive: true })
    mkdirSync(state_dir_real, { recursive: true })
    mkdirSync(home_real, { recursive: true })
    writeFileSync(join(worktree_real, 'src', 'app.ts'), 'export const a = 1\n')
    fixture = { root, worktree_real, state_dir_real, home_real }
})

afterEach(() => {
    if (fixture !== null) {
        rmSync(fixture.root, { recursive: true, force: true })
        fixture = null
    }
})

describe('Tier 1 — agy-hook.ts subprocess protocol', () => {
    test('SessionStart on turn_index 0 injects state.instructions and exits 0', async () => {
        if (fixture === null) throw new Error('missing fixture')
        const state = buildState({
            fx: fixture,
            turn_index: 0,
            instructions: 'Custom agy prompt text',
        })
        writeState({ fx: fixture, state })

        const res = await runHook({
            state_dir: fixture.state_dir_real,
            stdin: JSON.stringify({
                hookEventName: 'SessionStart',
                conversationId: 'conv-1',
                cwd: fixture.worktree_real,
            }),
        })

        expect(res.exit_code).toBe(0)
        expect(JSON.parse(res.stdout)).toEqual({
            injectSteps: [
                {
                    systemMessage: {
                        systemMessage: 'Custom agy prompt text',
                    },
                },
            ],
        })
    })

    test('SessionStart on turn_index > 0 outputs {} without re-injecting instructions', async () => {
        if (fixture === null) throw new Error('missing fixture')
        writeState({
            fx: fixture,
            state: buildState({ fx: fixture, turn_index: 1 }),
        })

        const res = await runHook({
            state_dir: fixture.state_dir_real,
            stdin: JSON.stringify({
                hookEventName: 'SessionStart',
                conversationId: 'conv-1',
                cwd: fixture.worktree_real,
            }),
        })

        expect(res.exit_code).toBe(0)
        expect(JSON.parse(res.stdout)).toEqual({})
    })

    test('PreToolUse allows permitted tool call without writing denials.jsonl', async () => {
        if (fixture === null) throw new Error('missing fixture')
        writeState({ fx: fixture, state: buildState({ fx: fixture }) })

        const viewRes = await runHook({
            state_dir: fixture.state_dir_real,
            stdin: JSON.stringify({
                hookEventName: 'PreToolUse',
                toolCall: {
                    id: 'call-1',
                    name: 'view_file',
                    args: {
                        AbsolutePath: join(
                            fixture.worktree_real,
                            'src',
                            'app.ts'
                        ),
                    },
                },
            }),
        })
        const finishRes = await runHook({
            state_dir: fixture.state_dir_real,
            stdin: JSON.stringify({
                hookEventName: 'PreToolUse',
                toolCall: { id: 'call-2', name: 'finish', args: {} },
            }),
        })

        expect(viewRes.exit_code).toBe(0)
        expect(JSON.parse(viewRes.stdout)).toEqual({ decision: 'allow' })
        expect(finishRes.exit_code).toBe(0)
        expect(JSON.parse(finishRes.stdout)).toEqual({ decision: 'allow' })
        expect(existsSync(join(fixture.state_dir_real, 'denials.jsonl'))).toBe(
            false
        )
    })

    test('PreToolUse denies forbidden tool call and appends JSONL record to denials.jsonl', async () => {
        if (fixture === null) throw new Error('missing fixture')
        writeState({ fx: fixture, state: buildState({ fx: fixture }) })

        const res = await runHook({
            state_dir: fixture.state_dir_real,
            stdin: JSON.stringify({
                hookEventName: 'PreToolUse',
                toolCall: {
                    id: 'call-3',
                    name: 'run_command',
                    args: { CommandLine: 'git push' },
                },
            }),
        })

        expect(res.exit_code).toBe(0)
        const payload = z
            .object({ decision: z.string(), reason: z.string() })
            .parse(JSON.parse(res.stdout))
        expect(payload.decision).toBe('deny')
        expect(payload.reason.length).toBeGreaterThan(0)

        const lines = readFileSync(
            join(fixture.state_dir_real, 'denials.jsonl'),
            'utf8'
        )
            .trim()
            .split('\n')
        expect(lines).toHaveLength(1)
        const logged = DenialLineSchema.parse(JSON.parse(lines[0] ?? '{}'))
        expect(logged).toEqual({
            tool_name: 'run_command',
            reason: payload.reason,
        })
    })

    test('PreInvocation below max_turns returns {} without creating out-of-turns.flag', async () => {
        if (fixture === null) throw new Error('missing fixture')
        writeState({
            fx: fixture,
            state: buildState({ fx: fixture, max_turns: 60 }),
        })

        const res = await runHook({
            state_dir: fixture.state_dir_real,
            stdin: JSON.stringify({
                hookEventName: 'PreInvocation',
                invocationNum: 0,
                initialNumSteps: 1,
            }),
        })

        expect(res.exit_code).toBe(0)
        expect(JSON.parse(res.stdout)).toEqual({})
        expect(
            existsSync(join(fixture.state_dir_real, 'out-of-turns.flag'))
        ).toBe(false)
    })

    test('PreInvocation at max_turns writes out-of-turns.flag and terminates', async () => {
        if (fixture === null) throw new Error('missing fixture')
        writeState({
            fx: fixture,
            state: buildState({ fx: fixture, max_turns: 60 }),
        })

        const res = await runHook({
            state_dir: fixture.state_dir_real,
            stdin: JSON.stringify({
                hookEventName: 'PreInvocation',
                invocationNum: 60,
            }),
        })

        expect(res.exit_code).toBe(0)
        expect(JSON.parse(res.stdout)).toEqual({
            terminationBehavior: 'terminate',
            injectSteps: [
                { errorMessage: { userMessage: 'Turn limit reached.' } },
            ],
        })
        expect(
            existsSync(join(fixture.state_dir_real, 'out-of-turns.flag'))
        ).toBe(true)
    })
})

describe('Tier 2 — agy-hook.ts fail-closed paths and boundaries', () => {
    test('missing or empty LUCA_AGY_STATE_DIR fails closed per hookEventName', async () => {
        for (const state_dir of [undefined, '']) {
            const ss = await runHook({
                state_dir,
                stdin: JSON.stringify({ hookEventName: 'SessionStart' }),
            })
            expect(ss.exit_code).toBe(1)
            expect(JSON.parse(ss.stdout)).toEqual({})

            const pi = await runHook({
                state_dir,
                stdin: JSON.stringify({
                    hookEventName: 'PreInvocation',
                    invocationNum: 0,
                }),
            })
            expect(pi.exit_code).toBe(0)
            expect(JSON.parse(pi.stdout)).toEqual({
                terminationBehavior: 'terminate',
                injectSteps: [
                    {
                        errorMessage: {
                            userMessage:
                                'Luca hook could not read guard state.',
                        },
                    },
                ],
            })

            const pt = await runHook({
                state_dir,
                stdin: JSON.stringify({
                    hookEventName: 'PreToolUse',
                    toolCall: { name: 'finish', args: {} },
                }),
            })
            expect(pt.exit_code).toBe(0)
            expect(JSON.parse(pt.stdout)).toEqual({
                decision: 'deny',
                reason: 'Luca hook could not read guard state.',
            })
        }
    })

    test('missing, corrupt, or incomplete state.json fails closed per hookEventName', async () => {
        if (fixture === null) throw new Error('missing fixture')
        const modes = ['missing', 'corrupt', 'incomplete'] as const
        for (const mode of modes) {
            const dir = join(fixture.root, `bad-${mode}`)
            mkdirSync(dir, { recursive: true })
            if (mode === 'corrupt') {
                writeFileSync(join(dir, 'state.json'), '{bad json')
            } else if (mode === 'incomplete') {
                writeFileSync(
                    join(dir, 'state.json'),
                    JSON.stringify({ role: 'implementer' })
                )
            }

            const ss = await runHook({
                state_dir: dir,
                stdin: JSON.stringify({ hookEventName: 'SessionStart' }),
            })
            expect(ss.exit_code).toBe(1)
            expect(JSON.parse(ss.stdout)).toEqual({})

            const pi = await runHook({
                state_dir: dir,
                stdin: JSON.stringify({
                    hookEventName: 'PreInvocation',
                    invocationNum: 0,
                }),
            })
            expect(pi.exit_code).toBe(0)
            expect(JSON.parse(pi.stdout)).toEqual({
                terminationBehavior: 'terminate',
                injectSteps: [
                    {
                        errorMessage: {
                            userMessage:
                                'Luca hook could not read guard state.',
                        },
                    },
                ],
            })

            const pt = await runHook({
                state_dir: dir,
                stdin: JSON.stringify({
                    hookEventName: 'PreToolUse',
                    toolCall: { name: 'finish', args: {} },
                }),
            })
            expect(pt.exit_code).toBe(0)
            expect(JSON.parse(pt.stdout)).toEqual({
                decision: 'deny',
                reason: 'Luca hook could not read guard state.',
            })
        }
    })

    test('malformed, empty, or non-object stdin fails closed with deny and exit 0', async () => {
        if (fixture === null) throw new Error('missing fixture')
        writeState({ fx: fixture, state: buildState({ fx: fixture }) })

        for (const stdin of ['{not json', '', 'null', '[]']) {
            const res = await runHook({
                state_dir: fixture.state_dir_real,
                stdin,
            })
            expect(res.exit_code).toBe(0)
            expect(JSON.parse(res.stdout)).toEqual({
                decision: 'deny',
                reason: 'Luca hook could not read guard state.',
            })
        }
    })

    test('unknown or missing hookEventName fails closed with deny and exit 0', async () => {
        if (fixture === null) throw new Error('missing fixture')
        writeState({ fx: fixture, state: buildState({ fx: fixture }) })

        for (const payload of [
            { hookEventName: 'PostToolUse' },
            { hookEventName: 123 },
            {},
        ]) {
            const res = await runHook({
                state_dir: fixture.state_dir_real,
                stdin: JSON.stringify(payload),
            })
            expect(res.exit_code).toBe(0)
            const out = z
                .object({ decision: z.string(), reason: z.string() })
                .parse(JSON.parse(res.stdout))
            expect(out.decision).toBe('deny')
            expect(out.reason.length).toBeGreaterThan(0)
        }
    })

    test('PreInvocation distinguishes max_turns - 1 from max_turns and max_turns + 5', async () => {
        if (fixture === null) throw new Error('missing fixture')
        writeState({
            fx: fixture,
            state: buildState({ fx: fixture, max_turns: 5 }),
        })

        const below = await runHook({
            state_dir: fixture.state_dir_real,
            stdin: JSON.stringify({
                hookEventName: 'PreInvocation',
                invocationNum: 4,
            }),
        })
        expect(below.exit_code).toBe(0)
        expect(JSON.parse(below.stdout)).toEqual({})
        expect(
            existsSync(join(fixture.state_dir_real, 'out-of-turns.flag'))
        ).toBe(false)

        for (const invocationNum of [5, 10]) {
            const atOrAbove = await runHook({
                state_dir: fixture.state_dir_real,
                stdin: JSON.stringify({
                    hookEventName: 'PreInvocation',
                    invocationNum,
                }),
            })
            expect(atOrAbove.exit_code).toBe(0)
            expect(JSON.parse(atOrAbove.stdout)).toEqual({
                terminationBehavior: 'terminate',
                injectSteps: [
                    { errorMessage: { userMessage: 'Turn limit reached.' } },
                ],
            })
            expect(
                existsSync(join(fixture.state_dir_real, 'out-of-turns.flag'))
            ).toBe(true)
        }
    })

    test('PreToolUse with missing toolCall or non-string toolCall.name fails closed to deny', async () => {
        if (fixture === null) throw new Error('missing fixture')
        writeState({ fx: fixture, state: buildState({ fx: fixture }) })

        for (const payload of [
            { hookEventName: 'PreToolUse' },
            { hookEventName: 'PreToolUse', toolCall: { name: 42, args: {} } },
        ]) {
            const res = await runHook({
                state_dir: fixture.state_dir_real,
                stdin: JSON.stringify(payload),
            })
            expect(res.exit_code).toBe(0)
            const out = z
                .object({ decision: z.string(), reason: z.string() })
                .parse(JSON.parse(res.stdout))
            expect(out.decision).toBe('deny')
            expect(out.reason.length).toBeGreaterThan(0)
        }
    })

    test('multiple PreToolUse denials append ordered JSONL lines without overwriting earlier denials', async () => {
        if (fixture === null) throw new Error('missing fixture')
        writeState({
            fx: fixture,
            state: buildState({
                fx: fixture,
                role: 'test-writer',
                may_edit_tests: true,
            }),
        })

        await runHook({
            state_dir: fixture.state_dir_real,
            stdin: JSON.stringify({
                hookEventName: 'PreToolUse',
                toolCall: { name: 'search_web', args: { query: 'bun' } },
            }),
        })
        await runHook({
            state_dir: fixture.state_dir_real,
            stdin: JSON.stringify({
                hookEventName: 'PreToolUse',
                toolCall: {
                    name: 'view_file',
                    args: {
                        AbsolutePath: join(
                            fixture.worktree_real,
                            'src',
                            'app.ts'
                        ),
                    },
                },
            }),
        })
        await runHook({
            state_dir: fixture.state_dir_real,
            stdin: JSON.stringify({
                hookEventName: 'PreToolUse',
                toolCall: {
                    name: 'write_to_file',
                    args: { TargetFile: 'src/app.ts' },
                },
            }),
        })

        const lines = readFileSync(
            join(fixture.state_dir_real, 'denials.jsonl'),
            'utf8'
        )
            .trim()
            .split('\n')
        expect(lines).toHaveLength(2)
        const first = DenialLineSchema.parse(JSON.parse(lines[0] ?? '{}'))
        const second = DenialLineSchema.parse(JSON.parse(lines[1] ?? '{}'))
        expect(first.tool_name).toBe('search_web')
        expect(first.reason).toBe(
            'Tool search_web is not allowed for role test-writer.'
        )
        expect(second.tool_name).toBe('write_to_file')
        expect(second.reason.length).toBeGreaterThan(0)
    })
})
