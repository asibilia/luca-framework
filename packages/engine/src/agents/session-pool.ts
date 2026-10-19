/**
 * The agent sessions the Claude launcher keeps open between turns: the pool
 * of them by session id, a turn on one (`runTurn`), and closing one or all.
 * A success or an agent failure keeps a session open for follow-ups until it
 * sits idle too long; a stop, an engine failure, or a timeout closes it.
 */
import { AgentSessionSchema, type AgentTurn } from './agent-launcher'
import type { Outcome } from './claude-messages'
import { nextOutcome, type OpenSession } from './open-session'

/**
 * Makes the pool of open sessions. A turn gives up after `turn_timeout_ms`;
 * a session left open closes after `idle_timeout_ms` of sitting idle.
 *
 * @example
 * const pool = createSessionPool({ turn_timeout_ms: 40 * 60_000, idle_timeout_ms: 30 * 60_000 })
 * const turn = await pool.runTurn({ open, message, started: Date.now(), fallback_id })
 * await pool.closeAll()
 */
export const createSessionPool = ({
    turn_timeout_ms: timeoutMs,
    idle_timeout_ms: idleMs,
}: {
    turn_timeout_ms: number
    idle_timeout_ms: number
}) => {
    const sessions = new Map<string, OpenSession>()

    const close = async (open: OpenSession): Promise<void> => {
        clearTimeout(open.idle_timer)
        for (const [id, each] of sessions) {
            if (each === open) sessions.delete(id)
        }
        open.input.close()
        open.running.close()
        await Promise.race([open.pump, Bun.sleep(5_000)])
    }

    /** Keeps a session open for follow-ups until it sits idle too long. */
    const keepOpen = (open: OpenSession, session_id: string): void => {
        sessions.set(session_id, open)
        clearTimeout(open.idle_timer)
        open.idle_timer = setTimeout(() => void close(open), idleMs)
        open.idle_timer.unref?.()
    }

    /** Resets the summary's per-turn fields; the session's own stay. */
    const startTurn = (open: OpenSession): void => {
        clearTimeout(open.idle_timer)
        const fresh = AgentSessionSchema.parse({})
        open.summary = {
            ...fresh,
            session_id: open.summary.session_id,
            model: open.summary.model,
            claude_code_version: open.summary.claude_code_version,
            api_key_source: open.summary.api_key_source,
            subscription_type: open.summary.subscription_type,
        }
    }

    /**
     * Sends one message and waits for the turn's outcome. A success or an
     * agent failure keeps the session open for follow-ups; a stop, an
     * engine failure, or a timeout closes it.
     */
    const runTurn = async ({
        open,
        message,
        started,
        fallback_id,
    }: {
        open: OpenSession
        message: string
        started: number
        /** The id to report if the session never named itself. */
        fallback_id: string
    }): Promise<AgentTurn> => {
        const waiting = nextOutcome(open)
        open.input.push({
            type: 'user',
            message: { role: 'user', content: message },
            parent_tool_use_id: null,
        })
        let timer: ReturnType<typeof setTimeout> | undefined
        const timedOut = new Promise<'timeout'>((resolve) => {
            timer = setTimeout(() => resolve('timeout'), timeoutMs)
        })
        const raced = await Promise.race([waiting, timedOut])
        clearTimeout(timer)
        const outcome: Outcome =
            raced === 'timeout'
                ? {
                      ok: false,
                      failure: 'agent',
                      error: `No result within ${timeoutMs} ms; the agent was interrupted.`,
                  }
                : raced
        if (raced === 'timeout') {
            await open.running.interrupt().catch(() => undefined)
        }
        const session_id = open.summary.session_id ?? fallback_id
        const session = {
            ...open.summary,
            duration_ms: Date.now() - started,
        }
        const keep =
            raced !== 'timeout' &&
            open.ended === null &&
            open.summary.session_id !== null
        if (keep) keepOpen(open, session_id)
        else await close(open)
        return { ...outcome, session_id, session }
    }

    /** Closes every session still open. */
    const closeAll = async (): Promise<void> => {
        await Promise.all([...new Set(sessions.values())].map(close))
    }

    return { sessions, close, startTurn, runTurn, closeAll }
}

/** The pool `createSessionPool` makes. */
export type SessionPool = ReturnType<typeof createSessionPool>
