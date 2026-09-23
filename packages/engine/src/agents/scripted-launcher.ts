import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import type { AgentLauncher, AgentTurn } from './agent-launcher'
import type { AgentRole } from './role-results'

/** One scripted agent turn: the files it writes and the result it returns. */
export type ScriptedTurn = {
    role: AgentRole
    ticket: number
    /** Worktree-relative path to file content. */
    files?: Record<string, string>
    /** The role's result, as the agent's structured output. */
    result: unknown
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
 * that turn's files into the worktree, and return its result. A call with no
 * turn left, or a follow-up to an unknown session, fails.
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
        return { ok: true, session_id, structured_output: turn.result }
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
                    session_id,
                    error: `No scripted session ${session_id}.`,
                }
            }
            return play({ role, ticket, cwd, session_id })
        },
        launches: () => [...calls],
    }
}
