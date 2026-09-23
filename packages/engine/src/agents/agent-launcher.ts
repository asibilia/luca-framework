import { z } from 'zod'

import type { AgentRole } from './role-results'

import type { EngineConfig } from '../config/engine-config'

/**
 * A summary of one agent's model session, as the launcher saw it: raw
 * numbers and readings. The decision step reads its rate-limit readings for
 * limit waits and billing stops, and sums its tokens into usage records.
 * Every field has a default, so a session cut short still fits.
 */
export const AgentSessionSchema = z.object({
    session_id: z.string().nullable().default(null),
    model: z.string().nullable().default(null),
    claude_code_version: z.string().nullable().default(null),
    /** From the session's init message. Must be `none`: no API key. */
    api_key_source: z.string().nullable().default(null),
    /** From `accountInfo()`: the Claude plan that paid, such as `max`. */
    subscription_type: z.string().nullable().default(null),
    num_turns: z.number().int().min(0).default(0),
    duration_ms: z.number().min(0).default(0),
    usage: z
        .object({
            input_tokens: z.number().default(0),
            output_tokens: z.number().default(0),
            cache_read_input_tokens: z.number().default(0),
            cache_creation_input_tokens: z.number().default(0),
        })
        .default({
            input_tokens: 0,
            output_tokens: 0,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
        }),
    /** The SDK's own estimate at list price; the plan paid, not this. */
    total_cost_usd: z.number().default(0),
    /** Calls the SDK's permission rules denied (its result's own list). */
    permission_denials: z
        .array(z.object({ tool_name: z.string(), tool_use_id: z.string() }))
        .default([]),
    /** Calls the engine's guard hook denied, with its reason. */
    guard_denials: z
        .array(z.object({ tool_name: z.string(), reason: z.string() }))
        .default([]),
    /** Every `rate_limit_event`'s info, as sent. */
    rate_limit_events: z.array(z.record(z.string(), z.unknown())).default([]),
    /** An assistant message came back with `error: "billing_error"`. */
    billing_error: z.boolean().default(false),
})

export type AgentSession = z.infer<typeof AgentSessionSchema>

/**
 * Why a turn failed, as the launcher sees it:
 * - `agent`: the agent's own try went wrong (an error result, too many
 *   turns, a timeout). It uses up the try.
 * - `engine`: the engine's side broke (the SDK process crashed or threw,
 *   or a follow-up's session is gone). The engine starts a fresh agent
 *   without using up a try.
 * - `stop`: continuing is unsafe (the wrong credentials or plan, a Fable or
 *   non-Claude model, a foreign MCP server). The run stops.
 * - `plan`: the plan said no. A rejected rate limit, overage, or a billing
 *   error cut the turn off. The reason is in the turn's `session` (its
 *   readings, or `billing_error`), and the decision step reads it from the
 *   journal: a limit wait, or a billing stop. The turn uses up no try.
 */
export const LauncherFailureSchema = z.enum(['agent', 'engine', 'stop', 'plan'])

export type LauncherFailure = z.infer<typeof LauncherFailureSchema>

/**
 * What one agent turn gave back. `structured_output` is checked against the
 * role's schema by the engine, not the launcher, so every launcher is judged
 * the same way; a success with no structured output is a failed try.
 * `session_id` names the session the turn ran in, so the engine can send that
 * same agent a follow-up in a fix loop. `session` is the launcher's summary
 * of the model session, for the journal.
 */
export type AgentTurn =
    | {
          ok: true
          session_id: string
          structured_output: unknown
          session?: AgentSession
      }
    | {
          ok: false
          failure: LauncherFailure
          error: string
          session_id?: string
          session?: AgentSession
      }

/**
 * Starts agents. The engine hands it a role, a ticket, a prompt, the
 * worktree the agent works in, and the engine config; the launcher runs the
 * agent and returns its result. Agents never touch git; the engine commits
 * what they leave, and checks what they changed after every turn.
 *
 * Scripted stand-ins (`createScriptedLauncher`) sit behind this for tests;
 * the real Claude launcher (`createClaudeLauncher`) sits behind it too.
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
         * guards enforce it, and the engine's after-turn check does too.
         */
        may_edit_tests: boolean
        config: EngineConfig
    }) => Promise<AgentTurn>
    /**
     * Sends a follow-up message to an agent session that is still open, such
     * as a failed gate's output in a fix loop, and returns the session's new
     * result. The agent keeps everything it knew from its earlier turns, and
     * the guards it was launched with. A session the launcher doesn't know,
     * or one that has closed, is an engine failure.
     *
     * @example
     * const turn = await launcher.followUp({ session_id, role: 'implementer', ticket: 11, message: 'lint failed: ...', cwd, config })
     */
    followUp: (args: {
        session_id: string
        role: AgentRole
        ticket: number
        message: string
        cwd: string
        config: EngineConfig
    }) => Promise<AgentTurn>
}
