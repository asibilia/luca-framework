/**
 * Antigravity (`agy`) NDJSON stream parser, live progress tracker, session
 * summary builder, and quota/outcome classifier (#779).
 */
import type { AgentTurn, LauncherFailure } from './agent-launcher'
import {
    AgyDenialSchema,
    AgyInitEventSchema,
    AgyResultEventSchema,
    AgyStepUpdateEventSchema,
    AgyUsageSchema,
    agyTargetOf,
    checkAgyModel,
    nonEmpty,
    parseAgyQuotaReset,
    parseDenialsJsonl,
    parseStructuredOutput,
    processStreamLine,
    summarizeAgySession,
    type AgyDenial,
    type AgyInitEvent,
    type AgyResultEvent,
    type AgyStepUpdateEvent,
    type AgyStreamState,
    type AgyUsage,
} from './agy-stream-events'
import type { AgentRole } from './role-results'
import type { ProgressListener } from './turn-progress'

export {
    AgyDenialSchema,
    AgyInitEventSchema,
    AgyResultEventSchema,
    AgyStepUpdateEventSchema,
    AgyUsageSchema,
    agyTargetOf,
    checkAgyModel,
    nonEmpty,
    parseAgyQuotaReset,
    parseDenialsJsonl,
    type AgyDenial,
    type AgyInitEvent,
    type AgyResultEvent,
    type AgyStepUpdateEvent,
    type AgyUsage,
}

const DEFAULT_KILL_GRACE_MS = 2000
const MAX_STDERR_TAIL = 8192

/**
 * A quota or rate-limit failure as the Gemini API and the `agy` CLI phrase
 * it: the `RESOURCE_EXHAUSTED` status, a quota that is exceeded, exhausted
 * or reached, a rate limit exceeded, or HTTP status 429 in an API-error
 * shape (`HTTP 429`, `status 429`, `code: 429`, `429 Too Many Requests`).
 * A bare "quota" or "429" (a task about a quota handler, a test expecting
 * 429) is not one (#777).
 */
