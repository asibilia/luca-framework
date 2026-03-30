---
phase: 222
plan: 3
type: feature
autonomous: true
wave: 3
depends_on: [1]
---

# Phase 222 Plan 3: Pre-Step Hook Enforcement

## Objective

Build framework-level guardrails via a pre-step enforcement hook that validates step ordering and prerequisites before a skill/step executes. This uses the existing Claude Code hook infrastructure with a millisecond-precision dedup guard (200ms TTL) to prevent re-entrancy during parallel wave execution.

## Context

@src/hooks/**helpers/hook-io.ts
@src/hooks/**helpers/hook-registry.ts
@src/hooks/\_\_schemas/hook.schemas.ts
@src/hooks/index.ts
@src/hooks/scripts/pre-commit-gate.ts
@.planning/phases/222-anti-skip-infrastructure/01-CONTEXT.md (Decision #2)
@.planning/phases/222-anti-skip-infrastructure/01-PREMORTEM.md (Constraint #2)

## Tasks

### 1. Add guardPreStep to hook-io.ts

**Type:** auto
**TDD:** false
**Depends on:** none

Add a millisecond-precision dedup guard function to `src/hooks/__helpers/hook-io.ts`.

**Function: `guardPreStep`**

```typescript
/**
 * Millisecond-precision dedup guard for pre-step enforcement hooks.
 *
 * Unlike guardDedup (second precision, 5s TTL), this uses Date.now()
 * directly for sub-second TTL windows. Designed for pre-step hooks
 * where parallel wave execution may fire multiple Skill calls in
 * rapid succession.
 *
 * Guard key format: /tmp/.luca-prestep-{hookName}-{projectHash}-{toolName}-ts
 *
 * TTL: 200ms -- sufficient to collapse duplicate-within-same-event-loop
 * bursts while allowing distinct skill invocations in parallel waves
 * to pass through. (PREMORTEM Constraint #2)
 *
 * @param hookName - Unique hook identifier
 * @param toolName - Tool name from hook stdin (for per-tool scoping)
 * @param ttlMs - Window in milliseconds to deduplicate (default: 200)
 */
