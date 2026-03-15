/**
 * Platform adapters for the Luca hook system.
 *
 * Provides the core adapt function that transforms canonical hook definitions
 * into Claude Code-specific configurations. Used internally by config-generators
 * and canonicalToLegacy.
 *
 * For the formal adapter-registry architecture with runtime resolution,
 * see `src/hooks/__helpers/adapter-registry.ts`.
 *
 * Source: src/hooks/__helpers/platform-adapters.ts
 */

import type {
  CanonicalHook,
  CanonicalEvent,
  HookDefinition,
  PlatformHookConfig,
} from "../__schemas/hook.schemas";

// Re-export PlatformHookConfig from __schemas/ (canonical location)
export type { PlatformHookConfig } from "../__schemas/hook.schemas";

// ─── Internal event maps ─────────────────────────────────────────────────────

/** Maps canonical event names to Claude Code PascalCase event names. */
export const CLAUDE_EVENT_MAP: Record<CanonicalEvent, string> = {
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

// ─── Legacy conversion ──────────────────────────────────────────────────────

/**
 * Convert a canonical hook definition to the legacy HookDefinition format.
 *
 * This bridges the canonical format to the legacy hook registry,
 * ensuring backward compatibility for consumers that still depend
 * on HookDefinition objects.
 *
 * @param hook - Canonical hook definition
 * @returns Legacy HookDefinition with Claude Code fields populated
 */
export function canonicalToLegacy(hook: CanonicalHook): HookDefinition {
  const claude = adaptForClaude(hook);

  return {
    event: claude.event,
    matcher: claude.matcher as string | undefined,
    script: hook.script,
    timeout: hook.timeout,
    async: hook.async,
    status_message: hook.status_message,
  };
}
