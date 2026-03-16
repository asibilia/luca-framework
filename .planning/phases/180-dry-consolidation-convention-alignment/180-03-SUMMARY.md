# Phase 180 Plan 03 — Complex Refactors

## Status: PARTIAL (1 of 4 tasks applicable)

## Execution Summary

Phase 180 Plan 03 targeted four refactoring tasks. After thorough codebase analysis,
only Task 2 had actionable work -- the other three tasks referenced functions and
patterns that no longer exist in the current codebase.

## Task Results

### Task 1: Migrate init.ts from node:fs to Bun.file/Bun.write (DRY-5)

**Status:** SKIPPED (already complete)

The plan targeted `readFileSync`/`writeFileSync` calls in
`packages/luca-framework/src/commands/init.ts` and `packages/luca-framework/src/utils/files.ts`.
Analysis found zero `readFileSync`/`writeFileSync` calls remaining in
`packages/luca-framework/src/` -- `files.ts` already uses `Bun.file()`/`Bun.write()`
and `node:fs/promises` async APIs. The migration was completed in a prior phase.

Note: `readFileSync`/`writeFileSync` DO still exist in `src/hooks/scripts/` and
`src/hooks/__helpers/hook-io.ts`, but these are intentionally synchronous for
hook dedup/throttle guards that run as separate processes.

### Task 2: Emit build-time hook registry JSON artifact (COMPLEXITY-1)

**Status:** COMPLETED
**Commit:** 61505e66

Created `scripts/generate-hooks-registry-json.ts` that:

- Imports `resolveCanonicalRegistry` from `src/hooks/__helpers/hook-registry`
- Serializes the resolved canonical hook registry to `dist/hooks-registry.json`
- Exposes `generateHooksRegistryJson()` for programmatic use

Wired into `scripts/build-all.ts` as step 8 (after build manifest), imported as
a function call rather than a subprocess.

### Task 3: Refactor executeGlobalUpdate() into composable helpers (COMPLEXITY-2)

**Status:** SKIPPED (target function does not exist)

The plan targeted `executeGlobalUpdate()` in `global-update.ts`. No such function
or file exists in the current codebase. The closest equivalent is the `updateCommand`
in `packages/luca-framework/src/commands/update.ts`, which is already well-structured
with extracted helpers (`collectTemplateFiles`, `collectHarnessFiles`, `applyUpdates`,
`handleConflicts`, etc.).

### Task 4: Refactor runDeployStep() into composable helpers (COMPLEXITY-3)

**Status:** SKIPPED (target function does not exist)

The plan targeted `runDeployStep()` in `init.ts`. No such function exists. The init
pipeline uses `generateFiles()` in `packages/luca-framework/src/utils/files.ts`,
which is already a single well-structured function. There is no monolithic deploy
loop to extract.

## Deviations

- [Plan Gap] 3 of 4 tasks referenced functions/files that do not exist in the
  current codebase. The plan was likely written against a projected state or an
  earlier version. Only Task 2 (hook registry JSON) had real work.

## Files Modified

- `scripts/generate-hooks-registry-json.ts` (NEW) -- hook registry JSON generator
- `scripts/build-all.ts` -- added import and step 8 invocation

## Verification

- `bunx --bun tsc --noEmit` passes (no new type errors; pre-existing errors in
  `packages/luca-observer/` are unrelated)
