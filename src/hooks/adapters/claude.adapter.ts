/**
 * Claude Code platform adapter for the Luca hook system.
 *
 * Transforms canonical hook definitions into Claude Code-specific configs
 * using PascalCase event names, regex matchers, async support, and status messages.
 *
 * Source: src/hooks/adapters/claude.adapter.ts
 */

import type { CanonicalHook, CanonicalEvent } from "../__schemas/hook.schemas";
import type { PlatformHookConfig } from "../__helpers/platform-adapters";
import type { HookPlatformAdapter } from "./adapter.schemas";
import { generateClaudeHooksConfigFromCanonical } from "../__helpers/config-generators";

// ---- Event map ----

/**
 * Maps canonical event names to Claude Code PascalCase event names.
 */
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

// ---- Adapter function ----

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

// ---- Adapter object ----

/**
 * Claude Code adapter conforming to the HookPlatformAdapter contract.
 *
 * Registered in the adapter registry for runtime resolution.
 */
export const claudeAdapter: HookPlatformAdapter = {
  platform: "claude-code",
  event_map: CLAUDE_EVENT_MAP,
  adapt: adaptForClaude,
  generate_config: (registry, options) =>
    generateClaudeHooksConfigFromCanonical(registry, {
      commandPrefix:
        (options?.commandPrefix as string) ??
        '"$CLAUDE_PROJECT_DIR"/.claude/hooks',
      wrapInHooksKey: (options?.wrapInHooksKey as boolean) ?? false,
    }),
};
