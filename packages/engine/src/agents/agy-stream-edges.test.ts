import { describe, expect, test } from 'bun:test'

import { runAgyStream } from './agy-stream'
import type { TurnProgress } from './turn-progress'

const encoder = new TextEncoder()

const streamOf = ({ text }: { text: string }): ReadableStream<Uint8Array> =>
    new ReadableStream({
        start(controller) {
            if (text !== '') controller.enqueue(encoder.encode(text))
            controller.close()
        },
    })

const chunkStream = ({
    chunks,
}: {
    chunks: Uint8Array[]
}): ReadableStream<Uint8Array> =>
    new ReadableStream({
        start(controller) {
            for (const chunk of chunks) controller.enqueue(chunk)
            controller.close()
        },
    })

const failingStream = ({
    message,
}: {
    message: string
}): ReadableStream<Uint8Array> =>
    new ReadableStream({
        pull() {
            throw new Error(message)
        },
    })

describe('agy-stream Bug 1: on_progress errors and stream read errors', () => {
    test('throwing on_progress does not abort stdout stream or drop result', async () => {
        const lines = [
            JSON.stringify({
                event: 'init',
                conversation_id: 'conv-prog-err',
                init: { model: 'gemini-4-neon-high' },
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
                        parameters: { AbsolutePath: '/repo/src/a.ts' },
                    },
                },
            }),
            JSON.stringify({
                event: 'result',
                result: {
                    conversation_id: 'conv-prog-err',
                    status: 'SUCCESS',
                    structured_output: { ok: true },
                },
            }),
        ]
        const turn = await runAgyStream({
            stdout: streamOf({ text: `${lines.join('\n')}\n` }),
            stderr: streamOf({ text: '' }),
            exited: Promise.resolve(0),
            kill: () => {},
            role: 'implementer',
            worktree: '/repo',
            is_follow_up: false,
            turn_timeout_ms: 500,
            on_progress: () => {
                throw new Error('disk full writing live.json')
            },
        })

        expect(turn).toMatchObject({
            ok: true,
            session_id: 'conv-prog-err',
            structured_output: { ok: true },
        })
    })

    test('stdout and stderr read errors surface engine failure and invoke cleanup', async () => {
        let cleaned_stdout = false
        const out_err = await runAgyStream({
            stdout: failingStream({ message: 'broken stdout pipe' }),
            stderr: streamOf({ text: 'partial stderr\n' }),
            exited: Promise.resolve(0),
            kill: () => {},
            role: 'implementer',
            worktree: '/repo',
            is_follow_up: false,
            turn_timeout_ms: 500,
            cleanup: () => {
                cleaned_stdout = true
            },
        })
        expect(cleaned_stdout).toBe(true)
        expect(out_err).toMatchObject({
            ok: false,
            failure: 'engine',
        })
        expect(out_err.ok === false && out_err.error).toContain(
            'The agent session failed: broken stdout pipe'
        )

        let cleaned_stderr = false
        const err_err = await runAgyStream({
            stdout: streamOf({
                text: `${JSON.stringify({
                    event: 'init',
                    conversation_id: 'conv-se',
                    init: { model: 'gemini-4-neon-high' },
                })}\n`,
            }),
            stderr: failingStream({ message: 'broken stderr pipe' }),
            exited: Promise.resolve(0),
            kill: () => {},
            role: 'implementer',
            worktree: '/repo',
            is_follow_up: false,
            turn_timeout_ms: 500,
            cleanup: () => {
                cleaned_stderr = true
            },
        })
        expect(cleaned_stderr).toBe(true)
        expect(err_err).toMatchObject({
            ok: false,
            failure: 'engine',
            session_id: 'conv-se',
            error: 'The agent session failed: broken stderr pipe',
        })
    })
})

