---
id: "100-07"
title: "Canonical hook format with platform adapters and regression tests"
phase: 100
wave: 3
complexity: COMPLEX
depends_on: []
tasks:
  - id: "100-07-1"
    title: "Define canonical hook schema with platform-independent fields"
    goal: "Refactor HookDefinitionSchema to separate canonical (platform-independent) fields from platform-specific adapter fields"
    verify: "CanonicalHookSchema defined with platform-independent fields; HookDefinitionSchema extends it with platform-specific fields; bunx --bun tsc --noEmit passes"
  - id: "100-07-2"
    title: "Create platform adapter interface and implementations"
    goal: "Define a HookPlatformAdapter type with adapt() function, and implement adapters for claude, cursor, and pi"
    verify: "Three adapter functions exported: adaptForClaude, adaptForCursor, adaptForPi; each transforms canonical hook to platform config"
  - id: "100-07-3"
    title: "Refactor hook registry to use canonical format"
    goal: "Update hookRegistry entries to use canonical fields with platform-specific overrides only where needed"
    verify: "hookRegistry entries define canonical fields; platform-specific fields derived via adapters; existing behavior preserved"
  - id: "100-07-4"
    title: "Refactor config generators to use platform adapters"
    goal: "Update generateClaudeHooksConfig, generateCursorHooksConfig, and generatePiExtension to use platform adapters"
    verify: "All three generators produce identical output to current versions; verified by snapshot comparison"
  - id: "100-07-5"
    title: "Normalize shell script stdin/stdout parsing across platforms"
    goal: "Audit and standardize the stdin JSON format that hook scripts receive and the stdout format they return across all 3 platforms"
    verify: "All shell scripts handle both Claude and Cursor JSON formats; documented contract in script header comments"
  - id: "100-07-6"
    title: "Create hook portability regression test suite"
    goal: "Write tests verifying that all hooks produce valid configs for all 3 platforms and that shell scripts parse all platform formats"
    verify: "bun test passes for all hook portability tests; covers config generation, adapter transformation, and shell script parsing"
  - id: "100-07-7"
    title: "Verify drift-free output after refactor"
    goal: "Run bun run build:all and bun run check:drift to confirm the refactor produces identical output files"
    verify: "bun run check:drift reports zero drift; .claude/hooks/, .cursor/hooks/, .claude/settings.json, .cursor/hooks.json unchanged"
---

# 100-07: Canonical Hook Format with Platform Adapters and Regression Tests

## Goal

Canonicalize the hook format so that hooks are defined once in a platform-independent way and then adapted to each platform (Claude Code, Cursor, Pi) via typed adapter functions. This eliminates the current pattern where each hook must specify platform-specific field names (event/cursorEvent/piEvent, matcher/cursorMatcher/piMatcher) and replaces it with a canonical definition plus platform adapters. Additionally, create regression tests ensuring hook portability across all 3 platforms.

## Context

@src/hooks/**schemas/hook.schemas.ts -- Current HookDefinitionSchema with mixed platform fields
@src/hooks/**helpers/hook-registry.ts -- hookRegistry with all hook definitions
@src/hooks/\_\_helpers/config-generators.ts -- generateClaudeHooksConfig, generateCursorHooksConfig, generatePiExtension
@src/hooks/scripts/\*.sh -- Shell scripts that receive stdin JSON from different platforms
@src/hooks/index.ts -- Barrel exports for hooks module
@.claude/hooks/ -- Generated Claude Code hook scripts
@.cursor/hooks/ -- Generated Cursor hook scripts
@.claude/settings.json -- Generated Claude Code settings with hooks config
@.cursor/hooks.json -- Generated Cursor hooks config

**Architecture constraints:**

- Source lives in `src/hooks/` -- never edit generated files in `.claude/`, `.cursor/`, `.pi/`
- After refactor, `bun run build:all` must produce identical output (zero drift)
- No breaking changes to hook behavior
- Functional patterns only (adapters are pure functions, not classes)
- Shell scripts must handle both Claude Code and Cursor JSON stdin formats

**Current pain points being solved:**

1. Each hook definition has 3 event fields (event, cursorEvent, piEvent) and 3 matcher fields (matcher, cursorMatcher, piMatcher) -- 6 platform-specific fields
2. Adding a new platform means adding 2 more fields to every hook
3. Shell scripts have ad-hoc parsing for different platform JSON formats
4. No tests verify that generated configs are valid across platforms

**Design approach:**

```
Canonical Hook -> Platform Adapter -> Platform Config
     |                  |                    |
  event: "file-edit"  adapt(hook, "claude")  { event: "PostToolUse", matcher: "Edit|Write" }
  trigger: "file-edit" adapt(hook, "cursor") { event: "afterFileEdit" }
  script: "post-edit.sh" adapt(hook, "pi")   { event: "tool_execution_end", matcher: ["edit","write"] }
```

## Tasks

### Task 100-07-1: Define canonical hook schema with platform-independent fields

Refactor `src/hooks/__schemas/hook.schemas.ts` to separate canonical and platform-specific fields.

```typescript
import { z } from "zod";

/**
 * Canonical hook event types (platform-independent).
 *
 * These map to platform-specific event names via adapters:
 * - file_edit -> Claude: PostToolUse, Cursor: afterFileEdit, Pi: tool_execution_end
 * - pre_commit -> Claude: PreToolUse, Cursor: beforeShellExecution, Pi: tool_call
 * - session_start -> Claude: SessionStart, Cursor: sessionStart, Pi: session_start
 * - session_end -> Claude: SessionEnd, Cursor: sessionEnd, Pi: session_shutdown
 * - stop -> Claude: Stop, Cursor: stop, Pi: session_shutdown
 */
