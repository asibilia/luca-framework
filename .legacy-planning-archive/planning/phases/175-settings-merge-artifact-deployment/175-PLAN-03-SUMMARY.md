# Phase 175 Plan 3 Summary: Integration & Init Wiring

## Objective

Wire the new library functions (from Plans 1-2) into `deploy-global.ts` and the `luca init` CLI flow, replacing inline merge/manifest logic with calls to the modular library.

## Tasks Completed

### Task 1: Implement conflict prompt UI

- **File created:** `packages/luca-framework/src/utils/conflict-prompt.ts`
- **Commit:** `43b19414` -- feat(cli): add interactive conflict resolution prompt for settings merge
- Implemented `promptConflictResolution()` using `@clack/prompts` select
- Three resolution options: keep-existing, replace-with-luca, keep-both
- Non-interactive fallback (CI/piped stdin) defaults all conflicts to "keep-both"
- Handles Ctrl+C cancellation gracefully (defaults remaining to keep-both)

### Task 2: Refactor deploy-global.ts to use library functions

- **File modified:** `scripts/deploy-global.ts`
- **Commit:** `bbd089df` -- feat(cli): refactor deploy-global.ts to use modular library functions
- Replaced `mergeSettings()` with three-tier merge flow:
  - `ensureLucaHome()` for directory creation
  - `backupSettings()` + `rotateBackups()` before settings modification
  - `generateClaudeHooksConfigFromCanonical()` for proposed hooks generation
  - `computeMergeActions()` to diff existing vs proposed
  - `promptConflictResolution()` for conflict UI
  - `applyMerge()` to produce final merged settings
- Replaced `writeManifest()` with `createDeployManifest()` + `writeDeployManifest()`
- Eliminated all 3 hardcoded `lucaScripts` arrays (replaced with `getKnownLucaScripts()` and `isLucaHook()`)
- Updated `MANIFEST_PATH` from `~/.claude/.luca-deploy-manifest.json` to `~/.luca/manifests/deploy-manifest.json`
- Added deployed file tracking for accurate manifest creation
- Backward compat: old manifest location cleaned up on deploy, fallback read on remove

### Task 3: Wire deploy into luca init flow

- **File modified:** `packages/luca-framework/src/commands/init.ts`
- **Commit:** `ba8cce3c` -- feat(cli): wire artifact deployment into luca init flow
- Added Step 7: optional artifact deployment to `~/.claude/`
- Interactive prompt: "Deploy Luca agents, skills, hooks, and rules to ~/.claude/?"
- Added `--skip-deploy` flag to bypass the step
- Deploys agents, skills, hooks, rules, statusline with three-tier settings merge
- Includes backup, manifest writing, and wrapper path rewriting
- Shows deploy count in success summary

## Verification Results

| Check                                 | Result                                                   |
| ------------------------------------- | -------------------------------------------------------- |
| `bunx --bun tsc --noEmit`             | PASS (zero new errors)                                   |
| `--dry-run` executes cleanly          | PASS -- shows backup, merge analysis, manifest path      |
| `--dry-run` zero filesystem writes    | PASS -- no backup/manifest directories created           |
| No hardcoded `lucaScripts` arrays     | PASS -- `grep -r lucaScripts` returns zero               |
| Manifest path at `~/.luca/manifests/` | PASS                                                     |
| Backup before settings merge          | PASS                                                     |
| Three-tier merge actions logged       | PASS (3 auto-merge, 8 auto-skip, 4 conflicts in dry-run) |
| Non-interactive defaults to keep-both | PASS                                                     |

## Deviations

- **[Rule 2 - Missing Critical]** Added `fixCommandQuoting()` helper in deploy-global.ts because `generateClaudeHooksConfigFromCanonical()` produces commands with only an opening quote (the prefix includes `"dir`) but no closing quote. The helper appends the missing closing `"`.
- **[Rule 3 - Blocking]** The `rewriteWrapperPaths()` function was kept rather than removed because Phase 174 context-aware wrappers (`$LUCA_PACKAGE_ROOT`) were not actually implemented in the shell wrappers -- they still use `$(dirname "$0")/../../` relative paths. Keeping `rewriteWrapperPaths()` is necessary for global deploy to work.
- **[Rule 2 - Missing Critical]** In init.ts, implemented `buildProposedHooksFromDeployed()` with a static script-to-event mapping rather than importing from the canonical hook registry (which lives in `src/hooks/`, a monorepo build tier not importable from `packages/luca-framework/src/`). This maintains the module boundary rules while still providing correct hook registration. The `scripts/deploy-global.ts` uses the canonical registry directly since it runs from the monorepo root.

## Files Changed

| File                                                   | Action   | Lines     |
| ------------------------------------------------------ | -------- | --------- |
| `packages/luca-framework/src/utils/conflict-prompt.ts` | Created  | 157       |
| `scripts/deploy-global.ts`                             | Modified | +289/-277 |
| `packages/luca-framework/src/commands/init.ts`         | Modified | +538/-9   |
