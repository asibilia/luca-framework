import { randomUUID } from 'node:crypto'
import { realpathSync } from 'node:fs'
import { homedir } from 'node:os'

import {
    query as sdkQuery,
    type EffortLevel,
    type Options,
    type SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk'

import {
    AgentSessionSchema,
    type AgentLauncher,
    type AgentSession,
    type AgentTurn,
} from './agent-launcher'
import {
    AccountSchema,
    accountProblem,
    errorText,
    stop,
    type Outcome,
} from './claude-messages'
import {
    AGENT_EFFORT,
    agentEnv,
    agentOptions,
    CLAUDE_MODEL,
    checkModel,
} from './claude-options'
import { createInputChannel } from './input-channel'
import { commonGitDir, realClaudePath } from './launch-paths'
import { createDeliveryHook, createLucaServer } from './message-tool'
import {
    nextOutcome,
    pumpMessages,
    type AgentQuerySession,
    type OpenSession,
} from './open-session'

import { createGuardHook } from '../guards/guard-hook'
import { guardRoleOf } from '../guards/role-rules'

export type { AgentQuerySession } from './open-session'

/** Starts an SDK session: the SDK's `query`, or a fake in tests. */
export type AgentQuery = (params: {
    prompt: AsyncIterable<SDKUserMessage>
    options: Options
}) => AgentQuerySession

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
 * 1. refuses a Fable or non-Claude model before starting anything;
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
 *    init message).
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
 * const turn = await launcher.launch({ role: 'implementer', ticket: 11, prompt, cwd, may_edit_tests: false, config })
 * // ... later, in a fix loop:
 * if (turn.ok) await launcher.followUp({ session_id: turn.session_id, role: 'implementer', ticket: 11, message, cwd, config })
 * await launcher.closeAll()
 */
export const createClaudeLauncher = ({
    model,
    effort,
    query,
    claude_path,
    turn_timeout_ms,
    idle_timeout_ms,
}: {
    /** Defaults to `CLAUDE_MODEL`, Claude Opus 5.5. */
    model?: string
    /** Defaults to `AGENT_EFFORT`, the same for every role. */
    effort?: EffortLevel
    query?: AgentQuery
    claude_path?: string
    /** Defaults to `DEFAULT_TURN_TIMEOUT_MS`. */
    turn_timeout_ms?: number
    /** Defaults to `DEFAULT_IDLE_TIMEOUT_MS`. */
    idle_timeout_ms?: number
}): AgentLauncher & { closeAll: () => Promise<void> } => {
    const useModel = model ?? CLAUDE_MODEL
    const useEffort = effort ?? AGENT_EFFORT
    const startQuery: AgentQuery = query ?? sdkQuery
    const timeoutMs = turn_timeout_ms ?? DEFAULT_TURN_TIMEOUT_MS
    const idleMs = idle_timeout_ms ?? DEFAULT_IDLE_TIMEOUT_MS
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

    const launch: AgentLauncher['launch'] = async ({
        role,
        ticket,
        prompt,
        cwd,
        may_edit_tests,
        config,
        messaging,
    }) => {
        const refused = checkModel({ model: useModel })
        if (refused !== null) return stop(refused)
        const started = Date.now()
        const fallback_id = `claude-launch-${randomUUID()}`

        let claudePath: string
        try {
            claudePath = claude_path ?? realClaudePath()
        } catch (error) {
            return stop(errorText(error))
        }
        let worktree: string
        let gitDir: string
        try {
            worktree = realpathSync(cwd)
            gitDir = await commonGitDir({ cwd: worktree })
        } catch (error) {
            return { ok: false, failure: 'engine', error: errorText(error) }
        }

        const summary: AgentSession = AgentSessionSchema.parse({})
        const stderr: string[] = []
        const options = agentOptions({
            role,
            may_edit_tests,
            cwd: worktree,
            model: useModel,
            effort: useEffort,
            claude_path: claudePath,
            config,
            common_git_dir: gitDir,
            home: realpathSync(homedir()),
            env: agentEnv({ source: process.env }),
            guard_hook: createGuardHook({
                role: guardRoleOf({ role }),
                may_edit_tests,
                worktree,
                config,
                // The summary is swapped each turn, so this reads it late.
                on_deny: (denial) => open.summary.guard_denials.push(denial),
            }),
            // Kept in the session's options, so its follow-ups have them too.
            luca_server:
                messaging === null ? null : createLucaServer({ messaging }),
            delivery_hook:
                messaging === null ? null : createDeliveryHook({ messaging }),
            stderr: (data) => {
                stderr.push(data)
                if (stderr.length > 50) stderr.shift()
            },
        })

        const input = createInputChannel()
        let running: AgentQuerySession
        try {
            running = startQuery({ prompt: input.iterable, options })
        } catch (error) {
            return {
                ok: false,
                failure: 'engine',
                error: `The SDK did not start: ${errorText(error)}`,
                session: { ...summary, duration_ms: Date.now() - started },
            }
        }
        const open: OpenSession = {
            role,
            ticket,
            cwd,
            may_edit_tests,
            running,
            input,
            summary,
            model_totals: {},
            waiter: null,
            ended: null,
            pump: Promise.resolve(),
            idle_timer: undefined,
            stderr,
        }
        open.pump = pumpMessages({ open, on_end: () => void close(open) })

        const ended = async (outcome: Outcome): Promise<AgentTurn> => {
            await close(open)
            return {
                ...outcome,
                session_id: open.summary.session_id ?? fallback_id,
                session: { ...open.summary, duration_ms: Date.now() - started },
            }
        }

        let timer: ReturnType<typeof setTimeout> | undefined
        const timedOut = new Promise<'timeout'>((resolve) => {
            timer = setTimeout(() => resolve('timeout'), timeoutMs)
        })
        const account = await Promise.race([
            running.accountInfo().then(
                (info) => ({ info }),
                (error: unknown) => ({ error })
            ),
            nextOutcome(open).then((outcome) => ({ outcome })),
            timedOut,
        ])
        clearTimeout(timer)
        open.waiter = null
        if (account === 'timeout') {
            return ended({
                ok: false,
                failure: 'engine',
                error: 'accountInfo() did not answer in time.',
            })
        }
        if ('outcome' in account) return ended(account.outcome)
        if ('error' in account) {
            return ended({
                ok: false,
                failure: 'engine',
                error: `accountInfo() failed: ${errorText(account.error)}`,
            })
        }
        const accountParsed = AccountSchema.safeParse(account.info)
        summary.subscription_type = accountParsed.success
            ? (accountParsed.data.subscriptionType ?? null)
            : null
        const problem = accountProblem(account.info)
        if (problem !== null) return ended(stop(`credential check: ${problem}`))
        return runTurn({ open, message: prompt, started, fallback_id })
    }

    const followUp: AgentLauncher['followUp'] = async ({
        session_id,
        role,
        ticket,
        message,
    }) => {
        const open = sessions.get(session_id)
        if (open === undefined || open.ended !== null) {
            if (open !== undefined) await close(open)
            return {
                ok: false,
                failure: 'engine',
                session_id,
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

    const closeAll = async (): Promise<void> => {
        await Promise.all([...new Set(sessions.values())].map(close))
    }

    return { launch, followUp, closeSession, closeAll }
}
