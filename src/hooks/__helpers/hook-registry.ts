/**
 * Hook registry for the Luca Framework build pipeline.
 *
 * Maps hook names to metadata objects. The build scripts use this
 * metadata to copy shell scripts and generate platform-specific configs.
 */

import type { HookDefinition } from "../__schemas/hook.schemas";

export const hookRegistry: Record<string, () => HookDefinition> = {
  "post-edit-format": () => ({
    event: "PostToolUse",
    cursorEvent: "afterFileEdit",
    piEvent: "tool_execution_end",
    matcher: "Edit|Write",
    cursorMatcher: undefined,
    piMatcher: ["edit", "write"],
    script: "post-edit-format.sh",
    timeout: 10,
    async: false,
    statusMessage: "Formatting...",
  }),
  "post-edit-typecheck": () => ({
    event: "PostToolUse",
    cursorEvent: "afterFileEdit",
    piEvent: "tool_execution_end",
    matcher: "Edit|Write",
    cursorMatcher: undefined,
    piMatcher: ["edit", "write"],
    script: "post-edit-typecheck.sh",
    timeout: 30,
    async: true,
    statusMessage: "Type-checking...",
  }),
  "pre-commit-gate": () => ({
    event: "PreToolUse",
    cursorEvent: "beforeShellExecution",
    piEvent: "tool_call",
    matcher: "Bash",
    cursorMatcher:
      "git commit|git merge|bun run commit|bunx commit|bunx --bun commit",
    piMatcher: ["bash"],
    script: "pre-commit-gate.sh",
    timeout: 120,
    async: false,
    statusMessage: "Running pre-commit checks...",
  }),
  "pre-commit-drift-check": () => ({
    event: "PreToolUse",
    cursorEvent: "beforeShellExecution",
    piEvent: "tool_call",
    matcher: "Bash",
    cursorMatcher:
      "git commit|git merge|bun run commit|bunx commit|bunx --bun commit",
    piMatcher: ["bash"],
    script: "pre-commit-drift-check.sh",
    timeout: 60,
    async: false,
    statusMessage: "Checking output drift...",
  }),
  "context-check-throttled": () => ({
    event: "PostToolUse",
    cursorEvent: "afterFileEdit",
    piEvent: "tool_execution_end",
    matcher: undefined,
    cursorMatcher: undefined,
    piMatcher: undefined,
    script: "context-check-throttled.sh",
    timeout: 10,
    async: true,
    statusMessage: "Checking context...",
  }),
  "snapshot-sync": () => ({
    event: "PostToolUse",
    cursorEvent: "afterFileEdit",
    piEvent: "tool_execution_end",
    matcher: undefined,
    cursorMatcher: undefined,
    piMatcher: undefined,
    script: "snapshot-sync.sh",
    timeout: 10,
    async: true,
    statusMessage: "Syncing STATE.md...",
  }),
  "context-monitor": () => ({
    event: "Stop",
    cursorEvent: "stop",
    piEvent: "session_shutdown",
    matcher: undefined,
    cursorMatcher: undefined,
    piMatcher: undefined,
    script: "context-monitor.sh",
    timeout: 5,
    async: false,
    statusMessage: "Checking context usage...",
  }),
  "session-persist": () => ({
    event: "SessionEnd",
    cursorEvent: "sessionEnd",
    piEvent: "session_shutdown",
    matcher: undefined,
    cursorMatcher: undefined,
    piMatcher: undefined,
    script: "session-persist.sh",
    timeout: 10,
    async: false,
    statusMessage: "Saving session state...",
  }),
  "session-start": () => ({
    event: "SessionStart",
    cursorEvent: "sessionStart",
    piEvent: "session_start",
    matcher: undefined,
    cursorMatcher: undefined,
    piMatcher: undefined,
    script: "session-start.sh",
    timeout: 15,
    async: false,
    statusMessage: "Initializing Luca...",
  }),
};

/**
 * Resolve all hookRegistry thunks into a flat Record<string, HookDefinition>.
 * Convenience helper for consumers that need the resolved registry.
 */
export function resolveHookRegistry(): Record<string, HookDefinition> {
  return Object.fromEntries(
    Object.entries(hookRegistry).map(([name, thunk]) => [name, thunk()]),
  );
}
