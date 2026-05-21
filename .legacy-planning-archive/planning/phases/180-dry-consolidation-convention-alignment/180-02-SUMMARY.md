# Phase 180 Plan 02 Summary: Consumer Updates & Shared Deploy Module

## Outcome: COMPLETE

All three tasks executed successfully with zero type-check errors introduced.

## Tasks Completed

### Task 1: Extract shared deploy utilities (DRY-4)

**Commit:** `51f2eeec`

- Created `packages/luca-framework/src/utils/deploy-helpers.ts` with:
  - `copyDirForDeploy()` -- recursive directory copy with SEC-008 symlink traversal guard
  - `rewriteHookPaths()` -- shell wrapper path rewriting for global deploy context
  - `DeployedFileEntry` type exported for consumers
- Updated `init.ts`: removed inline `copyDirForDeploy` and `rewriteWrapperPathsForInit`, imported from shared module
- Updated `deploy-global.ts`: removed inline `copyDirRecursive` and `rewriteWrapperPaths`, imported from shared module
- CRITICAL: kept `dryRun` guard at call sites in `deploy-global.ts` (`if (!dryRun) rewriteHookPaths(...)`)
- Net: -183 lines duplicated, +183 lines shared (single source of truth)

### Task 2: Delegate vault-setup health check (DRY-2)

**Commit:** `65156559`

- Replaced inline `AbortController` + `fetch` in `verifyVaultConnection()` with single delegation to `checkMuninndbService()` from `muninndb-health.ts`
- Added import for `checkMuninndbService`
- Net: -19 lines inline, +11 lines delegated

### Task 3: Replace direct homedir() calls (ANTI-PATTERN-1)

**Commit:** `3c5d73b5`

- Extended `LucaHomePathsSchema` with `claudeGlobal: z.string()` field
- Updated `getLucaHomePaths()` to include `claudeGlobal: join(home, ".claude")`
- Updated four consumers to use `getLucaHomePaths().claudeGlobal`:
  - `init.ts`: `const { claudeGlobal: globalDir } = getLucaHomePaths()`
  - `reinit.ts`: same pattern
  - `global-update.ts`: two call sites updated
  - `doctor/checks/global-artifacts.ts`: same pattern
- Removed unused `import { homedir } from "node:os"` from all four files
- Did NOT change `luca-home.ts` or `runtime-context.ts` homedir() usage (source of truth)

## Deviations

None. All tasks completed as specified in the plan.

## Verification

- `bunx --bun tsc --noEmit` passes cleanly for all three commits (excluding pre-existing dist/plugin errors)
- Each commit is atomic and independently valid

## Files Changed

| File                                                                  | Change                                       |
| --------------------------------------------------------------------- | -------------------------------------------- |
| `packages/luca-framework/src/utils/deploy-helpers.ts`                 | **NEW** -- shared deploy utilities           |
| `packages/luca-framework/src/utils/luca-home.ts`                      | Extended schema + function                   |
| `packages/luca-framework/src/utils/vault-setup.ts`                    | Delegated health check                       |
| `packages/luca-framework/src/commands/init.ts`                        | Removed inline functions, use shared imports |
| `packages/luca-framework/src/commands/reinit.ts`                      | Use getLucaHomePaths().claudeGlobal          |
| `packages/luca-framework/src/utils/global-update.ts`                  | Use getLucaHomePaths().claudeGlobal          |
| `packages/luca-framework/src/utils/doctor/checks/global-artifacts.ts` | Use getLucaHomePaths().claudeGlobal          |
| `scripts/deploy-global.ts`                                            | Removed inline functions, use shared imports |
