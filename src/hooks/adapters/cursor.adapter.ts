/**
 * Cursor platform adapter for the Luca hook system.
 *
 * Transforms canonical hook definitions into Cursor-specific configs
 * using camelCase event names and command substring matchers.
 * Cursor does not support async hooks or status messages.
 *
 * Source: src/hooks/adapters/cursor.adapter.ts
 */

import type { CanonicalHook, CanonicalEvent } from "../__schemas/hook.schemas";
import type { PlatformHookConfig } from "../__helpers/platform-adapters";
import type { HookPlatformAdapter } from "./adapter.schemas";
import { generateCursorHooksConfigFromCanonical } from "../__helpers/config-generators";

// ---- Event map ----

/**
 * Maps canonical event names to Cursor camelCase event names.
 */
export const CURSOR_EVENT_MAP: Record<CanonicalEvent, string> = {
  post_tool_use: "afterFileEdit",
  pre_tool_use: "beforeShellExecution",
  stop: "stop",
  session_end: "sessionEnd",
  session_start: "sessionStart",
};

// ---- Adapter function ----

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

// ---- Adapter object ----

/**
 * Cursor adapter conforming to the HookPlatformAdapter contract.
 *
 * Registered in the adapter registry for runtime resolution.
 */
export const cursorAdapter: HookPlatformAdapter = {
  platform: "cursor",
  event_map: CURSOR_EVENT_MAP,
  adapt: adaptForCursor,
  generate_config: (registry) =>
    generateCursorHooksConfigFromCanonical(registry),
};
