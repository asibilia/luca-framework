import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import type { AgentLauncher } from './agent-launcher'
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

/** A scripted launcher, plus what tests need to look inside it. */
export type ScriptedLauncher = AgentLauncher & {
    /** Every launch so far, oldest first. */
    launches: () => { role: AgentRole; ticket: number; prompt: string }[]
}

/**
 * An agent launcher with scripted stand-ins, for tests. Each launch takes the
 * next unused turn for its role and ticket, writes that turn's files into the
 * worktree, and returns its result. A launch with no turn left fails.
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
    const launches: { role: AgentRole; ticket: number; prompt: string }[] = []

    return {
        launch: async ({ role, ticket, prompt, cwd }) => {
            launches.push({ role, ticket, prompt })
            const index = remaining.findIndex(
                (turn) => turn.role === role && turn.ticket === ticket
            )
            const turn = remaining[index]
            if (turn === undefined) {
                return {
                    ok: false,
                    error: `No scripted turn left for the ${role} on #${ticket}.`,
                }
            }
            remaining.splice(index, 1)
            for (const [path, content] of Object.entries(turn.files ?? {})) {
                const full = join(cwd, path)
                await mkdir(dirname(full), { recursive: true })
                await Bun.write(full, content)
            }
            return { ok: true, structured_output: turn.result }
        },
        launches: () => [...launches],
    }
}
