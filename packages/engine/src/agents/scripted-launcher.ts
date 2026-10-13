import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import type {
    AgentLauncher,
    AgentMessaging,
    AgentSession,
    AgentTurn,
    LauncherFailure,
} from './agent-launcher'
import type { AgentRole } from './role-results'

/**
 * The engine's tools, as a scripted agent calls them. They reach the
 * messaging the session was launched with; a reviewer has none, so its
 * `send_message` is not ok and its `tool_call` hands over nothing.
 */
export type ScriptedTools = {
    /** The `send_message` tool. */
    send_message: (args: { to: string; text: string }) => {
        ok: boolean
        detail: string
    }
    /**
     * Stands for any tool call the agent makes: the delivery hook runs after
     * it, and this returns what it handed over, or `null`.
     */
    tool_call: (tool_name: string) => string | null
}

/**
 * One scripted agent turn: the files it writes, anything else it does, and
 * what it returns.
 *
 * - With `failure`, the turn fails that way with `error`.
 * - Otherwise it succeeds with `result` as its structured output. Leave
 *   `result` out for a success with no structured output.
 */
export type ScriptedTurn = {
    role: AgentRole
    ticket: number
    /** Worktree-relative path to file content. */
    files?: Record<string, string>
    /**
     * Any other side effect, such as running git in the worktree, or sending
     * and receiving agent messages through `tools`.
     */
    act?: (cwd: string, tools: ScriptedTools) => Promise<void>
    /** The role's result, as the agent's structured output. */
    result?: unknown
    failure?: LauncherFailure
    error?: string
    /** A session summary for the engine to journal. */
    session?: AgentSession
}

/** One call a scripted launcher got: a fresh launch or a follow-up. */
export type ScriptedCall = {
    kind: 'launch' | 'follow_up'
    role: AgentRole
    ticket: number
    /** The launch's prompt, or the follow-up's message. */
    prompt: string
    session_id: string
    /** Only on launches. */
    may_edit_tests?: boolean
    /** What each of the turn's tool calls handed over, in order. */
    delivered: string[]
}

/** A scripted launcher, plus what tests need to look inside it. */
export type ScriptedLauncher = AgentLauncher & {
    /** Every launch and follow-up so far, oldest first. */
    launches: () => ScriptedCall[]
    /** The ids of the sessions launched and not yet closed, oldest first. */
    openSessions: () => string[]
}

/**
 * An agent launcher with scripted stand-ins, for tests. Each launch starts a
 * new session (`scripted-<role>-<ticket>-<n>`) and each follow-up stays in its
 * session; both take the next unused turn for their role and ticket, write
 * that turn's files into the worktree, run its `act`, and return its result
 * or failure. A call with no turn left fails the agent's try; a follow-up to
 * an unknown or closed session is an engine failure. A session stays open,
 * however its turns ended, until `closeSession` closes it; `openSessions`
 * counts the ones still open. The engine config it is handed is
 * ignored. A turn's `act` gets the engine's tools, wired to the messaging
 * its session was launched with.
 *
 * @example
 * const launcher = createScriptedLauncher({
 *     turns: [{ role: 'test-writer', ticket: 11, files: { 'a.test.ts': '...' }, result }],
 * })
 */
export const createScriptedLauncher = ({
    turns,
}: {
    turns: ScriptedTurn[]
}): ScriptedLauncher => {
    const remaining = [...turns]
    const calls: ScriptedCall[] = []
    /** Each open session's messaging, kept for its follow-ups. */
    const sessions = new Map<string, AgentMessaging | null>()

    const toolsFor = ({
        messaging,
        call,
    }: {
        messaging: AgentMessaging | null
        call: ScriptedCall
    }): ScriptedTools => ({
        send_message: (args) =>
            messaging === null
                ? { ok: false, detail: 'This agent has no send_message tool.' }
                : messaging.send(args),
        tool_call: (tool_name) => {
            const text = messaging?.deliver({ tool_name }) ?? null
            if (text !== null) call.delivered.push(text)
            return text
        },
    })

    const play = async ({
        role,
        ticket,
        cwd,
        session_id,
        tools,
    }: {
        role: AgentRole
        ticket: number
        cwd: string
        session_id: string
        tools: ScriptedTools
    }): Promise<AgentTurn> => {
        const index = remaining.findIndex(
            (turn) => turn.role === role && turn.ticket === ticket
        )
        const turn = remaining[index]
        if (turn === undefined) {
            return {
                ok: false,
                failure: 'agent',
                session_id,
                error: `No scripted turn left for the ${role} on #${ticket}.`,
            }
        }
        remaining.splice(index, 1)
        for (const [path, content] of Object.entries(turn.files ?? {})) {
            const full = join(cwd, path)
            await mkdir(dirname(full), { recursive: true })
            await Bun.write(full, content)
        }
        if (turn.act !== undefined) await turn.act(cwd, tools)
        const session =
            turn.session === undefined ? {} : { session: turn.session }
        if (turn.failure !== undefined) {
            return {
                ok: false,
                failure: turn.failure,
                session_id,
                error: turn.error ?? `The scripted ${role} failed.`,
                ...session,
            }
        }
        return {
            ok: true,
            session_id,
            structured_output: turn.result,
            ...session,
        }
    }

    return {
        launch: async ({
            role,
            ticket,
            prompt,
            cwd,
            may_edit_tests,
            messaging,
        }) => {
            const session_id = `scripted-${role}-${ticket}-${calls.length + 1}`
            sessions.set(session_id, messaging)
            const call: ScriptedCall = {
                kind: 'launch',
                role,
                ticket,
                prompt,
                session_id,
                may_edit_tests,
                delivered: [],
            }
            calls.push(call)
            const tools = toolsFor({ messaging, call })
            return play({ role, ticket, cwd, session_id, tools })
        },
        followUp: async ({ session_id, role, ticket, message, cwd }) => {
            const call: ScriptedCall = {
                kind: 'follow_up',
                role,
                ticket,
                prompt: message,
                session_id,
                delivered: [],
            }
            calls.push(call)
            const messaging = sessions.get(session_id)
            if (messaging === undefined) {
                return {
                    ok: false,
                    failure: 'engine',
                    session_id,
                    error: `No scripted session ${session_id}.`,
                }
            }
            const tools = toolsFor({ messaging, call })
            return play({ role, ticket, cwd, session_id, tools })
        },
        closeSession: async ({ session_id }) => {
            sessions.delete(session_id)
        },
        launches: () => [...calls],
        openSessions: () => [...sessions.keys()],
    }
}
