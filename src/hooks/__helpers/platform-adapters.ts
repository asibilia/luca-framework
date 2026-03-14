/**
 * Platform adapters for the Luca hook system.
 *
 * Provides core adapt functions that transform canonical hook definitions
 * into platform-specific configurations. Used internally by config-generators
 * and canonicalToLegacy.
 *
 * For the formal adapter-registry architecture with runtime resolution,
 * see `src/hooks/adapters/`.
 *
 * Source: src/hooks/__helpers/platform-adapters.ts
 */

import type {
  CanonicalHook,
  CanonicalEvent,
  HookDefinition,
} from "../__schemas/hook.schemas";

// ─── Platform hook config type ──────────────────────────────────────────────

/**
 * Platform-specific hook configuration produced by each adapter.
 *
 * Contains the event name, matcher, and other fields needed by
 * each platform's config generator.
 */
export interface PlatformHookConfig {
  /** Platform-specific event name */
  event: string;
  /** Platform-specific matcher (undefined = always fire) */
  matcher?: string | string[];
  /** Shell script filename */
  script: string;
  /** Timeout in seconds */
  timeout: number;
  /** Async execution flag */
  async: boolean;
  /** Status message */
  statusMessage?: string;
}

// ─── Internal event maps ─────────────────────────────────────────────────────

/** Maps canonical event names to Claude Code PascalCase event names. */
const CLAUDE_EVENT_MAP: Record<CanonicalEvent, string> = {
  post_tool_use: "PostToolUse",
  pre_tool_use: "PreToolUse",
  stop: "Stop",
  session_end: "SessionEnd",
  session_start: "SessionStart",
  pre_compact: "PreCompact",
  user_prompt_submit: "UserPromptSubmit",
  subagent_stop: "SubagentStop",
  subagent_start: "SubagentStart",
  notification: "Notification",
  post_tool_use_failure: "PostToolUseFailure",
  instructions_loaded: "InstructionsLoaded",
  permission_request: "PermissionRequest",
  teammate_idle: "TeammateIdle",
  task_completed: "TaskCompleted",
  config_change: "ConfigChange",
  worktree_create: "WorktreeCreate",
  worktree_remove: "WorktreeRemove",
};

/** Maps canonical event names to Cursor camelCase event names. */
const CURSOR_EVENT_MAP: Record<CanonicalEvent, string> = {
  post_tool_use: "afterFileEdit",
  pre_tool_use: "beforeShellExecution",
  stop: "stop",
  session_end: "sessionEnd",
  session_start: "sessionStart",
  pre_compact: "pre_compact",
  user_prompt_submit: "user_prompt_submit",
  subagent_stop: "subagent_stop",
  subagent_start: "subagent_start",
  notification: "notification",
  post_tool_use_failure: "post_tool_use_failure",
  instructions_loaded: "instructions_loaded",
  permission_request: "permission_request",
  teammate_idle: "teammate_idle",
  task_completed: "task_completed",
  config_change: "config_change",
  worktree_create: "worktree_create",
  worktree_remove: "worktree_remove",
};

/** Maps canonical event names to Pi snake_case event names. */
const PI_EVENT_MAP: Record<CanonicalEvent, string> = {
  post_tool_use: "tool_execution_end",
  pre_tool_use: "tool_call",
  stop: "session_shutdown",
  session_end: "session_shutdown",
  session_start: "session_start",
  pre_compact: "pre_compact",
  user_prompt_submit: "user_prompt_submit",
  subagent_stop: "subagent_stop",
  subagent_start: "subagent_start",
  notification: "notification",
  post_tool_use_failure: "post_tool_use_failure",
  instructions_loaded: "instructions_loaded",
  permission_request: "permission_request",
  teammate_idle: "teammate_idle",
  task_completed: "task_completed",
  config_change: "config_change",
  worktree_create: "worktree_create",
  worktree_remove: "worktree_remove",
};

// ─── Adapter functions ──────────────────────────────────────────────────────

/**
 * Adapt a canonical hook for Claude Code.
 *
 * Claude Code uses PascalCase events and regex matchers.
 * Supports async hooks and status messages.
 *
 * @param hook - Canonical hook definition
 * @returns Platform-specific config for Claude Code
 */
export function adaptForClaude(hook: CanonicalHook): PlatformHookConfig {
  return {
    event: CLAUDE_EVENT_MAP[hook.event],
    matcher: hook.tool_filter,
    script: hook.script,
    timeout: hook.timeout,
    async: hook.async,
    statusMessage: hook.status_message,
  };
}

/**
 * Adapt a canonical hook for Cursor.
 *
 * Cursor uses camelCase events and command substring matchers.
 * Does not support async or statusMessage fields.
 *
 * @param hook - Canonical hook definition
 * @returns Platform-specific config for Cursor
 */
export function adaptForCursor(hook: CanonicalHook): PlatformHookConfig {
  return {
    event: CURSOR_EVENT_MAP[hook.event],
    matcher: hook.command_filter,
    script: hook.script,
    timeout: hook.timeout,
    async: false, // Cursor does not support async hooks
    statusMessage: undefined, // Cursor does not support status messages
  };
}

/**
 * Adapt a canonical hook for Pi.
 *
 * Pi uses snake_case events and tool name arrays for matchers.
 * Tool_filter is split on "|" and lowercased to produce the tool name array.
 *
 * @param hook - Canonical hook definition
 * @returns Platform-specific config for Pi
 */
export function adaptForPi(hook: CanonicalHook): PlatformHookConfig {
  const piMatcher = hook.tool_filter
    ? hook.tool_filter.split("|").map((t) => t.toLowerCase())
    : undefined;

  return {
    event: PI_EVENT_MAP[hook.event],
    matcher: piMatcher,
    script: hook.script,
    timeout: hook.timeout,
    async: hook.async,
    statusMessage: hook.status_message,
  };
}

// ─── Legacy conversion ──────────────────────────────────────────────────────

/**
 * Convert a canonical hook definition to the legacy HookDefinition format.
 *
 * This bridges the canonical format to the legacy hook registry,
 * ensuring backward compatibility for consumers that still depend
 * on HookDefinition objects.
 *
 * @param hook - Canonical hook definition
 * @returns Legacy HookDefinition with all platform-specific fields populated
 */
export function canonicalToLegacy(hook: CanonicalHook): HookDefinition {
  const claude = adaptForClaude(hook);
  const cursor = adaptForCursor(hook);
  const pi = adaptForPi(hook);

  return {
    event: claude.event,
    cursor_event: cursor.event,
    pi_event: pi.event,
    matcher: claude.matcher as string | undefined,
    cursor_matcher: cursor.matcher as string | undefined,
    pi_matcher: pi.matcher as string[] | undefined,
    script: hook.script,
    timeout: hook.timeout,
    async: hook.async,
    status_message: hook.status_message,
  };
}
