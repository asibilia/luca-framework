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
 */
export const CANONICAL_EVENTS = [
  "post_tool_use",
  "pre_tool_use",
  "stop",
  "session_end",
  "session_start",
  "pre_compact",
  "user_prompt_submit",
  "subagent_stop",
  "subagent_start",
  "notification",
  "post_tool_use_failure",
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
  /** Shell script filename in src/hooks/scripts/ */
  script: z.string(),
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
  /** Shell script filename in src/hooks/scripts/ */
  script: z.string(),
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