export const CANONICAL_EVENTS = [
  "file_edit",
  "pre_commit",
  "post_action",
  "session_start",
  "session_end",
  "stop",
] as const;

export const canonicalEventSchema = z.enum(CANONICAL_EVENTS);
export type CanonicalEvent = z.infer<typeof canonicalEventSchema>;

/**
 * Canonical (platform-independent) hook definition.
 *
 * Defines a hook's behavior without tying it to any specific platform.
 * Platform adapters transform this into platform-specific configs.
 */
export const CanonicalHookSchema = z.object({
  /** Platform-independent event trigger */
  event: canonicalEventSchema,
  /** Tool name filter pattern (regex string, or undefined = always fire) */
  tool_filter: z.string().optional(),
  /** Command filter pattern (for pre-commit hooks, regex matching command text) */
  command_filter: z.string().optional(),
  /** Shell script filename in src/hooks/scripts/ */
  script: z.string(),
  /** Timeout in seconds */
  timeout: z.number().positive(),
  /** Run asynchronously in background */
  async: z.boolean(),
  /** Human-readable description shown while hook runs */
  status_message: z.string().optional(),
});

export type CanonicalHook = z.infer<typeof CanonicalHookSchema>;

/**
 * Legacy HookDefinitionSchema for backward compatibility.
 *
 * Extends CanonicalHookSchema with platform-specific fields.
 * Used during migration; new code should use CanonicalHookSchema
 * with platform adapters.
 *
 * @deprecated Use CanonicalHookSchema + platform adapters
 */
export const HookDefinitionSchema = z.object({
  event: z.string(),
  cursorEvent: z.string(),
  piEvent: z.string().optional(),
  matcher: z.string().optional(),
  cursorMatcher: z.string().optional(),
  piMatcher: z.array(z.string()).optional(),
  script: z.string(),
  timeout: z.number().positive(),
  async: z.boolean(),
  statusMessage: z.string().optional(),
});
export type HookDefinition = z.infer<typeof HookDefinitionSchema>;

export const NO_MATCHER_SENTINEL = "__no_matcher__" as const;
```

**Important:** The existing HookDefinitionSchema must remain for backward compatibility. The CanonicalHookSchema is the new canonical form. Both co-exist during migration.

**Verify:**

- [ ] CanonicalHookSchema and CanonicalEvent exported
- [ ] HookDefinitionSchema unchanged (backward compatible)
- [ ] All canonical events defined
- [ ] `bunx --bun tsc --noEmit` passes
- [ ] Existing imports of HookDefinitionSchema unaffected

### Task 100-07-2: Create platform adapter interface and implementations

Create `src/hooks/__helpers/platform-adapters.ts`.

```typescript
import type { CanonicalHook, HookDefinition } from "../__schemas/hook.schemas";

/**
 * Platform-specific hook configuration output.
 *
 * The shape of a hook after it has been adapted for a specific platform.
 */
export interface PlatformHookConfig {
  /** Platform-specific event name */
  event: string;
  /** Platform-specific tool matcher (string for Claude/Cursor, array for Pi) */
  matcher?: string | string[];
  /** Shell script path */
  script: string;
  /** Timeout in seconds */
  timeout: number;
  /** Whether to run async */
  async: boolean;
  /** Status message */
  statusMessage?: string;
}

