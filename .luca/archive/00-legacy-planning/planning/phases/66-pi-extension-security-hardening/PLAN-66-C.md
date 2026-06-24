---
id: PLAN-66-C
title: "MEDIUM-severity Protection Guards"
phase: 66
wave: 2
depends_on: ["PLAN-66-B"]
---

# PLAN-66-C: MEDIUM-severity Protection Guards

## Objective

Fix three MEDIUM-severity input validation issues identified in the v2.1.0 milestone audit. These are normalization and validation gaps that could allow bypasses of intended restrictions. This plan builds on the shared sanitization utilities created in PLAN-66-B (Task 5) and applies them to three additional Pi extensions.

## Context

@file src/hooks/pi-extensions/luca-roles.ts — The `tool_call` event handler (L203-218) enforces tool restrictions by comparing `event.toolName` against the active role's allowed tools list. Both sides use `.toLowerCase()` (L207, L210), but there is no trimming or normalization of whitespace, zero-width characters, or Unicode homoglyphs. An aliased tool name with leading/trailing whitespace or invisible characters could bypass the restriction check.

@file src/hooks/pi-extensions/luca-memory.ts — The `readPlanningFile()` function (L25-29) and the `luca_append_working` tool (L143-211) accept file paths derived from hardcoded constants (`brainPath`, `memoryPath`, `workingPath`). However, the `luca_read_memory` tool's `category` parameter (L70) is used for section matching via `line.toLowerCase().includes(params.category.toLowerCase())` — while this is not a direct path traversal, the `luca_append_working` tool's `section` parameter is checked against a hardcoded allowlist (L148-155), which is correct. The actual path traversal risk is if future changes allow user-specified file paths. Add a defensive `isWithinDirectory()` guard around all file read/write operations to prevent regressions.

@file src/hooks/pi-extensions/luca-purpose-gating.ts — The `luca_check_purpose` tool (L224-286) compares `params.context.toLowerCase()` against `allowed_contexts` entries (L253-254). The `luca_eligible_agents` tool (L311-352) does the same (L319-321). Neither normalizes whitespace, trims input, or handles edge cases like empty strings. The `inferPurpose()` function (L61-78) does string matching on agent names without normalization. These should all normalize inputs before comparison.

@file src/hooks/pi-extensions/\_\_helpers/sanitize.ts — Shared sanitization module created by PLAN-66-B Task 5 (dependency).

## Tasks

### Task 1: Normalize tool names in luca-roles.ts

**Goal:** Prevent tool restriction bypass via whitespace, invisible characters, or case variations in tool names.

**Files:** `src/hooks/pi-extensions/luca-roles.ts`

**Changes:**

- Add a `normalizeToolName(name: string): string` function (or import from shared sanitize module) that:
  - Trims leading/trailing whitespace
  - Removes zero-width characters (Unicode categories: `\u200B`, `\u200C`, `\u200D`, `\uFEFF`)
  - Converts to lowercase
  - Collapses internal whitespace to single spaces
- Apply `normalizeToolName()` in three locations:
  1. **Tool parsing** (L49): When reading tool names from frontmatter, normalize each tool name before storing in the `tools` array
  2. **Role activation** (L117): When looking up roles by name, normalize the lookup key
  3. **Enforcement** (L207-210): When comparing `event.toolName` against allowed tools in the `tool_call` handler — normalize both sides before comparison
- The current code already does `.toLowerCase()` on both sides (L207, L210). Replace these bare `.toLowerCase()` calls with the full `normalizeToolName()` to add trimming and invisible char stripping.

**Verification:**

- Test: tool name `" luca_verify "` (with spaces) matches allowed tool `"luca_verify"`
- Test: tool name `"luca\u200B_verify"` (with zero-width space) matches `"luca_verify"`
- Test: tool name `"LUCA_VERIFY"` matches `"luca_verify"` (existing behavior preserved)
- Test: tool not in allowed list is still blocked

### Task 2: Add path traversal guard in luca-memory.ts

**Goal:** Add a defensive `isWithinDirectory()` guard around all file system operations to prevent path traversal if future changes introduce user-controlled paths.

**Files:** `src/hooks/pi-extensions/luca-memory.ts`

**Changes:**

- Import or define an `isWithinDirectory(filePath: string, baseDir: string): boolean` function that:
  - Resolves both paths to absolute using `path.resolve()`
  - Checks that the resolved file path starts with the resolved base directory + `/`
  - Returns `false` for paths that escape the base directory