describe('agy-stream outcome precedence and stderr boundaries (M2-1..M2-3)', () => {
    test('out_of_turns overrides ERROR+quota and crash+quota without recording agy_quota', async () => {
        const error_turn = await runAgyStream({
            stdout: streamOf({
                text: JSON.stringify({
                    event: 'result',
                    result: {
                        conversation_id: 'conv-oot-q',
                        status: 'ERROR',
                        error: 'RESOURCE_EXHAUSTED: quota reached. Resets in 5m',
                    },
                }),
            }),
            stderr: streamOf({ text: 'HTTP 429 quota exceeded\n' }),
            exited: Promise.resolve(1),
            kill: () => {},
            role: 'implementer',
            worktree: '/repo',
            is_follow_up: false,
            turn_timeout_ms: 500,
            is_out_of_turns: () => true,
        })

        expect(error_turn).toMatchObject({
            ok: false,
            failure: 'agent',
            out_of_turns: true,
            session_id: 'conv-oot-q',
            error: 'Reached the turn limit.',
        })
        expect(error_turn.session?.rate_limit_events).toEqual([])

        const crash_turn = await runAgyStream({
            stdout: streamOf({ text: '' }),
            stderr: streamOf({
                text: 'RESOURCE_EXHAUSTED: Resets in 5m\n',
            }),
            exited: Promise.resolve(1),
            kill: () => {},
            role: 'implementer',
            worktree: '/repo',
            is_follow_up: false,
            turn_timeout_ms: 500,
            is_out_of_turns: () => true,
        })

        expect(crash_turn).toMatchObject({
            ok: false,
            failure: 'agent',
            out_of_turns: true,
            error: 'Reached the turn limit.',
        })
        expect(crash_turn.session?.rate_limit_events).toEqual([])
    })

    test('is_follow_up: false ignores SESSION_GONE_RE and empty/null ERROR falls back cleanly', async () => {
        let cleaned = false
        const non_follow_up = await runAgyStream({
            stdout: streamOf({
                text: JSON.stringify({
                    event: 'result',
                    result: {
                        conversation_id: 'conv-nf',
                        status: 'ERROR',
                        error: 'conversation not found',
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
            cleanup: () => {
                cleaned = true
            },
        })

        expect(cleaned).toBe(false)
        expect(non_follow_up).toMatchObject({
            ok: false,
            failure: 'agent',
            session_id: 'conv-nf',
            error: 'conversation not found',
        })
        expect(non_follow_up).not.toHaveProperty('session_gone')

        for (const empty_err of ['', null, undefined]) {
            const turn = await runAgyStream({
                stdout: streamOf({
                    text: JSON.stringify({
                        event: 'result',
                        result: {
                            conversation_id: 'conv-empty-err',
                            status: 'ERROR',
                            ...(empty_err === undefined
                                ? {}
                                : { error: empty_err }),
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
            expect(turn).toMatchObject({
                ok: false,
                failure: 'agent',
                error: 'agy returned ERROR.',
            })
        }
    })

    test('exit without result formats empty stderr cleanly and preserves 8192-byte stderr tail', async () => {
        const empty_stderr = await runAgyStream({
            stdout: streamOf({ text: '' }),
            stderr: streamOf({ text: '   \n  ' }),
            exited: Promise.resolve(7),
            kill: () => {},
            role: 'implementer',
            worktree: '/repo',
            is_follow_up: false,
            turn_timeout_ms: 500,
        })
        expect(empty_stderr).toMatchObject({
            ok: false,
            failure: 'engine',
            error: 'agy exited with code 7 without a result event.',
        })

        const now_ms = 1_700_000_000_000
        const prefix_only_quota = `RESOURCE_EXHAUSTED: ${'a'.repeat(8500)}`
        const trimmed_head = await runAgyStream({
            stdout: streamOf({ text: '' }),
            stderr: streamOf({ text: prefix_only_quota }),
            exited: Promise.resolve(1),
            kill: () => {},
            role: 'implementer',
            worktree: '/repo',
            is_follow_up: false,
            turn_timeout_ms: 500,
            now: () => now_ms,
        })
        expect(trimmed_head).toMatchObject({
            ok: false,
            failure: 'engine',
            error: `agy exited with code 1 without a result event: ${'a'.repeat(8192)}`,
        })
        expect(trimmed_head.session?.rate_limit_events).toEqual([])

        const tail_quota = `${'x'.repeat(9000)}quota exceeded. Resets in 10m`
        const kept_tail = await runAgyStream({
            stdout: streamOf({ text: '' }),
            stderr: streamOf({ text: tail_quota }),
            exited: Promise.resolve(1),
            kill: () => {},
            role: 'implementer',
            worktree: '/repo',
            is_follow_up: false,
            turn_timeout_ms: 500,
            now: () => now_ms,
        })
        expect(kept_tail).toMatchObject({
            ok: false,
            failure: 'plan',
        })
        expect(kept_tail.session?.rate_limit_events).toEqual([
            {
                status: 'rejected',
                rateLimitType: 'agy_quota',
                resetsAt: 1_700_000_000 + 600,
                arrived_at: new Date(now_ms).toISOString(),
            },
        ])
    })
})

describe('agy-stream NDJSON, UTF-8, SIGKILL, timeout, duration, and heartbeat edges (M2-4)', () => {
    test('decodes split 4-byte UTF-8 across chunks, CRLF lines, duration_seconds: 0, and user_input/system_message gating', async () => {
        const result_payload = JSON.stringify({
            event: 'result',
            result: {
                conversation_id: 'conv-utf8',
                status: 'SUCCESS',
                duration_seconds: 0,
                structured_output: { tag: '🔥' },
            },
        })
        const bytes = encoder.encode(`${result_payload}\r\n`)
        const fire_index = bytes.indexOf(0xf0)
        expect(fire_index).toBeGreaterThan(-1)

        const init_line = JSON.stringify({
            event: 'init',
            conversation_id: 'conv-utf8',
            init: { model: 'gemini-4-neon-high' },
        })
        const user_no_usage = JSON.stringify({
            event: 'step_update',
            step_update: {
                step_index: 1,
                state: 'DONE',
                step_type: 'user_input',
            },
        })
        const sys_no_usage = JSON.stringify({
            event: 'step_update',
            step_update: {
                step_index: 2,
                state: 'DONE',
                step_type: 'system_message',
            },
        })
        const user_with_usage = JSON.stringify({
            event: 'step_update',
            step_update: {
                step_index: 3,
                state: 'DONE',
                step_type: 'user_input',
                usage: {
                    input_tokens: 4,
                    output_tokens: 6,
                    thinking_tokens: 0,
                    cache_read_tokens: 0,
                },
            },
        })

        const heard: TurnProgress[] = []
        let tick = 1_700_000_000_000
        const turn = await runAgyStream({
            stdout: chunkStream({
                chunks: [
                    encoder.encode(
                        `${init_line}\r\n${user_no_usage}\r\n${sys_no_usage}\r\n${user_with_usage}\r\n`
                    ),
                    bytes.slice(0, fire_index + 2),
                    bytes.slice(fire_index + 2),
                ],
            }),
            stderr: streamOf({ text: '' }),
            exited: Promise.resolve(0),
            kill: () => {},
            role: 'implementer',
            worktree: '/repo',
            is_follow_up: false,
            turn_timeout_ms: 500,
            now: () => {
                tick += 500
                return tick
            },
            on_progress: (progress) => heard.push(structuredClone(progress)),
        })

        expect(turn).toMatchObject({
            ok: true,
            session_id: 'conv-utf8',
            structured_output: { tag: '🔥' },
        })
        expect(turn.session?.duration_ms).toBe(0)
        expect(heard).toEqual([
            {
                tokens: 10,
                action: null,
                open_call: null,
                rate_limit_events: [],
            },
        ])
    })

    test('detects bad_model on EOF without trailing newline and handles 200ms SIGKILL fallback and timeout fallback_id', async () => {
        const bad_signals: string[] = []
        const hung_exit = new Promise<number>(() => {})
        const bad_turn = await runAgyStream({
            stdout: streamOf({
                text: JSON.stringify({
                    event: 'init',
                    conversation_id: 'conv-eof',
                    init: { model: 'claude-opus-4-5' },
                }),
            }),
            stderr: streamOf({ text: '' }),
            exited: hung_exit,
            kill: (signal) => bad_signals.push(String(signal)),
            role: 'implementer',
            worktree: '/repo',
            is_follow_up: false,
            turn_timeout_ms: 1000,
            kill_grace_ms: 10,
        })

        expect(bad_signals).toEqual(['SIGTERM', 'SIGKILL'])
        expect(bad_turn).toMatchObject({
            ok: false,
            failure: 'stop',
            session_id: 'conv-eof',
            error: 'Only Gemini models run agy agents: claude-opus-4-5',
        })

        let resolve_to: ((code: number) => void) | undefined
        const to_exit = new Promise<number>((resolve) => {
            resolve_to = resolve
        })
        const timeout_turn = await runAgyStream({
            stdout: new ReadableStream({}),
            stderr: new ReadableStream({}),
            exited: to_exit,
            kill: (signal) => {
                if (signal === 'SIGTERM') resolve_to?.(143)
            },
            role: 'implementer',
            worktree: '/repo',
            is_follow_up: true,
            fallback_id: 'conv-fallback-to',
            turn_timeout_ms: 15,
            kill_grace_ms: 10,
        })
        expect(timeout_turn).toMatchObject({
            ok: false,
            failure: 'agent',
            session_id: 'conv-fallback-to',
            session_closed: true,
        })
    })
})
