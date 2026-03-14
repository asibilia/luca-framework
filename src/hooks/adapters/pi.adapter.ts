/**
 * Pi platform adapter for the Luca hook system.
 *
 * Transforms canonical hook definitions into Pi-specific configs
 * using snake_case event names and tool name arrays for matchers.
 *
 * Source: src/hooks/adapters/pi.adapter.ts
 */

import type { CanonicalHook, CanonicalEvent } from "../__schemas/hook.schemas";
import type { PlatformHookConfig } from "../__helpers/platform-adapters";
import type { HookPlatformAdapter } from "./adapter.schemas";
import { generatePiExtensionFromCanonical } from "../__helpers/config-generators";

// ---- Event map ----

/**
 * Maps canonical event names to Pi snake_case event names.
 */
export const PI_EVENT_MAP: Record<CanonicalEvent, string> = {
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

// ---- Adapter function ----

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

// ---- Adapter object ----

/**
 * Pi adapter conforming to the HookPlatformAdapter contract.
 *
 * Registered in the adapter registry for runtime resolution.
 */
export const piAdapter: HookPlatformAdapter = {
  platform: "pi",
  event_map: PI_EVENT_MAP,
  adapt: adaptForPi,
  generate_config: (registry, options) =>
    generatePiExtensionFromCanonical(registry, {
      hooksDir: (options?.hooksDir as string) ?? ".pi/hook-scripts",
    }),
};
