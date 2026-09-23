import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import type {
    AgentLauncher,
    AgentSession,
    AgentTurn,
    LauncherFailure,
} from './agent-launcher'
import type { AgentRole } from './role-results'

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
    /** Any other side effect, such as running git, in the worktree. */
    act?: (cwd: string) => Promise<void>
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
}

/** A scripted launcher, plus what tests need to look inside it. */
export type ScriptedLauncher = AgentLauncher & {
    /** Every launch and follow-up so far, oldest first. */
    launches: () => ScriptedCall[]
}

/**
 * An agent launcher with scripted stand-ins, for tests. Each launch starts a
 * new session (`scripted-<role>-<ticket>-<n>`) and each follow-up stays in its
 * session; both take the next unused turn for their role and ticket, write
 * that turn's files into the worktree, run its `act`, and return its result
 * or failure. A call with no turn left fails the agent's try; a follow-up to
 * an unknown session is an engine failure. The engine config it is handed is
 * ignored.
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
    const sessions = new Set<string>()

    const play = async ({
        role,
        ticket,
        cwd,
        session_id,
    }: {
        role: AgentRole
        ticket: number
        cwd: string
        session_id: string
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
        if (turn.act !== undefined) await turn.act(cwd)
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
        launch: async ({ role, ticket, prompt, cwd, may_edit_tests }) => {
            const session_id = `scripted-${role}-${ticket}-${calls.length + 1}`
            sessions.add(session_id)
            calls.push({
                kind: 'launch',
                role,
                ticket,
                prompt,
                session_id,
                may_edit_tests,
            })
            return play({ role, ticket, cwd, session_id })
        },
        followUp: async ({ session_id, role, ticket, message, cwd }) => {
            calls.push({
                kind: 'follow_up',
                role,
                ticket,
                prompt: message,
                session_id,
            })
            if (!sessions.has(session_id)) {
                return {
                    ok: false,
                    failure: 'engine',
                    session_id,
                    error: `No scripted session ${session_id}.`,
                }
            }
            return play({ role, ticket, cwd, session_id })
        },
        launches: () => [...calls],
    }
}