export const guardPreStep = (
  hookName: string,
  toolName: string,
  ttlMs = 200, // PREMORTEM Constraint #2: explicitly 200ms, documented here
): void => {
  // Implementation using Date.now() for ms precision
  // Guard file: /tmp/.luca-prestep-{hookName}-{projectHash}-{toolName}-ts
  // Read timestamp, compare with ttlMs, exit(0) if within window
  // Write current Date.now() to guard file
};
```

**Key differences from existing `guardDedup`:**

- Uses `Date.now()` (milliseconds) instead of `Math.floor(Date.now() / 1000)` (seconds)
- TTL is in milliseconds, not seconds
- Guard key includes `toolName` for per-tool scoping (prevents parallel wave collisions)
- Guard key format: `/tmp/.luca-prestep-{hookName}-{projectHash}-{toolName}-ts`

**PREMORTEM Constraint #2:** TTL must be 200ms, explicitly specified in the source comment (not left to framework default). The `ttlMs = 200` default satisfies this, and the JSDoc comment documents the rationale.

**Files to create/edit:**

- `src/hooks/__helpers/hook-io.ts` (edit -- add guardPreStep after guardDedup)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `guardPreStep` is exported from hook-io.ts
- TTL default is 200ms with explicit comment
- Guard key includes toolName for per-tool scoping

### 2. Create pre-step-enforcement.ts hook script

**Type:** auto
**TDD:** false
**Depends on:** 1

Create `src/hooks/scripts/pre-step-enforcement.ts` -- the hook script that runs before step-related tool invocations.

**Hook behavior:**

1. **Guard first** -- call `guardPreStep("pre-step-enforcement", toolName)` immediately. This MUST execute before any expensive operations (bridge calls, file reads) per CONTEXT.md Decision #2.

2. **Parse hook stdin** -- extract tool name and command from stdin JSON using `readStdinJson()` and `extractCommand()` from hook-io.ts.

3. **Validate step prerequisites** -- read current workflow state via bridge (`luca-bridge read-status`) to determine:
   - What step is expected next based on DAG ordering
   - Whether required prior steps have completed
   - Whether the current invocation matches an expected step

4. **Emit result** -- if validation passes, exit 0 (allow). If a prerequisite is missing, emit a `systemMessage` warning (not a hard block) describing the missing prerequisite. This is advisory enforcement -- it warns rather than blocks to avoid disrupting execution while the system is being hardened.

5. **Error handling** -- if the bridge is unavailable or state cannot be read, exit 0 silently (fail-open for resilience). The hook should never crash the workflow.

**Follow the pattern from `pre-commit-gate.ts`:**

- Use `readStdinJson()` for stdin parsing
- Use `emitResult()` for structured output
- Use `exitSuccess()` for clean exit

**Files to create/edit:**

- `src/hooks/scripts/pre-step-enforcement.ts` (create)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Script calls `guardPreStep` before any other logic
- Script reads workflow state from bridge
- Script exits 0 on bridge failure (fail-open)
- Script emits systemMessage warning when prerequisites are missing

### 3. Register pre-step enforcement hook in hook-registry.ts

**Type:** auto
**TDD:** false
**Depends on:** 2

Add the pre-step enforcement hook to `canonicalHookRegistry` in `src/hooks/__helpers/hook-registry.ts`.

**Registry entry:**

```typescript
"pre-step-enforcement": () => ({
  event: "pre_tool_use",
  tool_filter: "Bash|Skill",
  script: "pre-step-enforcement.ts",
  timeout: 5,
  async: false,
  status_message: "Validating step prerequisites...",
}),
```

**Design notes:**

- `tool_filter: "Bash|Skill"` -- catches both Bash-based step invocations and direct Skill tool calls
- `timeout: 5` -- must be fast; the guard exits in <200ms for duplicates, actual validation should be <2s
- `async: false` -- must complete before the tool executes (advisory enforcement)
- No `command_filter` -- applies to all Bash/Skill invocations (the hook script itself determines relevance)

**Files to create/edit:**

- `src/hooks/__helpers/hook-registry.ts` (edit -- add entry to canonicalHookRegistry)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `canonicalHookRegistry["pre-step-enforcement"]` returns a valid CanonicalHook object
- Hook event is "pre_tool_use"
- Hook timeout is 5 seconds

### 4. Verify guardPreStep is accessible to hook scripts (no barrel change needed)

**Type:** auto
**TDD:** false
**Depends on:** 1

`guardPreStep` is internal to hooks -- hook scripts import it directly from `../__helpers/hook-io`. No changes to `src/hooks/index.ts` are needed.

The existing hooks barrel (`src/hooks/index.ts`) does not export any `hook-io.ts` functions (they are internal implementation details consumed only by hook scripts within the same module). Following this established pattern, `guardPreStep` stays internal.

**Files to create/edit:**

- None. No changes to `src/hooks/index.ts`.

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Hook scripts can import `guardPreStep` from `../__helpers/hook-io` (confirmed by `pre-step-enforcement.ts` compiling successfully in Task 2)

## Verification

1. Run `bunx --bun tsc --noEmit` -- must pass with zero errors
2. Confirm `src/hooks/__helpers/hook-io.ts` exports `guardPreStep` with 200ms default TTL
3. Confirm `src/hooks/scripts/pre-step-enforcement.ts` exists and follows PreToolUse hook patterns
4. Confirm `src/hooks/__helpers/hook-registry.ts` has `pre-step-enforcement` entry
5. Manual smoke test: the hook script should parse stdin JSON and read bridge status without crashing

## Success Criteria

- `guardPreStep` provides millisecond-precision dedup with 200ms TTL (PREMORTEM Constraint #2)
- Guard key includes toolName for per-tool scoping (prevents parallel wave collisions)
- Pre-step enforcement hook is registered and fires on pre_tool_use for Bash/Skill tools
- Hook uses advisory enforcement (warning systemMessage, not hard block)
- Hook fails open when bridge is unavailable
- Guard executes before any expensive operations

## Output Specification

- Modified: `src/hooks/__helpers/hook-io.ts`
- Modified: `src/hooks/__helpers/hook-registry.ts`
- Created: `src/hooks/scripts/pre-step-enforcement.ts`
