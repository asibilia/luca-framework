# PLAN-02 Summary: Detect Global Mode in vault:init and Skip Harness Generation

**Phase:** 183
**Plan:** 2
**Type:** bug
**Status:** Complete

## Objective

Fix `vault:init` deploying the full harness (agents, skills, rules, hooks) into the project directory when running from a global install. In global mode, `luca init` Step 3 already deploys the harness to `~/.claude/`. The `vault:init` command should only create `.planning/` config files in global mode.

## Tasks Completed

### Task 1: Add `planningOnly` option to `generateFiles()`

**File:** `packages/luca-framework/src/utils/files.ts`

- Added `planningOnly?: boolean` to the `generateFiles()` options parameter
- Gated harness directory creation (`.claude/`, `.cursor/`, `.pi/`) behind `!options.planningOnly` in Step 1
- Added filter to base template copying (Step 2) to only copy `.planning/` files when `planningOnly` is true -- this prevents `copyTemplates` from creating `.cursor/luca/` via its `mkdir(dirname(destPath))` call
- Added early return after Step 2.5 that creates the manifest and returns with zeroed-out `InstallationStats` (0 agents, 0 skills, 0 rules, 0 hooks, empty `harnesses_installed`)
- Updated JSDoc with `planningOnly` parameter documentation, two usage examples, and `@see detectRuntimeContext` reference

### Task 2: Import `detectRuntimeContext` and gate file generation

**File:** `packages/luca-framework/src/commands/vault-init.ts`

- Added import of `detectRuntimeContext` from `../utils/runtime-context`
- Added runtime mode detection at the top of `run()`: `const runtimeCtx = detectRuntimeContext(); const isGlobalMode = runtimeCtx.mode === "global";`
- Added info log before `generateFiles()` when in global mode
- Passed `planningOnly: isGlobalMode` to `generateFiles()`
- Updated success output to use conditional `harnessLine` that shows "deployed globally to ~/.claude/" in global mode vs the harness directory names in dev mode

### Task 3: Update vault-init.ts JSDoc

**File:** `packages/luca-framework/src/commands/vault-init.ts`

- Added "Runtime Mode Detection" section to the command JSDoc documenting:
  - Global mode: only `.planning/` config files created
  - Dev mode: full harness generated (existing behavior)
  - Detection is automatic via `detectRuntimeContext()`
- Added `@see detectRuntimeContext` reference

## Deviations

### [Rule 2 - Missing Critical] Base template filter for planningOnly mode

During self-review, discovered that `copyTemplates` creates destination directories via `mkdir(dirname(destPath), { recursive: true })`. The base templates include `.cursor/luca/.gitkeep`, so without filtering, `planningOnly` mode would still create `.cursor/luca/` in the project directory. Added a `filter` predicate to the base templates `copyTemplates` call that restricts to `.planning/` files when `planningOnly` is true.

## Verification

- `bunx --bun tsc --noEmit` passes (4 pre-existing errors in `dist/plugin/scripts/` unrelated to this change)
- Global mode: `planningOnly: true` creates only `.planning/` directory and config files, no `.claude/`, `.cursor/`, or `.pi/` directories
- Dev mode: `planningOnly: false` (or omitted) preserves existing behavior with full harness generation
- Vault wizard still runs in both modes (not affected by `planningOnly`)
- Success output correctly reflects what was created in each mode

## Files Modified

- `packages/luca-framework/src/utils/files.ts` -- `planningOnly` option, directory gating, base template filter, early return
- `packages/luca-framework/src/commands/vault-init.ts` -- runtime context detection, conditional generation, updated JSDoc and success output