/**
 * Event mapping from canonical events to Claude Code event names.
 */
const CLAUDE_EVENT_MAP: Record<string, string> = {
  file_edit: "PostToolUse",
  pre_commit: "PreToolUse",
  post_action: "PostToolUse",
  session_start: "SessionStart",
  session_end: "SessionEnd",
  stop: "Stop",
};

/**
 * Event mapping from canonical events to Cursor event names.
 */
const CURSOR_EVENT_MAP: Record<string, string> = {
  file_edit: "afterFileEdit",
  pre_commit: "beforeShellExecution",
  post_action: "afterFileEdit",
  session_start: "sessionStart",
  session_end: "sessionEnd",
  stop: "stop",
};

/**
 * Event mapping from canonical events to Pi event names.
 */
const PI_EVENT_MAP: Record<string, string> = {
  file_edit: "tool_execution_end",
  pre_commit: "tool_call",
  post_action: "tool_execution_end",
  session_start: "session_start",
  session_end: "session_shutdown",
  stop: "session_shutdown",
};

/**
 * Adapt a canonical hook for Claude Code.
 *
 * Transforms the platform-independent hook definition into a
 * Claude Code-specific configuration with PascalCase event names
 * and regex matchers.
 */
export function adaptForClaude(hook: CanonicalHook): PlatformHookConfig {
  return {
    event: CLAUDE_EVENT_MAP[hook.event] ?? hook.event,
    matcher: hook.tool_filter,
    script: hook.script,
    timeout: hook.timeout,
    async: hook.async,
    statusMessage: hook.status_message,
  };
}

/**
 * Adapt a canonical hook for Cursor IDE.
 *
 * Transforms the platform-independent hook definition into a
 * Cursor-specific configuration with camelCase event names.
 * Cursor uses command_filter as its matcher for pre-commit hooks.
 */
export function adaptForCursor(hook: CanonicalHook): PlatformHookConfig {
  return {
    event: CURSOR_EVENT_MAP[hook.event] ?? hook.event,
    matcher: hook.command_filter,
    script: hook.script,
    timeout: hook.timeout,
    async: hook.async,
    statusMessage: hook.status_message,
  };
}

/**
 * Adapt a canonical hook for Pi.
 *
 * Transforms the platform-independent hook definition into a
 * Pi-specific configuration with snake_case event names and
 * array-based matchers.
 */
export function adaptForPi(hook: CanonicalHook): PlatformHookConfig {
  const piMatcher = hook.tool_filter
    ? hook.tool_filter.split("|").map((s) => s.toLowerCase())
    : undefined;

  return {
    event: PI_EVENT_MAP[hook.event] ?? hook.event,
    matcher: piMatcher,
    script: hook.script,
    timeout: hook.timeout,
    async: hook.async,
    statusMessage: hook.status_message,
  };
}

/**
 * Convert a canonical hook to a legacy HookDefinition for backward compatibility.
 *
 * Used during migration to ensure existing code continues to work.
 */
export function canonicalToLegacy(hook: CanonicalHook): HookDefinition {
  const claude = adaptForClaude(hook);
  const cursor = adaptForCursor(hook);
  const pi = adaptForPi(hook);

  return {
    event: claude.event,
    cursorEvent: cursor.event,
    piEvent: pi.event,
    matcher: typeof claude.matcher === "string" ? claude.matcher : undefined,
    cursorMatcher:
      typeof cursor.matcher === "string" ? cursor.matcher : undefined,
    piMatcher: Array.isArray(pi.matcher) ? pi.matcher : undefined,
    script: hook.script,
    timeout: hook.timeout,
    async: hook.async,
    statusMessage: hook.status_message,
  };
}
```

**Verify:**

- [ ] File exists at `src/hooks/__helpers/platform-adapters.ts`
- [ ] `adaptForClaude`, `adaptForCursor`, `adaptForPi` exported
- [ ] `canonicalToLegacy` exported for backward compatibility
- [ ] Event mappings cover all canonical events
- [ ] `bunx --bun tsc --noEmit` passes

### Task 100-07-3: Refactor hook registry to use canonical format

Add a canonical hook registry alongside the existing legacy registry. The legacy registry continues to work via `canonicalToLegacy`.

Update `src/hooks/__helpers/hook-registry.ts`:

```typescript
import type { CanonicalHook, HookDefinition } from "../__schemas/hook.schemas";
import { canonicalToLegacy } from "./platform-adapters";