- Add the guard to `readPlanningFile()` (L25-29):
  - Before reading, verify `isWithinDirectory(filePath, planningDir)`
  - Return an error message if the path escapes the planning directory
- Add the guard to `luca_append_working` tool's write operations (L195 and L199 — there are two `writeFileSync` calls in the if/else branches):
  - Apply the guard once before the branching logic (~L179) so both write paths are covered
  - Verify `isWithinDirectory(workingPath, planningDir)` before any write
  - This is currently redundant (paths are hardcoded), but protects against future refactoring
- Add the function to the shared sanitize module (`src/hooks/pi-extensions/__helpers/sanitize.ts`) so other extensions can reuse it

**Verification:**

- Test: `isWithinDirectory("/project/.planning/BRAIN.md", "/project/.planning")` returns `true`
- Test: `isWithinDirectory("/project/.planning/../etc/passwd", "/project/.planning")` returns `false`
- Test: `isWithinDirectory("/etc/passwd", "/project/.planning")` returns `false`
- Test: all existing memory operations still work (hardcoded paths are within planningDir)
- Test: `luca_read_brain`, `luca_read_memory`, `luca_read_working` all still function correctly

### Task 3: Normalize purpose descriptions and contexts in luca-purpose-gating.ts

**Goal:** Normalize all string matching inputs in purpose gating to prevent bypasses via whitespace, empty strings, or case inconsistencies.

**Files:** `src/hooks/pi-extensions/luca-purpose-gating.ts`

**Changes:**

- Add a `normalizeContext(str: string): string` function (or import from shared sanitize module) that:
  - Trims leading/trailing whitespace
  - Converts to lowercase
  - Collapses internal whitespace to single space
  - Returns empty string for null/undefined inputs
- Apply `normalizeContext()` in the following locations:
  1. **`inferPurpose()`** (L61-78): The `name` variable is already lowercased (L62). Add trim. This is low-risk but ensures consistency.
  2. **`luca_register_purpose`** (L178-183): When parsing `allowed_contexts` from comma-separated string, normalize each context value after splitting
  3. **`luca_check_purpose`** (L252-254): Normalize `params.context` before comparing against `allowed_contexts`. Currently uses `.toLowerCase()` inline — replace with `normalizeContext()`.
  4. **`luca_eligible_agents`** (L319-321): Same pattern — normalize `params.context` before comparison
  5. **`autoDiscoverAgents()`** (L83-113): Contexts are hardcoded in `contextMap` so they are already clean, but normalizing the agent name before calling `inferPurpose()` ensures consistency
- Add empty string validation: if `params.context` is empty or whitespace-only after normalization, return an error rather than matching against `"any"`

**Verification:**

- Test: context `"  Research  "` (with spaces) matches agent with `allowed_contexts: ["research"]`
- Test: context `"EXECUTION"` matches agent with `allowed_contexts: ["execution"]`
- Test: empty context `"  "` returns an error, not a silent match
- Test: purpose inference for agent name `" lu-planner "` (with spaces) correctly returns `"planner"`
- All existing purpose gating functionality still works

## Success Criteria

- [ ] `luca-roles.ts` normalizes tool names (trim + invisible char removal + lowercase) before restriction checks
- [ ] `luca-memory.ts` has `isWithinDirectory()` guard on all file read/write operations
- [ ] `luca-purpose-gating.ts` normalizes context strings and validates against empty inputs
- [ ] `isWithinDirectory()` is added to the shared sanitize module for reuse
- [ ] Each fix has at least one corresponding test case
- [ ] All existing tests still pass: `bun test`
- [ ] Type checking passes: `bunx --bun tsc --noEmit`

## Verification

```bash
# Run all tests
bun test

# Type check
bunx --bun tsc --noEmit

# Verify normalizeToolName usage in roles
grep -c "normalizeToolName\|normalizeTool" src/hooks/pi-extensions/luca-roles.ts  # Expect >= 1

# Verify isWithinDirectory usage in memory
grep -c "isWithinDirectory" src/hooks/pi-extensions/luca-memory.ts  # Expect >= 1

# Verify normalizeContext usage in purpose-gating
grep -c "normalizeContext\|normalize" src/hooks/pi-extensions/luca-purpose-gating.ts  # Expect >= 1

# Verify shared sanitize module was updated with isWithinDirectory
grep -c "isWithinDirectory" src/hooks/pi-extensions/__helpers/sanitize.ts  # Expect >= 1

# Regenerate .pi/ outputs from source changes
bun run build:all --force
```
