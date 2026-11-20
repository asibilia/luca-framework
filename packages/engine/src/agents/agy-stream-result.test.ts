import { describe, expect, test } from 'bun:test'

import { parseDenialsJsonl, runAgyStream } from './agy-stream'

const encoder = new TextEncoder()

const streamOf = ({ text }: { text: string }): ReadableStream<Uint8Array> =>
    new ReadableStream({
        start(controller) {
            if (text !== '') controller.enqueue(encoder.encode(text))
            controller.close()
        },
    })

describe('AgentSession summarization (#779 AC3)', () => {
    test('summarizes static fields, thinking/cache token math, model_usage, and duration with fallback', async () => {
        const turn = await runAgyStream({
            stdout: streamOf({
                text: [
                    JSON.stringify({
                        event: 'init',
                        conversation_id: 'conv-sum',
                        init: { model: 'gemini-4-neon-high' },
                    }),
                    JSON.stringify({
                        event: 'result',
                        result: {
                            conversation_id: 'conv-sum',
                            status: 'SUCCESS',
                            duration_seconds: 7.756,
                            num_turns: 3,
                            structured_output: { ok: true },
                            usage: {
                                input_tokens: 100,
                                output_tokens: 40,
                                thinking_tokens: 25,
                                cache_read_tokens: 30,
                                total_tokens: 195,
                            },
                        },
                    }),
                ].join('\n'),
            }),
            stderr: streamOf({ text: '' }),
            exited: Promise.resolve(0),
            kill: () => {},
            role: 'implementer',
            worktree: '/repo',
            is_follow_up: false,
            turn_timeout_ms: 500,
        })

        expect(turn.ok).toBe(true)
        expect(turn.session).toEqual({
            session_id: 'conv-sum',
            model: 'gemini-4-neon-high',
            claude_code_version: null,
            api_key_source: 'none',
            subscription_type: 'agy',
            num_turns: 3,
            duration_ms: 7756,
            usage: {
                input_tokens: 100,
                output_tokens: 65,
                cache_read_input_tokens: 30,
                cache_creation_input_tokens: 0,
            },
            model_usage: {
                'gemini-4-neon-high': {
                    input_tokens: 100,
                    output_tokens: 65,
                    cache_read_input_tokens: 30,
                    cache_creation_input_tokens: 0,
                },
            },
            total_cost_usd: 0,
            permission_denials: [],
            guard_denials: [],
            rate_limit_events: [],
            billing_error: false,
            helpers_started: 0,
        })

        let call_count = 0
        const fallback_turn = await runAgyStream({
            stdout: streamOf({
                text: JSON.stringify({
                    event: 'result',
                    result: {
                        conversation_id: 'conv-wall',
                        status: 'SUCCESS',
                        structured_output: {},
                    },
                }),
            }),
            stderr: streamOf({ text: '' }),
            exited: Promise.resolve(0),
            kill: () => {},
            role: 'implementer',
            worktree: '/repo',
            is_follow_up: false,
            turn_timeout_ms: 500,
            now: () => {
                call_count += 1
                return call_count === 1 ? 1000 : 2450
            },
        })

        expect(fallback_turn.session?.duration_ms).toBe(1450)
        expect(fallback_turn.session?.model_usage).toEqual({})
    })

    test('parses JSON-string structured_output with raw fallback and attaches guard_denials', async () => {
        const denials = parseDenialsJsonl({
            text: [
                JSON.stringify({
                    tool_name: 'run_command',
                    reason: 'Blocked by shell guard.',
                }),
                '',
                'not-json',
                JSON.stringify({ wrong: 'shape' }),
            ].join('\n'),
        })
        expect(denials).toEqual([
            { tool_name: 'run_command', reason: 'Blocked by shell guard.' },
        ])

        const valid = await runAgyStream({
            stdout: streamOf({
                text: JSON.stringify({
                    event: 'result',
                    result: {
                        conversation_id: 'conv-json',
                        status: 'SUCCESS',
                        structured_output: '{"approved":true}',
                    },
                }),
            }),
            stderr: streamOf({ text: '' }),
            exited: Promise.resolve(0),
            kill: () => {},
            role: 'ticket-reviewer',
            worktree: '/repo',
            is_follow_up: false,
            turn_timeout_ms: 500,
            read_denials: () => denials,
        })
        expect(valid).toMatchObject({
            ok: true,
            structured_output: { approved: true },
        })
        expect(valid.session?.guard_denials).toEqual(denials)

        const invalid = await runAgyStream({
            stdout: streamOf({
                text: JSON.stringify({
                    event: 'result',
                    result: {
                        conversation_id: 'conv-raw',
                        status: 'SUCCESS',
                        structured_output: '{malformed',
                    },
                }),
            }),
            stderr: streamOf({ text: '' }),
            exited: Promise.resolve(0),
            kill: () => {},
            role: 'ticket-reviewer',
            worktree: '/repo',
            is_follow_up: false,
            turn_timeout_ms: 500,
        })
        expect(invalid).toMatchObject({
            ok: true,
            structured_output: '{malformed',
        })
    })

    test('accepts nullable result and usage fields with wall-clock duration fallback', async () => {
        let tick = 0
        const turn = await runAgyStream({
            stdout: streamOf({
                text: [
                    JSON.stringify({
                        event: 'init',
                        conversation_id: 'conv-nulls',
                        init: {
                            model: 'gemini-4-neon-high',
                            cwd: null,
                            tools: null,
                            permission_mode: null,
                        },
                    }),
                    JSON.stringify({
                        event: 'result',
                        result: {
                            conversation_id: 'conv-nulls',
                            status: 'SUCCESS',
                            response: null,
                            error: null,
                            duration_seconds: null,
                            num_turns: null,
                            structured_output: { ok: true },
                            usage: {
                                input_tokens: 10,
                                output_tokens: 5,
                                thinking_tokens: null,
                                cache_read_tokens: null,
                                total_tokens: null,
                            },
                        },
                    }),
                ].join('\n'),
            }),
            stderr: streamOf({ text: '' }),
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
        })

        expect(turn).toMatchObject({
            ok: true,
            session_id: 'conv-nulls',
            structured_output: { ok: true },
        })
        expect(turn.session).toMatchObject({
            num_turns: 0,
            duration_ms: 1000,
            usage: {
                input_tokens: 10,
                output_tokens: 5,
                cache_read_input_tokens: 0,
                cache_creation_input_tokens: 0,
            },
        })
    })
})

