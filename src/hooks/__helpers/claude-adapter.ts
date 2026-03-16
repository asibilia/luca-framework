/**
 * Claude Code platform adapter for the Luca hook system.
 *
 * Transforms canonical hook definitions into Claude Code-specific configs
 * using PascalCase event names, regex matchers, async support, and status messages.
 *
 * Source: src/hooks/__helpers/claude-adapter.ts
 */

import type { CanonicalHook } from "../__schemas/hook.schemas";
import type { HookPlatformAdapter } from "../__schemas/adapter.schemas";

import { CLAUDE_EVENT_MAP } from "./platform-adapters";
import type { PlatformHookConfig } from "./platform-adapters";
import { generateClaudeHooksConfigFromCanonical } from "./config-generators";

// Re-export for consumers that imported CLAUDE_EVENT_MAP from this module
export { CLAUDE_EVENT_MAP } from "./platform-adapters";

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
