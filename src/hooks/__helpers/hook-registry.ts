/**
 * Hook registry for the Luca Framework build pipeline.
 *
 * Maps hook names to metadata objects. The build scripts use this
 * metadata to copy shell scripts and generate platform-specific configs.
 *
 * Two registries are maintained:
 * - canonicalHookRegistry: Platform-independent definitions (source of truth)
 * - hookRegistry: Legacy format with platform-specific fields (backward compat)
 *
 * The legacy hookRegistry delegates to canonicalHookRegistry via canonicalToLegacy().
 */

import type { CanonicalHook } from "../__schemas/hook.schemas";
import type { HookDefinition } from "../__schemas/hook.schemas";
import { canonicalToLegacy } from "./platform-adapters";

// ─── Canonical hook registry (platform-independent, source of truth) ────────

/**
 * Canonical hook registry with platform-independent definitions.
 *
 * Each hook is defined once using semantic event names and unified
 * filter fields. Platform adapters derive Claude/Cursor/Pi-specific
 * configs from these definitions.
 */
export const canonicalHookRegistry: Record<string, () => CanonicalHook> = {
  "post-edit-format": () => ({
    event: "post_tool_use",
    tool_filter: "Edit|Write",
    script: "post-edit-format.sh",
    timeout: 10,
    async: false,
    status_message: "Formatting...",
  }),
  "post-edit-typecheck": () => ({
    event: "post_tool_use",
    tool_filter: "Edit|Write",
    script: "post-edit-typecheck.sh",
    timeout: 30,
    async: true,
    status_message: "Type-checking...",
  }),
  "pre-commit-gate": () => ({
    event: "pre_tool_use",
    tool_filter: "Bash",
    command_filter:
      "git commit|git merge|bun run commit|bunx commit|bunx --bun commit",
    script: "pre-commit-gate.sh",
    timeout: 120,
    async: false,
    status_message: "Running pre-commit checks...",
  }),
  "pre-commit-drift-check": () => ({
    event: "pre_tool_use",
    tool_filter: "Bash",
    command_filter:
      "git commit|git merge|bun run commit|bunx commit|bunx --bun commit",
    script: "pre-commit-drift-check.sh",
    timeout: 60,
    async: false,
    status_message: "Checking output drift...",
  }),
  "context-check-throttled": () => ({
    event: "post_tool_use",
    script: "context-check-throttled.sh",
    timeout: 10,
    async: true,
    status_message: "Checking context...",
  }),
  "snapshot-sync": () => ({
    event: "post_tool_use",
    script: "snapshot-sync.sh",
    timeout: 10,
    async: true,
    status_message: "Syncing STATE.md...",
  }),
  "context-monitor": () => ({
    event: "stop",
    script: "context-monitor.sh",
    timeout: 5,
    async: false,
    status_message: "Checking context usage...",
  }),
  "session-persist": () => ({
    event: "session_end",
    script: "session-persist.sh",
    timeout: 10,
    async: false,
    status_message: "Saving session state...",
  }),
  "session-start": () => ({
    event: "session_start",
    script: "session-start.sh",
    timeout: 15,
    async: false,
    status_message: "Initializing Luca...",
  }),
};

/**
 * Resolve all canonical hooks into a flat Record<string, CanonicalHook>.
 * Convenience helper for consumers that need the resolved canonical registry.
 */
export function resolveCanonicalRegistry(): Record<string, CanonicalHook> {
  return Object.fromEntries(
    Object.entries(canonicalHookRegistry).map(([name, thunk]) => [
      name,
      thunk(),
    ]),
  );
}

// ─── Legacy hook registry (backward compatible) ─────────────────────────────

/**
 * Legacy hook registry with platform-specific fields.
 *
 * Delegates to canonicalHookRegistry via canonicalToLegacy() for
 * backward compatibility. Consumers that depend on HookDefinition
 * format continue to work unchanged.
 *
 * @deprecated Use `canonicalHookRegistry` with the adapter registry
 *   (`resolveAdapter(platform).adapt(hook)`) from `src/hooks/adapters/` instead.
 *   The canonical registry + adapter pattern replaces the need for a
 *   pre-flattened legacy registry.
 */
export const hookRegistry: Record<string, () => HookDefinition> =
  Object.fromEntries(
    Object.entries(canonicalHookRegistry).map(([name, thunk]) => [
      name,
      () => canonicalToLegacy(thunk()),
    ]),
  );

/**
 * Resolve all hookRegistry thunks into a flat Record<string, HookDefinition>.
 * Convenience helper for consumers that need the resolved registry.
 *
 * @deprecated Use `resolveCanonicalRegistry()` with the adapter registry instead.
 */
export function resolveHookRegistry(): Record<string, HookDefinition> {
  return Object.fromEntries(
    Object.entries(hookRegistry).map(([name, thunk]) => [name, thunk()]),
  );
}