describe('outcome precedence (#779 AC6)', () => {
    test('out-of-turns.flag overrides SUCCESS; SUCCESS with exit 0 and conversation_id succeeds', async () => {
        const success_payload = JSON.stringify({
            event: 'result',
            result: {
                conversation_id: 'conv-ok',
                status: 'SUCCESS',
                structured_output: { done: true },
            },
        })

        const out = await runAgyStream({
            stdout: streamOf({ text: success_payload }),
            stderr: streamOf({ text: '' }),
            exited: Promise.resolve(0),
            kill: () => {},
            role: 'implementer',
            worktree: '/repo',
            is_follow_up: false,
            turn_timeout_ms: 500,
            is_out_of_turns: () => true,
        })
        expect(out).toMatchObject({
            ok: false,
            failure: 'agent',
            out_of_turns: true,
            session_id: 'conv-ok',
            error: 'Reached the turn limit.',
        })

        const ok = await runAgyStream({
            stdout: streamOf({ text: success_payload }),
            stderr: streamOf({ text: '' }),
            exited: Promise.resolve(0),
            kill: () => {},
            role: 'implementer',
            worktree: '/repo',
            is_follow_up: false,
            turn_timeout_ms: 500,
        })
        expect(ok).toMatchObject({
            ok: true,
            session_id: 'conv-ok',
            structured_output: { done: true },
        })
    })

    test('engine failures: missing conversation_id, non-zero exit after SUCCESS, missing result, and session_gone', async () => {
        const missing_id = await runAgyStream({
            stdout: streamOf({
                text: JSON.stringify({
                    event: 'result',
                    result: { status: 'SUCCESS', structured_output: {} },
                }),
            }),
            stderr: streamOf({ text: '' }),
            exited: Promise.resolve(0),
            kill: () => {},
            role: 'implementer',
            worktree: '/repo',
            is_follow_up: true,
            fallback_id: 'conv-fallback',
            turn_timeout_ms: 500,
        })
        expect(missing_id).toMatchObject({
            ok: false,
            failure: 'engine',
            session_id: 'conv-fallback',
            error: 'agy finished without a conversation_id.',
        })

        const nonzero = await runAgyStream({
            stdout: streamOf({
                text: JSON.stringify({
                    event: 'result',
                    result: {
                        conversation_id: 'conv-nz',
                        status: 'SUCCESS',
                        structured_output: {},
                    },
                }),
            }),
            stderr: streamOf({ text: '' }),
            exited: Promise.resolve(2),
            kill: () => {},
            role: 'implementer',
            worktree: '/repo',
            is_follow_up: false,
            turn_timeout_ms: 500,
        })
        expect(nonzero).toMatchObject({
            ok: false,
            failure: 'engine',
            session_id: 'conv-nz',
            error: 'agy exited with code 2 after SUCCESS.',
        })

        const no_result = await runAgyStream({
            stdout: streamOf({ text: '' }),
            stderr: streamOf({ text: 'segfault\n' }),
            exited: Promise.resolve(1),
            kill: () => {},
            role: 'implementer',
            worktree: '/repo',
            is_follow_up: false,
            turn_timeout_ms: 500,
        })
        expect(no_result).toMatchObject({
            ok: false,
            failure: 'engine',
            error: 'agy exited with code 1 without a result event: segfault',
        })

        let cleaned = false
        const gone = await runAgyStream({
            stdout: streamOf({
                text: JSON.stringify({
                    event: 'result',
                    result: {
                        status: 'ERROR',
                        error: 'Unknown conversation conv-gone',
                    },
                }),
            }),
            stderr: streamOf({ text: '' }),
            exited: Promise.resolve(1),
            kill: () => {},
            role: 'implementer',
            worktree: '/repo',
            is_follow_up: true,
            fallback_id: 'conv-gone',
            turn_timeout_ms: 500,
            cleanup: () => {
                cleaned = true
            },
        })
        expect(cleaned).toBe(true)
        expect(gone).toMatchObject({
            ok: false,
            failure: 'engine',
            session_gone: true,
            session_id: 'conv-gone',
        })
    })

    test('non-quota ERROR returns failure agent; timeout kills process, cleans up, and sets session_closed', async () => {
        const err = await runAgyStream({
            stdout: streamOf({
                text: JSON.stringify({
                    event: 'result',
                    result: {
                        conversation_id: 'conv-err',
                        status: 'ERROR',
                        error: 'Tool execution failed',
                    },
                }),
            }),
            stderr: streamOf({ text: '' }),
            exited: Promise.resolve(1),
            kill: () => {},
            role: 'implementer',
            worktree: '/repo',
            is_follow_up: false,
            turn_timeout_ms: 500,
        })
        expect(err).toMatchObject({
            ok: false,
            failure: 'agent',
            session_id: 'conv-err',
            error: 'Tool execution failed',
        })

        const signals: string[] = []
        const order: string[] = []
        let resolve_exit: ((code: number) => void) | undefined
        const exited = new Promise<number>((resolve) => {
            resolve_exit = resolve
        })

        const timed_out = await runAgyStream({
            stdout: new ReadableStream({
                start(controller) {
                    controller.enqueue(
                        encoder.encode(
                            `${JSON.stringify({
                                event: 'init',
                                conversation_id: 'conv-to',
                                init: { model: 'gemini-4-neon-high' },
                            })}\n`
                        )
                    )
                },
            }),
            stderr: new ReadableStream({}),
            exited,
            kill: (signal) => {
                signals.push(String(signal))
                if (signal === 'SIGTERM') resolve_exit?.(143)
            },
            role: 'implementer',
            worktree: '/repo',
            is_follow_up: false,
            turn_timeout_ms: 20,
            kill_grace_ms: 10,
            read_denials: () => {
                order.push('read_denials')
                return [
                    {
                        tool_name: 'run_command',
                        reason: 'Denied before timeout',
                    },
                ]
            },
            cleanup: () => {
                order.push('cleanup')
            },
        })

        expect(signals).toEqual(['SIGTERM'])
        expect(order).toEqual(['read_denials', 'cleanup'])
        expect(timed_out).toMatchObject({
            ok: false,
            failure: 'agent',
            session_closed: true,
            session_id: 'conv-to',
        })
        expect(timed_out.session?.guard_denials).toEqual([
            { tool_name: 'run_command', reason: 'Denied before timeout' },
        ])
        expect(timed_out.ok === false && timed_out.error).toMatch(
            /^The implementer timed out after \d+s\.$/
        )
    })
})
