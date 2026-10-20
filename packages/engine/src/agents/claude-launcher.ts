import {
    query as sdkQuery,
    type EffortLevel,
} from '@anthropic-ai/claude-agent-sdk'

import type { AgentLauncher } from './agent-launcher'
import { AGENT_EFFORT } from './claude-options'
import { createLaunch, type AgentQuery } from './launch-session'
import { createSessionPool } from './session-pool'

export type { AgentQuery } from './launch-session'
export type { AgentQuerySession } from './open-session'

/** A turn gives up after this long unless told otherwise: 40 minutes. */
export const DEFAULT_TURN_TIMEOUT_MS = 40 * 60_000

/**
 * A session left open for follow-ups closes after sitting idle this long
 * unless told otherwise: 30 minutes.
 */
export const DEFAULT_IDLE_TIMEOUT_MS = 30 * 60_000

/**
 * The real agent launcher: one Claude Agent SDK session per agent, with
 * every guard on. Per launch it:
 *
 * 1. refuses any model but `opus`, `sonnet` or `haiku` before starting
 *    anything; follow-ups stay on their session's model;
 * 2. builds the role's locked-down options (`agentOptions`) with the guard
 *    hook (honoring `may_edit_tests`), the sandbox, and a clean environment;
 *    with `messaging` (test-writers and implementers), the `luca` server's
 *    `send_message` tool and the hook that hands over messages after each
 *    tool call;
 * 3. checks `accountInfo()` for a Claude plan and no API key BEFORE the
 *    prompt is sent;
 * 4. watches the messages: an unsafe init (API key, wrong model, foreign
 *    MCP) stops the run; a rejected rate limit, overage, or a billing error
 *    cuts the turn off as `plan`, with the reason in its session, for the
 *    decision step to turn into a limit wait or a billing stop;
 * 5. returns the result's structured output and the session's id (from its
 *    init message);
 * 6. tells the turn's `on_progress`, if given, what the agent is doing as it
 *    happens: its tokens so far, its latest action, the tool call still
 *    open, and its plan-usage readings (`turn-progress.ts`, #628).
 *
 * The session stays open after its turn, in streaming-input mode, so
 * `followUp` can send it another message; the same watch applies to every
 * turn. A stop, a plan cut-off, an engine failure, or a timeout closes the session, and so
 * does sitting idle past `idle_timeout_ms`. `closeSession` closes one
 * session once the engine is done with it; `closeAll` closes every session
 * still open; call it when the run ends.
 *
 * `query` and `claude_path` are for tests; they default to the SDK's
 * `query` and the real path of the `claude` on PATH.
 *
 * @example
 * const launcher = createClaudeLauncher({})
 * const turn = await launcher.launch({ role: 'implementer', ticket: 11, prompt, cwd, may_edit_tests: false, config, messaging, model: 'opus' })
 * // ... later, in a fix loop:
 * if (turn.ok) await launcher.followUp({ session_id: turn.session_id, role: 'implementer', ticket: 11, message, cwd, config })
 * await launcher.closeAll()
 */
export const createClaudeLauncher = ({
    effort,
    query,
    claude_path,
    turn_timeout_ms,
    idle_timeout_ms,
}: {
    /** Defaults to `AGENT_EFFORT`, the same for every role. */
    effort?: EffortLevel
    query?: AgentQuery
    claude_path?: string
    /** Defaults to `DEFAULT_TURN_TIMEOUT_MS`. */
    turn_timeout_ms?: number
    /** Defaults to `DEFAULT_IDLE_TIMEOUT_MS`. */
    idle_timeout_ms?: number
}): AgentLauncher & { closeAll: () => Promise<void> } => {
    const useEffort = effort ?? AGENT_EFFORT
    const startQuery: AgentQuery = query ?? sdkQuery
    const timeoutMs = turn_timeout_ms ?? DEFAULT_TURN_TIMEOUT_MS
    const idleMs = idle_timeout_ms ?? DEFAULT_IDLE_TIMEOUT_MS
    const pool = createSessionPool({
        turn_timeout_ms: timeoutMs,
        idle_timeout_ms: idleMs,
    })
    const { sessions, close, startTurn, runTurn, closeAll } = pool
    const launch = createLaunch({
        effort: useEffort,
        start_query: startQuery,
        claude_path,
        turn_timeout_ms: timeoutMs,
        pool,
    })

    const followUp: AgentLauncher['followUp'] = async ({
        session_id,
        role,
        ticket,
        message,
        on_progress,
    }) => {
        const open = sessions.get(session_id)
        if (open === undefined || open.ended !== null) {
            if (open !== undefined) await close(open)
            return {
                ok: false,
                failure: 'engine',
                session_id,
                session_gone: true,
                error: `No open agent session ${session_id}: it closed or never started.`,
            }
        }
        if (open.role !== role || open.ticket !== ticket) {
            return {
                ok: false,
                failure: 'engine',
                session_id,
                error: `Session ${session_id} belongs to the ${open.role} on #${open.ticket}, not the ${role} on #${ticket}.`,
            }
        }
        startTurn(open)
        open.progress.start(on_progress)
        return runTurn({
            open,
            message,
            started: Date.now(),
            fallback_id: session_id,
        })
    }

    const closeSession: AgentLauncher['closeSession'] = async ({
        session_id,
    }) => {
        const open = sessions.get(session_id)
        if (open !== undefined) await close(open)
    }

    return { launch, followUp, closeSession, closeAll }
}