/**
 * Canonical hook registry.
 *
 * Defines all hooks in a platform-independent format. Platform-specific
 * configurations are derived via adapters (adaptForClaude, adaptForCursor, adaptForPi).
 */
export const canonicalHookRegistry: Record<string, () => CanonicalHook> = {
  "post-edit-format": () => ({
    event: "file_edit",
    tool_filter: "Edit|Write",
    script: "post-edit-format.sh",
    timeout: 10,
    async: false,
    status_message: "Formatting...",
  }),
  "post-edit-typecheck": () => ({
    event: "file_edit",
    tool_filter: "Edit|Write",
    script: "post-edit-typecheck.sh",
    timeout: 30,
    async: true,
    status_message: "Type-checking...",
  }),
  "pre-commit-gate": () => ({
    event: "pre_commit",
    tool_filter: "Bash",
    command_filter:
      "git commit|git merge|bun run commit|bunx commit|bunx --bun commit",
    script: "pre-commit-gate.sh",
    timeout: 120,
    async: false,
    status_message: "Running pre-commit checks...",
  }),
  "pre-commit-drift-check": () => ({
    event: "pre_commit",
    tool_filter: "Bash",
    command_filter:
      "git commit|git merge|bun run commit|bunx commit|bunx --bun commit",
    script: "pre-commit-drift-check.sh",
    timeout: 60,
    async: false,
    status_message: "Checking output drift...",
  }),
  "context-check-throttled": () => ({
    event: "post_action",
    script: "context-check-throttled.sh",
    timeout: 10,
    async: true,
    status_message: "Checking context...",
  }),
  "snapshot-sync": () => ({
    event: "post_action",
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
 * Legacy hook registry (backward compatible).
 *
 * Delegates to canonicalHookRegistry and transforms via canonicalToLegacy.
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
 */
export function resolveHookRegistry(): Record<string, HookDefinition> {
  return Object.fromEntries(
    Object.entries(hookRegistry).map(([name, thunk]) => [name, thunk()]),
  );
}

/**
 * Resolve all canonical hooks into a flat Record<string, CanonicalHook>.
 */
export function resolveCanonicalRegistry(): Record<string, CanonicalHook> {
  return Object.fromEntries(
    Object.entries(canonicalHookRegistry).map(([name, thunk]) => [
      name,
      thunk(),
    ]),
  );
}
```

**Important:** The legacy `hookRegistry` must produce exactly the same output as the current implementation. The `canonicalToLegacy` function handles the transformation.

**Verify:**

- [ ] `canonicalHookRegistry` defined with all hooks
- [ ] Legacy `hookRegistry` produces identical output via `canonicalToLegacy`
- [ ] `resolveCanonicalRegistry()` exported
- [ ] No change to existing consumers of hookRegistry
- [ ] `bunx --bun tsc --noEmit` passes

### Task 100-07-4: Refactor config generators to use platform adapters

Update `src/hooks/__helpers/config-generators.ts` to accept canonical hooks and use adapters internally. The existing function signatures remain for backward compatibility, but internal logic uses adapters.

**Key changes:**

1. Add new functions that accept canonical hooks:
   - `generateClaudeConfig(registry: Record<string, CanonicalHook>, options)` -- uses `adaptForClaude`
   - `generateCursorConfig(registry: Record<string, CanonicalHook>)` -- uses `adaptForCursor`
   - `generatePiConfig(registry: Record<string, CanonicalHook>, options)` -- uses `adaptForPi`
2. Keep existing functions as wrappers that delegate to the new ones
3. Internal logic uses adapter output instead of manual field mapping

**Verify:**

- [ ] New adapter-based generators defined
- [ ] Existing generators still work (backward compatible)
- [ ] Output is byte-identical to current implementation
- [ ] `bunx --bun tsc --noEmit` passes

### Task 100-07-5: Normalize shell script stdin/stdout parsing across platforms

Audit all shell scripts in `src/hooks/scripts/` to ensure they handle stdin JSON from all platforms consistently.

**Current issue:** Claude Code sends `{ tool_input: { ... } }`, Cursor sends `{ command: "..." }` or `{ file_path: "..." }`, and Pi sends a custom format. Some scripts handle all formats, others assume a specific one.

**For each script:**

1. Add a header comment documenting the expected stdin format per platform
2. Ensure the script parses both Claude and Cursor JSON formats
3. Use a common extraction pattern (try jq-style with fallback)
4. Document the stdout/exit code contract

**Scripts to audit:**

- `post-edit-format.sh` -- receives file_path
- `post-edit-typecheck.sh` -- receives file_path
- `pre-commit-gate.sh` -- receives command text
- `pre-commit-drift-check.sh` -- receives command text
- `context-check-throttled.sh` -- receives any event data
- `snapshot-sync.sh` -- receives any event data
- `context-monitor.sh` -- receives minimal data
- `session-persist.sh` -- receives minimal data
- `session-start.sh` -- receives minimal data

**Verify:**

- [ ] All scripts have stdin/stdout contract documented in header
- [ ] All scripts handle Claude and Cursor JSON formats
- [ ] No script assumes a single platform format
- [ ] All scripts work when stdin is empty or malformed
- [ ] `bunx --bun tsc --noEmit` passes (for any TS helpers)

### Task 100-07-6: Create hook portability regression test suite

Create `__tests__/src/hooks/hook-portability.test.ts`.

Tests verifying:

1. **Config generation equivalence:** Legacy and canonical-based generators produce identical output
2. **Platform adapter correctness:** Each adapter maps canonical events to correct platform events
3. **Hook registry completeness:** All hooks define all required fields
4. **Shell script portability:** Each script handles both platform JSON formats
5. **Cross-platform regression:** Generated .claude/settings.json and .cursor/hooks.json are valid

```typescript
import { test, expect, describe } from "bun:test";

describe("Hook portability", () => {
  describe("Platform adapters", () => {
    test("adaptForClaude maps all canonical events", async () => {
      // Verify every canonical event maps to a Claude event
    });

    test("adaptForCursor maps all canonical events", async () => {
      // Verify every canonical event maps to a Cursor event
    });

    test("adaptForPi maps all canonical events", async () => {
      // Verify every canonical event maps to a Pi event
    });

    test("canonicalToLegacy produces valid HookDefinition", async () => {
      // Verify transformation preserves all fields
    });
  });

  describe("Registry completeness", () => {
    test("all hooks in canonical registry have valid canonical events", async () => {
      // Verify no undefined events
    });

    test("canonical and legacy registries have same hook names", async () => {
      // Verify no hooks lost in migration
    });
  });

  describe("Config generation equivalence", () => {
    test("Claude config from canonical matches legacy", async () => {
      // Generate configs both ways and compare
    });

    test("Cursor config from canonical matches legacy", async () => {
      // Generate configs both ways and compare
    });
  });

  describe("Shell script portability", () => {
    test("all hook scripts exist in src/hooks/scripts/", async () => {
      // Verify each script file referenced in registry exists
    });

    test("all hook scripts are executable", async () => {
      // Verify file permissions
    });
  });
});
```

**Verify:**

- [ ] Test file exists at `__tests__/src/hooks/hook-portability.test.ts`
- [ ] All tests pass: `bun test __tests__/src/hooks/hook-portability.test.ts`
- [ ] Tests cover adapter mappings, registry completeness, config equivalence, and script existence
- [ ] No flaky tests

### Task 100-07-7: Verify drift-free output after refactor

Run the full build pipeline and drift check to confirm the refactor produces identical output.

```bash
bun run build:all
bun run check:drift
```

**Verify:**

- [ ] `bun run build:all` completes without errors
- [ ] `bun run check:drift` reports zero drift
- [ ] `.claude/hooks/` directory contains same scripts as before
- [ ] `.cursor/hooks/` directory contains same scripts as before
- [ ] `.claude/settings.json` hooks section unchanged
- [ ] `.cursor/hooks.json` unchanged
- [ ] All tests pass: `bun test`

## Success Criteria

- [ ] CanonicalHookSchema defined with platform-independent event types
- [ ] Platform adapters (claude, cursor, pi) transform canonical hooks to platform-specific configs
- [ ] canonicalHookRegistry contains all hooks in canonical format
- [ ] Legacy hookRegistry preserved via canonicalToLegacy (zero behavioral change)
- [ ] Config generators work with both canonical and legacy registries
- [ ] Shell scripts handle both Claude and Cursor JSON stdin formats
- [ ] Hook portability regression tests pass
- [ ] `bun run build:all && bun run check:drift` produces zero drift
- [ ] `bunx --bun tsc --noEmit` passes
- [ ] No breaking changes to any existing functionality
