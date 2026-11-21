import { describe, expect, test } from 'bun:test'

import { agyTargetOf, checkAgyModel, runAgyStream } from './agy-stream'
import type { TurnProgress } from './turn-progress'

const encoder = new TextEncoder()

const streamFromLines = ({
    lines,
}: {
    lines: string[]
}): ReadableStream<Uint8Array> =>
    new ReadableStream({
        start(controller) {
            for (const line of lines) {
                controller.enqueue(encoder.encode(line))
            }
            controller.close()
        },
    })

const emptyStream = (): ReadableStream<Uint8Array> =>
    new ReadableStream({
        start(controller) {
            controller.close()
        },
    })

describe('agy model check (#779 AC1)', () => {
    test('checkAgyModel accepts /^gemini-/i and refuses non-Gemini models', () => {
        for (const model of [
            'gemini-4-neon-high',
            'gemini-4-argon-high',
            'gemini-3.8-flash-high',
            'GEMINI-3.8-flash-low',
        ]) {
            expect(checkAgyModel({ model })).toBe(true)
        }
        for (const model of [
            'opus',
            'sonnet',
            'haiku',
            'gpt-5',
            'claude',
            '',
        ]) {
            expect(checkAgyModel({ model })).toBe(false)
        }
    })

    test('non-Gemini init.model kills process (SIGTERM -> SIGKILL), cleans up, and returns stop', async () => {
        const signals_a: string[] = []
        let cleaned_a = false
        let resolve_a: ((code: number) => void) | undefined
        const exited_a = new Promise<number>((resolve) => {
            resolve_a = resolve
        })

        const turn_a = await runAgyStream({
            stdout: new ReadableStream({
                start(controller) {
                    controller.enqueue(
                        encoder.encode(
                            `${JSON.stringify({
                                event: 'init',
                                conversation_id: 'conv-stop',
                                init: { model: 'opus' },
                            })}\n`
                        )
                    )
                },
            }),
            stderr: emptyStream(),
            exited: exited_a,
            kill: (signal) => {
                signals_a.push(String(signal))
                if (signal === 'SIGTERM') resolve_a?.(143)
            },
            role: 'implementer',
            worktree: '/repo',
            is_follow_up: false,
            turn_timeout_ms: 500,
            kill_grace_ms: 15,
            cleanup: () => {
                cleaned_a = true
            },
        })

        expect(signals_a).toEqual(['SIGTERM'])
        expect(cleaned_a).toBe(true)
        expect(turn_a).toMatchObject({
            ok: false,
            failure: 'stop',
            session_id: 'conv-stop',
            error: 'Only Gemini models run agy agents: opus',
        })
        expect(turn_a.session?.model).toBe('opus')

        const signals_b: string[] = []
        let cleaned_b = false
        let resolve_b: ((code: number) => void) | undefined
        const exited_b = new Promise<number>((resolve) => {
            resolve_b = resolve
        })

        const turn_b = await runAgyStream({
            stdout: new ReadableStream({
                start(controller) {
                    controller.enqueue(
                        encoder.encode(
                            `${JSON.stringify({
                                event: 'init',
                                init: { model: 'gpt-5' },
                            })}\n`
                        )
                    )
                },
            }),
            stderr: emptyStream(),
            exited: exited_b,
            kill: (signal) => {
                signals_b.push(String(signal))
                if (signal === 'SIGKILL') resolve_b?.(137)
            },
            role: 'implementer',
            worktree: '/repo',
            is_follow_up: false,
            turn_timeout_ms: 500,
            kill_grace_ms: 15,
            cleanup: () => {
                cleaned_b = true
            },
        })

        expect(signals_b).toEqual(['SIGTERM', 'SIGKILL'])
        expect(cleaned_b).toBe(true)
        expect(turn_b).toMatchObject({
            ok: false,
            failure: 'stop',
            error: 'Only Gemini models run agy agents: gpt-5',
        })
    })

    test('nullable init fields do not bypass checkAgyModel and read_denials runs before cleanup', async () => {
        const signals: string[] = []
        const order: string[] = []
        let resolve_exit: ((code: number) => void) | undefined
        const exited = new Promise<number>((resolve) => {
            resolve_exit = resolve
        })

        const turn = await runAgyStream({
            stdout: streamFromLines({
                lines: [
                    `${JSON.stringify({
                        event: 'init',
                        conversation_id: 'c',
                        init: { model: 'opus', permission_mode: null },
                    })}\n`,
                    `${JSON.stringify({
                        event: 'result',
                        result: {
                            conversation_id: 'c',
                            status: 'SUCCESS',
                            structured_output: { ok: true },
                        },
                    })}\n`,
                ],
            }),
            stderr: emptyStream(),
            exited,
            kill: (signal) => {
                signals.push(String(signal))
                if (signal === 'SIGTERM') resolve_exit?.(143)
            },
            role: 'implementer',
            worktree: '/repo',
            is_follow_up: false,
            turn_timeout_ms: 500,
            kill_grace_ms: 15,
            read_denials: () => {
                order.push('read_denials')
                return [{ tool_name: 'run_command', reason: 'Denied' }]
            },
            cleanup: () => {
                order.push('cleanup')
            },
        })

        expect(signals).toEqual(['SIGTERM'])
        expect(order).toEqual(['read_denials', 'cleanup'])
        expect(turn).toMatchObject({
            ok: false,
            failure: 'stop',
            session_id: 'c',
            error: 'Only Gemini models run agy agents: opus',
        })
        expect(turn.session?.guard_denials).toEqual([
            { tool_name: 'run_command', reason: 'Denied' },
        ])

        let killed_on_null = false
        const null_model_turn = await runAgyStream({
            stdout: streamFromLines({
                lines: [
                    `${JSON.stringify({
                        event: 'init',
                        conversation_id: 'c-null',
                        init: { model: null, permission_mode: null },
                    })}\n`,
                    `${JSON.stringify({
                        event: 'result',
                        result: {
                            conversation_id: 'c-null',
                            status: 'SUCCESS',
                            structured_output: { ok: true },
                        },
                    })}\n`,
                ],
            }),
            stderr: emptyStream(),
            exited: Promise.resolve(0),
            kill: () => {
                killed_on_null = true
            },
            role: 'implementer',
            worktree: '/repo',
            is_follow_up: false,
            turn_timeout_ms: 500,
        })
        expect(killed_on_null).toBe(false)
        expect(null_model_turn).toMatchObject({
            ok: true,
            session_id: 'c-null',
        })
        expect(null_model_turn.session?.model).toBeNull()
    })
})

