import type { AgentRole } from './role-results'

/**
 * What one agent turn gave back. `structured_output` is checked against the
 * role's schema by the engine, not the launcher, so every launcher is judged
 * the same way.
 */
export type AgentTurn =
    | { ok: true; structured_output: unknown }
    | { ok: false; error: string }

/**
 * Starts agents. The engine hands it a role, a ticket, a prompt, and the
 * worktree the agent works in; the launcher runs the agent and returns its
 * result. Agents never touch git; the engine commits what they leave.
 *
 * Scripted stand-ins (`createScriptedLauncher`) sit behind this for tests.
 * The real Claude launcher (#362) sits behind it too.
 */
export type AgentLauncher = {
    launch: (args: {
        role: AgentRole
        ticket: number
        prompt: string
        cwd: string
    }) => Promise<AgentTurn>
}
