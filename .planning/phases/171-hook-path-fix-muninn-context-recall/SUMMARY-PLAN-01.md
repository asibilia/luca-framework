# SUMMARY: Phase 171 Plan 1 — Fix Shell Wrapper Path Resolution in Global Deploy

## Result: COMPLETE

All three tasks executed successfully. Shell wrappers deployed to `~/.claude/hooks/` and `~/.claude/statusline.sh` will now contain absolute paths to the monorepo's `src/hooks/scripts/` directory, resolving the "Module not found" error that occurred when hooks ran outside the monorepo tree.

## Tasks Completed

### Task 1: Add path rewriting to deployHooks()

- **Commit:** `b984771e`
- **Change:** After each `.sh` file is deployed and made executable, the relative `$(dirname "$0")/../../src/hooks/scripts/` pattern is rewritten to use the absolute `projectRoot` path.

### Task 2: Add path rewriting to deployStatusline()

- **Commit:** `6fb6870f`
- **Change:** After the statusline wrapper is deployed and made executable, the relative `$(dirname "$0")/../src/hooks/scripts/` pattern is rewritten to the absolute `projectRoot` path.

### Task 3: Extract rewriteWrapperPaths() helper

- **Commit:** `5ddd74bc`
- **Change:** Extracted duplicated rewriting logic from both `deployHooks()` and `deployStatusline()` into a shared `rewriteWrapperPaths(targetPath, projectRoot)` helper function with full JSDoc documentation. Both deploy functions now call this helper.

## Key Implementation Details

- **Helper location:** `scripts/deploy-global.ts` line 89, `rewriteWrapperPaths()`
- **Pattern order:** The `../../` pattern is replaced before `../` to avoid partial matches (both start with `$(dirname "$0")/../`)
- **Dry-run safe:** The helper returns immediately when `dryRun` is true
- **No-op optimization:** File is only written back if the content actually changed
- **No modifications to `src/hooks/__helpers/generate-shell-wrappers.ts`** -- that file generates correct wrappers for the project-local case; this fix is deploy-time only

## Files Modified

- `scripts/deploy-global.ts` — Added `rewriteWrapperPaths()` helper and calls in `deployHooks()` and `deployStatusline()`

## Deviations

None.

## Verification

- TypeScript compiles cleanly (`bunx --bun tsc --noEmit` passes, excluding pre-existing dist/ error)
- `rewriteWrapperPaths()` exists with correct regex patterns
- Both deploy functions call the helper after file copy + chmod
- Dry-run mode is respected
- Pattern replacement order prevents partial matches
- `generate-shell-wrappers.ts` was not modified
