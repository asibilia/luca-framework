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
    script: "post-edit-format.ts",
    timeout: 10,
    async: false,
    status_message: "Formatting...",
  }),
  "post-edit-typecheck": () => ({
    event: "post_tool_use",
    tool_filter: "Edit|Write",
    script: "post-edit-typecheck.ts",
    timeout: 30,
    async: true,
    status_message: "Type-checking...",
  }),
  "pre-commit-gate": () => ({
    event: "pre_tool_use",
    tool_filter: "Bash",
    command_filter:
      "git commit|git merge|bun run commit|bunx commit|bunx --bun commit",
    script: "pre-commit-gate.ts",
    timeout: 120,
    async: false,
    status_message: "Running pre-commit checks...",
  }),
  "pre-commit-drift-check": () => ({
    event: "pre_tool_use",
    tool_filter: "Bash",
    command_filter:
      "git commit|git merge|bun run commit|bunx commit|bunx --bun commit",
    script: "pre-commit-drift-check.ts",
    timeout: 60,
    async: false,
    status_message: "Checking output drift...",
  }),
  "context-check-throttled": () => ({
    event: "post_tool_use",
    script: "context-check-throttled.ts",
    timeout: 10,
    async: true,
    status_message: "Checking context...",
  }),
  "snapshot-sync": () => ({
    event: "post_tool_use",
    script: "snapshot-sync.ts",
    timeout: 10,
    async: true,
    status_message: "Syncing STATE.md...",
  }),
  "context-monitor": () => ({
    event: "stop",
    script: "context-monitor.ts",
    timeout: 5,
    async: false,
    status_message: "Checking context usage...",
  }),
  "session-persist": () => ({
    event: "session_end",
    script: "session-persist.ts",
    timeout: 10,
    async: false,
    status_message: "Saving session state...",
  }),
  "session-start": () => ({
    event: "session_start",
    script: "session-start.ts",
    timeout: 15,
    async: false,
    status_message: "Initializing Luca...",
  }),
  "pre-compact-checkpoint": () => ({
    event: "pre_compact",
    script: "pre-compact-checkpoint.ts",
    timeout: 15,
    async: true,
    status_message: "Saving context checkpoint...",
  }),
  "session-compact-restore": () => ({
    event: "session_start",
    script: "session-compact-restore.ts",
    timeout: 10,
    async: false,
    status_message: "Restoring context...",
  }),
  "user-prompt-submit": () => ({
    event: "user_prompt_submit",
    script: "user-prompt-submit.ts",
    timeout: 5,
    async: true,
    status_message: "Saving prompt observation...",
  }),
  "subagent-stop": () => ({
    event: "subagent_stop",
    script: "subagent-stop.ts",
    timeout: 5,
    async: true,
    status_message: "Capturing subagent summary...",
  }),
  "post-tool-use-failure": () => ({
    event: "post_tool_use_failure",
    script: "post-tool-use-failure.ts",
    timeout: 5,
    async: true,
    status_message: "Recording failure pattern...",
  }),
  "muninn-context-recall": () => ({
    event: "user_prompt_submit",
    script: "muninn-context-recall.ts",
    timeout: 8,
    async: false,
    status_message: "Recalling context...",
  }),
  "pre-step-enforcement": () => ({
    event: "pre_tool_use",
    tool_filter: "Bash|Skill",
    script: "pre-step-enforcement.ts",
    timeout: 5,
    async: false,
    status_message: "Validating step prerequisites...",
  }),
  "pre-step-pr-address": () => ({
    event: "pre_tool_use",
    tool_filter: "Skill",
    script: "pre-step-pr-address.ts",
    timeout: 5,
    async: false,
    status_message: "Validating pr-address step order...",
  }),
  "pre-step-milestone-complete": () => ({
    event: "pre_tool_use",
    tool_filter: "Skill",
    script: "pre-step-milestone-complete.ts",
    timeout: 5,
    async: false,
    status_message: "Validating milestone-complete step order...",
  }),
  "pre-step-verify": () => ({
    event: "pre_tool_use",
    tool_filter: "Skill",
    script: "pre-step-verify.ts",
    timeout: 5,
    async: false,
    status_message: "Validating verify step order...",
  }),
  "pre-step-phase-execute": () => ({
    event: "pre_tool_use",
    tool_filter: "Skill",
    script: "pre-step-phase-execute.ts",
    timeout: 5,
    async: false,
    status_message: "Validating phase-execute step order...",
  }),
  "vault-routing-guard": () => ({
    event: "pre_tool_use",
    tool_filter:
      "mcp__muninn__muninn_remember|mcp__muninn__muninn_remember_batch",
    type: "prompt" as const,
    prompt:
      'VAULT ROUTING GUARD — Validate this MuninnDB write before it proceeds.\n\n1. Read the `vault` and `concept` parameters from the pending tool call.\n2. Resolve the expected repo vault: read `.planning/config.json` field `muninn.vault`. If the file does not exist or the field is missing, fall back to env var `LUCA_MUNINN_VAULT`. If that is also unset, fall back to `"default"`.\n3. Check the concept prefix against the write routing table:\n   - REPO VAULT targets (MUST use the resolved repo vault, NOT "default" — unless repo vault IS "default"): `session:*`, `brain:project-*`, `metric:signal-rate-*`, `version:*`, `milestone:*`\n   - DEFAULT VAULT targets (MUST use "default"): `pattern:*`, `pitfall:*`, `preference:*`, `brain:user-*`, `procedure:*`, `process:*`\n4. DECISION:\n   - If the vault parameter matches the expected target for the concept prefix: ALLOW the call. Respond with exactly: `{"decision":"allow"}`\n   - If misrouted: BLOCK the call. Respond with: `{"decision":"block","reason":"Concept prefix \'<prefix>\' must target vault \'<expected_vault>\' but was routed to \'<actual_vault>\'. Fix the vault parameter before retrying."}`\n   - If the concept prefix does not match any known row, apply the ambiguity heuristic: "Would this memory be useful in a completely different repo?" Yes -> expect "default". No -> expect repo vault.',
    timeout: 10,
    async: false,
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
 *   (`resolveAdapter(platform).adapt(hook)`) from `src/hooks/__helpers/adapter-registry` instead.
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