export const QUOTA_ERROR_RE =
    /\bRESOURCE_EXHAUSTED\b|quota\b[^\n]{0,40}?\b(?:exceeded|exhausted|reached)\b|\brate[ _-]?limit(?:ed)?\b[^\n]{0,20}?\bexceeded\b|\b(?:HTTP(?:\/[\d.]+)?|status(?:[ _]code)?|code)["']?\s*[:=]?\s*429\b|\b429\s+Too Many Requests\b/i

const SESSION_GONE_RE =
    /conversation.*not found|unknown conversation|no such conversation/i

const terminateProcess = async ({
    kill,
    exited,
    grace_ms,
}: {
    kill: (signal?: number | NodeJS.Signals) => void
    exited: Promise<number>
    grace_ms: number
}): Promise<number | null> => {
    try {
        kill('SIGTERM')
    } catch {
        // Already exited.
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    const settled = await Promise.race([
        exited.then((code) => ({ done: true as const, code })),
        new Promise<{ done: false }>((resolve) => {
            timer = setTimeout(() => resolve({ done: false }), grace_ms)
        }),
    ])
    if (timer !== undefined) clearTimeout(timer)
    if (settled.done) return settled.code

    try {
        kill('SIGKILL')
    } catch {
        // Already exited.
    }
    let kill_timer: ReturnType<typeof setTimeout> | undefined
    const killed = await Promise.race([
        exited.then((code) => code),
        new Promise<null>((resolve) => {
            kill_timer = setTimeout(() => resolve(null), 200)
        }),
    ])
    if (kill_timer !== undefined) clearTimeout(kill_timer)
    return killed
}

type ByteReader = {
    read: () => Promise<{ done: boolean; value?: Uint8Array }>
    cancel: () => Promise<void>
    releaseLock: () => void
}

const errorText = (error: unknown): string =>
    error instanceof Error ? error.message : String(error)

const readChunks = async ({
    reader,
    state,
    on_text,
}: {
    reader: ByteReader
    state: AgyStreamState
    on_text: (args: {
        chunk: string
        final: boolean
    }) => { bad_model: string } | null
}): Promise<
    | { kind: 'eof' }
    | { kind: 'bad_model'; model: string }
    | { kind: 'error'; error: string }
> => {
    const dec = new TextDecoder()
    try {
        while (!state.aborted) {
            const { done, value } = await reader.read()
            if (done) break
            const out = on_text({
                chunk: dec.decode(value, { stream: true }),
                final: false,
            })
            if (out !== null) return { kind: 'bad_model', model: out.bad_model }
        }
        const out = on_text({ chunk: dec.decode(), final: true })
        return out !== null
            ? { kind: 'bad_model', model: out.bad_model }
            : { kind: 'eof' }
    } catch (error) {
        return state.aborted
            ? { kind: 'eof' }
            : { kind: 'error', error: errorText(error) }
    } finally {
        reader.releaseLock()
    }
}

export type RunAgyStreamParams = {
    stdout: ReadableStream<Uint8Array>
    stderr: ReadableStream<Uint8Array>
    exited: Promise<number>
    kill: (signal?: number | NodeJS.Signals) => void
    role: AgentRole
    worktree: string
    is_follow_up: boolean
    fallback_id?: string
    turn_timeout_ms: number
    kill_grace_ms?: number
    on_progress?: ProgressListener
    read_denials?: () => AgyDenial[] | Promise<AgyDenial[]>
    is_out_of_turns?: () => boolean | Promise<boolean>
    cleanup?: () => void | Promise<void>
    now?: () => number
}

/**
 * Consumes one spawned `agy` turn's NDJSON `stdout` and diagnostic `stderr`,
 * emits live `TurnProgress`, enforces `turn_timeout_ms` and Gemini model
 * checks, summarizes `AgentSession`, and classifies the turn outcome.
 */
export const runAgyStream = async ({
    stdout,
    stderr,
    exited,
    kill,
    role,
    worktree,
    is_follow_up,
    fallback_id,
    turn_timeout_ms,
    kill_grace_ms = DEFAULT_KILL_GRACE_MS,
    on_progress,
    read_denials,
    is_out_of_turns,
    cleanup,
    now = () => Date.now(),
}: RunAgyStreamParams): Promise<AgentTurn> => {
    const started_ms = now()
    const state: AgyStreamState = {
        model: null,
        init_conversation_id: null,
        result_event: null,
        stderr_buf: '',
        aborted: false,
        action: null,
        step_tokens: new Map(),
        open_calls: new Map(),
        rate_limit_events: [],
    }
    const stdout_reader: ByteReader = stdout.getReader()
    const stderr_reader: ByteReader = stderr.getReader()
    const stderr_promise = readChunks({
        reader: stderr_reader,
        state,
        on_text: ({ chunk }) => {
            state.stderr_buf = (state.stderr_buf + chunk).slice(
                -MAX_STDERR_TAIL
            )
            return null
        },
    })
    let line_buf = ''
    const onLine = (line: string) =>
        processStreamLine({ line, state, worktree, now, on_progress })
    const work_promise = (async (): Promise<
        | { kind: 'bad_model'; model: string }
        | { kind: 'stream_error'; error: string }
        | { kind: 'done'; exit_code: number }
    > => {
        const out = await readChunks({
            reader: stdout_reader,
            state,
            on_text: ({ chunk, final }) => {
                line_buf += chunk
                if (!final) {
                    const parts = line_buf.split('\n')
                    line_buf = parts.pop() ?? ''
                    for (const part of parts) {
                        const hit = onLine(part)
                        if (hit !== null) return hit
                    }
                    return null
                }
                return line_buf !== '' ? onLine(line_buf) : null
            },
        })
        if (out.kind === 'bad_model') return out
        if (out.kind === 'error') {
            return { kind: 'stream_error', error: out.error }
        }
        const [stderr_out, exit_code] = await Promise.all([
            stderr_promise,
            exited,
        ])
        if (stderr_out.kind === 'error') {
            return { kind: 'stream_error', error: stderr_out.error }
        }
        return { kind: 'done', exit_code }
    })()

    let turn_timer: ReturnType<typeof setTimeout> | undefined
    const timeout_promise = new Promise<{ kind: 'timeout' }>((resolve) => {
        turn_timer = setTimeout(
            () => resolve({ kind: 'timeout' }),
            turn_timeout_ms
        )
    })
    const race = await Promise.race([work_promise, timeout_promise])
    if (turn_timer !== undefined) clearTimeout(turn_timer)

    const summarize = async () =>
        summarizeAgySession({
            state,
            started_ms,
            now_ms: now(),
            fallback_id,
            guard_denials: (await read_denials?.()) ?? [],
        })

    if (
        race.kind === 'timeout' ||
        race.kind === 'bad_model' ||
        race.kind === 'stream_error'
    ) {
        state.aborted = true
        void stdout_reader.cancel().catch(() => {})
        void stderr_reader.cancel().catch(() => {})
        await terminateProcess({ kill, exited, grace_ms: kill_grace_ms })
        const { session, session_id } = await summarize()
        await cleanup?.()
        const stderr_tail = state.stderr_buf.trim()
        const msg =
            race.kind === 'timeout'
                ? `The ${role} timed out after ${Math.round(turn_timeout_ms / 1000)}s.`
                : race.kind === 'bad_model'
                  ? `Only Gemini models run agy agents: ${race.model}`
                  : stderr_tail === ''
                    ? `The agent session failed: ${race.error}`
                    : `The agent session failed: ${race.error}\n${stderr_tail}`
        const failure: LauncherFailure =
            race.kind === 'timeout'
                ? 'agent'
                : race.kind === 'bad_model'
                  ? 'stop'
                  : 'engine'
        return {
            ok: false,
            failure,
            error: msg,
            ...(session_id !== null ? { session_id } : {}),
            session,
            ...(race.kind === 'timeout' ? { session_closed: true } : {}),
        }
    }

    const { exit_code } = race
    const out_of_turns = (await is_out_of_turns?.()) ?? false
    const res = state.result_event
    const stderr_text = state.stderr_buf.trim()
    const error_text =
        res?.status === 'ERROR'
            ? [res.error ?? '', stderr_text].filter((p) => p !== '').join('\n')
            : res === null
              ? stderr_text
              : ''
    const is_quota =
        !out_of_turns &&
        res?.status !== 'SUCCESS' &&
        QUOTA_ERROR_RE.test(error_text)
    if (is_quota) {
        const current_ms = now()
        const resets_at = parseAgyQuotaReset({
            text: error_text,
            now_ms: current_ms,
        })
        state.rate_limit_events.push({
            status: 'rejected',
            rateLimitType: 'agy_quota',
            ...(resets_at !== null ? { resetsAt: resets_at } : {}),
            arrived_at: new Date(current_ms).toISOString(),
        })
    }

    const { session, session_id, real_id } = await summarize()
    const fail = ({
        failure,
        error,
        extra,
        id = session_id,
    }: {
        failure: LauncherFailure
        error: string
        extra?: { out_of_turns?: boolean; session_gone?: boolean }
        id?: string | null
    }): AgentTurn => ({
        ok: false,
        failure,
        error,
        ...(id !== null ? { session_id: id } : {}),
        session,
        ...extra,
    })

    if (out_of_turns) {
        return fail({
            failure: 'agent',
            error: 'Reached the turn limit.',
            extra: { out_of_turns: true },
        })
    }

    if (res?.status === 'SUCCESS') {
        if (real_id === null) {
            return fail({
                failure: 'engine',
                error: 'agy finished without a conversation_id.',
            })
        }
        if (exit_code !== 0) {
            return fail({
                failure: 'engine',
                error: `agy exited with code ${exit_code} after SUCCESS.`,
                id: real_id,
            })
        }
        return {
            ok: true,
            session_id: real_id,
            structured_output: parseStructuredOutput(res.structured_output),
            session,
        }
    }

    const primary =
        res?.status === 'ERROR'
            ? (nonEmpty(res.error) ?? nonEmpty(stderr_text))
            : nonEmpty(stderr_text)
    if (is_quota) {
        return fail({
            failure: 'plan',
            error: primary ?? 'Antigravity quota exceeded.',
        })
    }
    if (is_follow_up && SESSION_GONE_RE.test(error_text)) {
        await cleanup?.()
        return fail({
            failure: 'engine',
            error: primary ?? 'Conversation not found.',
            extra: { session_gone: true },
        })
    }
    if (res?.status === 'ERROR') {
        return fail({
            failure: 'agent',
            error: nonEmpty(res.error) ?? 'agy returned ERROR.',
        })
    }
    return fail({
        failure: 'engine',
        error: `agy exited with code ${exit_code} without a result event${stderr_text !== '' ? `: ${stderr_text}` : '.'}`,
    })
}