describe('agy NDJSON stream & TurnProgress (#779 AC2)', () => {
    test('ignores blank and non-JSON lines across chunked init, step_update, and result', async () => {
        const init_line = JSON.stringify({
            event: 'init',
            conversation_id: 'conv-chunk',
            init: { model: 'gemini-4-neon-high' },
        })
        const result_line = JSON.stringify({
            event: 'result',
            result: {
                conversation_id: 'conv-chunk',
                status: 'SUCCESS',
                structured_output: { ok: true },
            },
        })
        const split_at = Math.floor(init_line.length / 2)

        const turn = await runAgyStream({
            stdout: streamFromLines({
                lines: [
                    '\n   \n',
                    'non-json debug output\n',
                    init_line.slice(0, split_at),
                    `${init_line.slice(split_at)}\n`,
                    'another non-json line\n',
                    `${result_line}\n`,
                ],
            }),
            stderr: emptyStream(),
            exited: Promise.resolve(0),
            kill: () => {},
            role: 'implementer',
            worktree: '/repo',
            is_follow_up: false,
            turn_timeout_ms: 500,
        })

        expect(turn).toMatchObject({
            ok: true,
            session_id: 'conv-chunk',
            structured_output: { ok: true },
        })
    })

    test('agyTargetOf maps paths, 60-char cap, run_command first 3 words, Query/Pattern, and finish', () => {
        const worktree = '/repo/worktree'
        expect(
            agyTargetOf({
                tool_name: 'view_file',
                parameters: { AbsolutePath: `${worktree}/src/a.ts` },
                worktree,
            })
        ).toBe('src/a.ts')
        expect(
            agyTargetOf({
                tool_name: 'write_to_file',
                parameters: { TargetFile: 'src/b.ts' },
                worktree,
            })
        ).toBe('src/b.ts')
        expect(
            agyTargetOf({
                tool_name: 'read_file',
                parameters: { Path: `${worktree}/src/read.ts` },
                worktree,
            })
        ).toBe('src/read.ts')
        expect(
            agyTargetOf({
                tool_name: 'write_file',
                parameters: {
                    Path: `${worktree}/src/write.ts`,
                    Content: 'export const x = 1\n',
                },
                worktree,
            })
        ).toBe('src/write.ts')
        expect(
            agyTargetOf({
                tool_name: 'edit_file',
                parameters: {
                    Path: 'src/edit.ts',
                    Target: 'old',
                    Replacement: 'new',
                },
                worktree,
            })
        ).toBe('src/edit.ts')
        expect(
            agyTargetOf({
                tool_name: 'read_file',
                parameters: { Path: '/etc/passwd' },
                worktree,
            })
        ).toBe('passwd')
        expect(
            agyTargetOf({
                tool_name: 'view_file',
                parameters: { AbsolutePath: '/etc/hosts' },
                worktree,
            })
        ).toBe('hosts')

        const long_path = `src/${'a'.repeat(80)}.ts`
        expect(
            agyTargetOf({
                tool_name: 'sed_file',
                parameters: { Path: long_path },
                worktree,
            })
        ).toBe(long_path.slice(0, 60))

        expect(
            agyTargetOf({
                tool_name: 'run_command',
                parameters: {
                    CommandLine: '\n  bun test packages/engine --bail\necho ok',
                },
                worktree,
            })
        ).toBe('bun test packages/engine')
        expect(
            agyTargetOf({
                tool_name: 'grep_search',
                parameters: { Query: 'checkAgyModel' },
                worktree,
            })
        ).toBe('checkAgyModel')
        expect(
            agyTargetOf({
                tool_name: 'find_by_name',
                parameters: { Pattern: '*.test.ts' },
                worktree,
            })
        ).toBe('*.test.ts')
        expect(
            agyTargetOf({
                tool_name: 'finish',
                parameters: { AbsolutePath: `${worktree}/ignored.ts` },
                worktree,
            })
        ).toBe('')
    })

    test('step_update tracks open_call lifecycle, preserves action on DONE/ERROR, and deduplicates step tokens', async () => {
        const heard: TurnProgress[] = []
        let tick = 1_700_000_000_000
        const lines = [
            JSON.stringify({
                event: 'init',
                conversation_id: 'conv-prog',
                init: { model: 'gemini-4-argon-high' },
            }),
            JSON.stringify({
                event: 'step_update',
                step_update: {
                    step_index: 1,
                    state: 'ACTIVE',
                    step_type: 'tool',
                    tool_name: 'view_file',
                    tool_info: {
                        name: 'view_file',
                        parameters: { AbsolutePath: '/repo/src/one.ts' },
                    },
                    usage: {
                        input_tokens: 10,
                        output_tokens: 5,
                        thinking_tokens: 2,
                        cache_read_tokens: 3,
                    },
                },
            }),
            JSON.stringify({
                event: 'step_update',
                step_update: {
                    step_index: 2,
                    state: 'ACTIVE',
                    step_type: 'finish',
                },
            }),
            JSON.stringify({
                event: 'step_update',
                step_update: {
                    step_index: 2,
                    state: 'DONE',
                    step_type: 'finish',
                },
            }),
            JSON.stringify({
                event: 'step_update',
                step_update: {
                    step_index: 1,
                    state: 'ERROR',
                    step_type: 'tool',
                    tool_name: 'view_file',
                    usage: {
                        input_tokens: 10,
                        output_tokens: 5,
                        thinking_tokens: 2,
                        cache_read_tokens: 3,
                    },
                },
            }),
            JSON.stringify({
                event: 'step_update',
                step_update: {
                    step_index: 3,
                    state: 'DONE',
                    step_type: 'agent_response',
                    usage: {
                        input_tokens: 6,
                        output_tokens: 4,
                        thinking_tokens: 0,
                        cache_read_tokens: 0,
                    },
                },
            }),
            JSON.stringify({
                event: 'step_update',
                step_update: {
                    step_index: 4,
                    state: 'ACTIVE',
                    step_type: 'tool',
                    tool_name: '',
                    tool_info: {
                        name: 'view_file',
                        parameters: { AbsolutePath: '/repo/src/two.ts' },
                    },
                },
            }),
            JSON.stringify({
                event: 'result',
                result: {
                    conversation_id: 'conv-prog',
                    status: 'SUCCESS',
                    structured_output: { done: true },
                },
            }),
        ].map((line) => `${line}\n`)

        await runAgyStream({
            stdout: streamFromLines({ lines }),
            stderr: emptyStream(),
            exited: Promise.resolve(0),
            kill: () => {},
            role: 'implementer',
            worktree: '/repo',
            is_follow_up: false,
            turn_timeout_ms: 500,
            now: () => {
                tick += 1000
                return tick
            },
            on_progress: (progress) => {
                heard.push(structuredClone(progress))
            },
        })

        expect(heard).toHaveLength(6)
        expect(heard[0]).toMatchObject({
            tokens: 20,
            action: { tool: 'view_file', target: 'src/one.ts' },
            open_call: { tool: 'view_file', target: 'src/one.ts' },
        })
        expect(heard[1]).toMatchObject({
            tokens: 20,
            action: { tool: 'finish', target: '' },
            open_call: { tool: 'finish', target: '' },
        })
        expect(heard[2]).toMatchObject({
            tokens: 20,
            action: heard[1]?.action,
            open_call: { tool: 'view_file', target: 'src/one.ts' },
        })
        expect(heard[3]).toMatchObject({
            tokens: 20,
            action: heard[1]?.action,
            open_call: null,
        })
        expect(heard[4]).toMatchObject({
            tokens: 30,
            open_call: null,
        })
        expect(heard[5]).toMatchObject({
            tokens: 30,
            action: { tool: 'view_file', target: 'src/two.ts' },
            open_call: { tool: 'view_file', target: 'src/two.ts' },
        })
    })
})
