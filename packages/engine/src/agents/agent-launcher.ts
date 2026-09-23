import type { AgentRole } from './role-results'

/**
 * What one agent turn gave back. `structured_output` is checked against the
 * role's schema by the engine, not the launcher, so every launcher is judged
 * the same way. `session_id` names the session the turn ran in, so the engine
 * can send that same agent a follow-up in a fix loop.
 */
export type AgentTurn =
    | { ok: true; session_id: string; structured_output: unknown }
    | { ok: false; error: string; session_id?: string }

/**
 * Starts agents. The engine hands it a role, a ticket, a prompt, and the
 * worktree the agent works in; the launcher runs the agent and returns its
 * result. Agents never touch git; the engine commits what they leave.
 *
 * Scripted stand-ins (`createScriptedLauncher`) sit behind this for tests.
 * The real Claude launcher (#362) sits behind it too.
 */
export type AgentLauncher = {
    /** Starts a fresh agent session and runs its first turn. */
    launch: (args: {
        role: AgentRole
        ticket: number
        prompt: string
        cwd: string
        /**
         * Whether the agent may edit test files: true for the test-writer and
         * for a refactor ticket's implementer (who may follow renames into
         * tests), false for the implementer and the reviewer. The launcher's
         * guards enforce it.
         */
        may_edit_tests: boolean
    }) => Promise<AgentTurn>
    /**
     * Sends a follow-up message to an agent session that is still open, such
     * as a failed gate's output in a fix loop, and returns the session's new
     * result. The agent keeps everything it knew from its earlier turns. A
     * session the launcher doesn't know is a failed turn.
     *
     * @example
     * const turn = await launcher.followUp({ session_id, role: 'implementer', ticket: 11, message: 'lint failed: ...', cwd })
     */
    followUp: (args: {
        session_id: string
        role: AgentRole
        ticket: number
        message: string
        cwd: string
    }) => Promise<AgentTurn>
}
