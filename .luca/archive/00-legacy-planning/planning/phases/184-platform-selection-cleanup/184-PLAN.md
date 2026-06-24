---
phase: 184
plan: 1
type: improvement
autonomous: true
wave: 1
depends_on: []
---

# Phase 184 Plan 1: Platform Selection Cleanup

## Objective

Remove Cursor and Pi platform options from the wizard, presets, file generation, and type definitions so that Claude is the sole supported harness platform. This eliminates dead code paths and simplifies the init flow for users who will only ever use Claude Code.

## Context

@packages/luca-framework/src/utils/wizard.ts
@packages/luca-framework/src/utils/presets.ts
@packages/luca-framework/src/utils/files.ts
@packages/luca-framework/src/types.ts
@.planning/phases/184-platform-selection-cleanup/184-CONTEXT.md

## Tasks

### 1. Remove platform multiselect from wizard and hardcode Claude

**Type:** auto
**TDD:** false
**Depends on:** none

Remove the harness multiselect prompt (lines 158-172) from `runWizard()` in wizard.ts and hardcode `harnesses: ["claude"]` in the returned config. Also update:

- `VALID_HARNESSES` constant: reduce to `["claude"]` only
- `DEFAULT_HARNESSES` constant: change to `["claude"]` only
- `createConfigFromArgs()`: the `--harness` argument validation should only accept `"claude"`; simplify accordingly
- `loadConfigFromFile()`: the harness parsing should default to `["claude"]` and only validate against `["claude"]`

**Files to create/edit:**

- `packages/luca-framework/src/utils/wizard.ts`

**Verification:**

- `VALID_HARNESSES` contains only `"claude"`
- `DEFAULT_HARNESSES` contains only `["claude"]`
- `runWizard()` no longer prompts for harness selection
- `createConfigFromArgs()` rejects `--harness=cursor` and `--harness=pi`
- `loadConfigFromFile()` defaults to `["claude"]`
- `bunx --bun tsc --noEmit` passes

### 2. Update preset defaults to Claude-only

**Type:** auto
**TDD:** false
**Depends on:** none

In presets.ts, update all three preset definitions:

- `starter`: harnesses already `["claude"]` -- no change needed, but verify
- `standard`: change harnesses from `["claude", "cursor"]` to `["claude"]`; update description from "Claude + Cursor" to "Claude Code"
- `full`: change harnesses from `["claude", "cursor", "pi"]` to `["claude"]`; update description from "All harnesses" to "Claude Code"

**Files to create/edit:**

- `packages/luca-framework/src/utils/presets.ts`

**Verification:**

- All three presets have `harnesses: ["claude"]`
- Preset descriptions no longer mention Cursor or Pi
- `bunx --bun tsc --noEmit` passes

### 3. Remove non-Claude directory creation and hook installation from generateFiles

**Type:** auto
**TDD:** false
**Depends on:** none

In files.ts, remove all code paths that create or install to `.cursor/` and `.pi/` directories:

- **Step 1 (directories):** Remove the `if (harnesses.includes("cursor"))` block (lines 182-189) and the `if (harnesses.includes("pi"))` block (lines 196-198). Keep only the `.claude` directory creation.
- **Step 4 (framework files):** Remove the entire `if (harnesses.includes("cursor"))` block (lines 319-339) that copies framework templates to `.cursor/luca/`.
- **Step 4.6 (Cursor hooks):** Remove the entire `if (harnesses.includes("cursor"))` block (lines 426-482) that installs Cursor hooks.
- **Step 4.7 (harness templates):** The loop `for (const harnessId of harnesses)` (line 494) will naturally only iterate over `"claude"` since presets and defaults are now Claude-only. The `harnessDestDir` uses `.${harnessId}` which correctly targets `.claude`. No change needed here, but verify the `cursor` and `pi` template directories are already absent (confirmed: only `claude/` exists in `templates/harness/`).
- **Update comments** in the JSDoc to remove references to `.cursor/` directories.

**Files to create/edit:**

- `packages/luca-framework/src/utils/files.ts`

**Verification:**

- No references to `.cursor/` directory creation remain in generateFiles
- No references to `.pi/` directory creation remain in generateFiles
- No Cursor hook installation code remains
- JSDoc comments are updated
- `bunx --bun tsc --noEmit` passes

### 4. Narrow HarnessId type to Claude-only

**Type:** auto
**TDD:** false
**Depends on:** 1, 2, 3

In types.ts, narrow the `HarnessId` type:

- Change `export type HarnessId = "claude" | "cursor" | "pi"` to `export type HarnessId = "claude"`
- Update the `harnesses` JSDoc comment on `LucaManifest` to remove the backward-compat note about defaulting to `['claude', 'cursor']`
- Verify no remaining code references `"cursor"` or `"pi"` as `HarnessId` values

After this change, run `bunx --bun tsc --noEmit` to catch any remaining references to removed harness IDs that would now be type errors.

**Files to create/edit:**

- `packages/luca-framework/src/types.ts`

**Verification:**

- `HarnessId` type is `"claude"` only
- `bunx --bun tsc --noEmit` passes with no errors
- No string literals `"cursor"` or `"pi"` remain in wizard.ts, presets.ts, files.ts, or types.ts

## Verification

1. Run `bunx --bun tsc --noEmit` from repo root -- must pass with zero errors
2. Grep for `cursor` and `pi` in the four target files -- must return zero hits (excluding comments explaining the removal)
3. Verify `VALID_HARNESSES` and `DEFAULT_HARNESSES` exports only contain `"claude"`
4. Verify all three presets in `PRESETS` have `harnesses: ["claude"]`

## Success Criteria

- The wizard no longer prompts for harness platform selection
- All preset defaults use `["claude"]` as the sole harness
- `generateFiles()` creates no `.cursor/` or `.pi/` directories
- The `HarnessId` type is narrowed to `"claude"` only
- TypeScript compilation passes with no errors
- No functional regression in the init flow for Claude-only installations

## Output Specification

Modified files:

- `packages/luca-framework/src/utils/wizard.ts` -- multiselect removed, constants narrowed
- `packages/luca-framework/src/utils/presets.ts` -- preset harness arrays and descriptions updated
- `packages/luca-framework/src/utils/files.ts` -- Cursor/Pi directory and hook code removed
- `packages/luca-framework/src/types.ts` -- HarnessId type narrowed
