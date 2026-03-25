/**
 * Hook registry Zod schemas and TypeScript types for the Luca Framework.
 *
 * Defines the structure for hook definitions including event types,
 * matchers, script references, and Claude Code configuration.
 *
 * Two schema layers:
 * - CanonicalHookSchema: Platform-independent hook definition
 * - HookDefinitionSchema: Legacy format with Claude Code fields (backward compat)
 */

import { z } from "zod";

// ─── Canonical (platform-independent) hook schema ───────────────────────────

/**
 * Platform-independent event names.
 *
 * These are semantic lifecycle events mapped to Claude Code PascalCase
 * event names (e.g., "post_tool_use" -> "PostToolUse").
 *
 * Events with active hooks in the registry:
 *   post_tool_use, pre_tool_use, stop, session_end, session_start,
 *   pre_compact, user_prompt_submit, subagent_stop, post_tool_use_failure
 *
 * Forward-compatibility entries (valid Claude Code events, no hooks yet):
 *   subagent_start, notification, instructions_loaded, permission_request,
 *   teammate_idle, task_completed, config_change, worktree_create, worktree_remove
 *
 * The full set is retained because CLAUDE_EVENT_MAP in platform-adapters.ts
 * is typed as Record<CanonicalEvent, string> and must cover all members.
 */
export const CANONICAL_EVENTS = [
  // --- Active (have hooks in canonicalHookRegistry) ---
  "post_tool_use",
  "pre_tool_use",
  "stop",
  "session_end",
  "session_start",
  "pre_compact",
  "user_prompt_submit",
  "subagent_stop",
  "post_tool_use_failure",
  // --- Forward-compatibility (valid events, no hooks yet) ---
  "subagent_start",
  "notification",
  "instructions_loaded",
  "permission_request",
  "teammate_idle",
  "task_completed",
  "config_change",
  "worktree_create",
  "worktree_remove",
] as const;

export const canonicalEventSchema = z.enum(CANONICAL_EVENTS);
export type CanonicalEvent = z.infer<typeof canonicalEventSchema>;

/**
 * Canonical (platform-independent) hook definition.
 *
 * Hooks are defined once using semantic event names and a single
 * tool_filter / command_filter pair. Platform adapters transform
 * these into platform-specific configs.
 */
export const CanonicalHookSchema = z.object({
  /** Platform-independent lifecycle event */
  event: canonicalEventSchema,
  /** Tool name regex filter (undefined = always fire). Maps to Claude matcher. */
  tool_filter: z.string().optional(),
  /** Command substring filter for pre_tool_use hooks (e.g., commit command patterns) */
  command_filter: z.string().optional(),
  /** Hook type: "command" runs a shell script (default), "prompt" injects an LLM evaluation prompt */
  type: z.enum(["command", "prompt"]).optional(),
  /** Shell script filename in src/hooks/scripts/ (required for command hooks) */
  script: z.string().optional(),
  /** Inline prompt text for prompt-type hooks (required for prompt hooks) */
  prompt: z.string().optional(),
  /** Timeout in seconds */
  timeout: z.number().positive(),
  /** Run asynchronously in background (supported by Claude Code) */
  async: z.boolean(),
  /** Status message shown while hook runs (supported by Claude Code) */
  status_message: z.string().optional(),
});
export type CanonicalHook = z.infer<typeof CanonicalHookSchema>;

// ─── Legacy (platform-specific) hook schema ─────────────────────────────────

export const HookDefinitionSchema = z.object({
  /** Claude Code hook event name (PascalCase) */
  event: z.string(),
  /** Regex matcher for Claude Code tool name filtering (undefined = always fire) */
  matcher: z.string().optional(),
  /** Shell script filename in src/hooks/scripts/ (undefined for prompt hooks) */
  script: z.string().optional(),
  /** Timeout in seconds */
  timeout: z.number().positive(),
  /** Run asynchronously in background (Claude Code only) */
  async: z.boolean(),
  /** Status message shown while hook runs (Claude Code only) */
  status_message: z.string().optional(),
});
export type HookDefinition = z.infer<typeof HookDefinitionSchema>;

/** Sentinel value for hooks with no matcher constraint. */
export const NO_MATCHER_SENTINEL = "__no_matcher__" as const;

// ─── Session Observation schema (T3 internal — not exported from barrel) ─────

/**
 * Context zones matching the quality degradation curve.
 */
export const CONTEXT_ZONES = ["peak", "good", "degrading", "stop"] as const;
export const contextZoneSchema = z.enum(CONTEXT_ZONES);
export type ContextZone = z.infer<typeof contextZoneSchema>;

/**
 * Observation sources — what triggered the observation write.
 */
export const OBSERVATION_SOURCES = [
  "zone_transition",
  "user_prompt_submit",
  "subagent_stop",
  "post_tool_use_failure",
  "session_start",
] as const;
export const observationSourceSchema = z.enum(OBSERVATION_SOURCES);
export type ObservationSource = z.infer<typeof observationSourceSchema>;

/**
 * Schema for session observation engrams written to MuninnDB by the hook layer.
 *
 * These structured snapshots capture session context at key lifecycle events
 * (zone transitions, user prompts, subagent completions, tool failures).
 * The enhanced restore in session-start.ts reads these back to prime context
 * after /clear.
 */
export const SessionObservationSchema = z.object({
  /** MuninnDB concept string (e.g., "session:observation-1710432000000") */
  concept: z.string(),
  /** ISO 8601 timestamp of the observation */
  timestamp: z.string(),
  /** Context zone at time of observation */
  zone: contextZoneSchema,
  /** Numeric context usage percentage (0-100) */
  usage_percent: z.number().min(0).max(100),
  /** Current git branch name (empty string if unavailable) */
  git_branch: z.string().default(""),
  /** Short summary of files changed since last observation (empty if unavailable) */
  git_diff_summary: z.string().default(""),
  /** Current phase/plan/status from STATE.md (empty if unavailable) */
  phase_context: z.string().default(""),
  /** What triggered this observation */
  source: observationSourceSchema,
});
export type SessionObservation = z.infer<typeof SessionObservationSchema>;

// ─── Platform hook config type ──────────────────────────────────────────────

/**
 * Platform-specific hook configuration produced by the adapter.
 *
 * Contains the event name, matcher, and other fields needed by
 * the config generator. Defined in __schemas/ so adapter.schemas.ts
 * can import it without creating a __schemas/ → __helpers/ inversion.
 */
export interface PlatformHookConfig {
  /** Platform-specific event name */
  event: string;
  /** Platform-specific matcher (undefined = always fire) */
  matcher?: string | string[];
  /** Shell script filename (undefined for prompt hooks) */
  script?: string;
  /** Timeout in seconds */
  timeout: number;
  /** Async execution flag */
  async: boolean;
  /** Status message */
  statusMessage?: string;
}
