# Plan 11-04 Summary: Shell Injection Fixes & Shared Hook Library

## Objective

Fix shell injection vulnerability where `$PROJECT_DIR` is interpolated directly into `bun -e` JavaScript strings, and extract duplicated shell functions into a shared `_lib/common.sh` library sourced by all hook scripts. Extend the build pipeline to copy `_lib/` to all output directories.

## Tasks Completed

### Task 1: Create shared hook library `_lib/common.sh`

- **Commit:** `dcc94288`
- Created `src/hooks/scripts/_lib/common.sh` with three shared functions:
  - `run_bridge()` -- cascading bridge lookup (previously duplicated in 6 scripts)
  - `read_runtime()` -- runtime detection from config.json (previously duplicated in 3 scripts)
  - `read_session_id()` -- safe session ID extraction using `process.env.HOOK_STATE_FILE` instead of `$PROJECT_DIR` interpolation (fixes injection in 5 occurrences across 4 scripts)

### Task 2: Fix shell injection in hook scripts and source shared library

- **Commit:** `5be23fa9`
- Updated all 9 hook scripts to source `_lib/common.sh`
- Removed 6 inline `run_bridge()` definitions
- Removed 3 inline `read_runtime()` definitions
- Replaced 5 inline `bun -e` session ID extraction blocks (with `$PROJECT_DIR` injection) with `read_session_id()` calls
- Net change: 71 lines added, 243 lines removed (significant DRY improvement)

### Task 3: Fix Pi hook-handlers.ts shell command injection

- **Commit:** `2ddc6015`
- Added `shellEscape()` helper function that wraps values in single quotes with proper escaping
- Applied to all `runShellCommand()` calls that interpolate file paths: `filePath`, `driftScript`, `bridgePath`
- TypeScript type check passes cleanly

### Task 4: Extend build pipeline to copy `_lib/` directory

- **Commit:** `38d25b05`
- Updated `generateHookOutputs()` in `scripts/build-shared.ts` to copy `_lib/common.sh` to:
  - `.claude/hooks/_lib/`
  - `.cursor/hooks/_lib/`
  - `.pi/hook-scripts/_lib/`
  - `dist/plugin/scripts/_lib/`
- TypeScript type check passes cleanly

## Files Changed

### New files

- `src/hooks/scripts/_lib/common.sh` -- shared hook library

### Modified files (hook scripts)

- `src/hooks/scripts/context-check-throttled.sh`
- `src/hooks/scripts/context-monitor.sh`
- `src/hooks/scripts/post-edit-format.sh`
- `src/hooks/scripts/post-edit-typecheck.sh`
- `src/hooks/scripts/pre-commit-drift-check.sh`
- `src/hooks/scripts/pre-commit-gate.sh`
- `src/hooks/scripts/session-persist.sh`
- `src/hooks/scripts/session-start.sh`
- `src/hooks/scripts/snapshot-sync.sh`

### Modified files (TypeScript)

- `src/hooks/pi-extensions/__helpers/hook-handlers.ts` -- added `shellEscape()` helper
- `scripts/build-shared.ts` -- extended `generateHookOutputs()` for `_lib/` copy

## Verification Results

- `grep -rn 'run_bridge()' src/hooks/scripts/*.sh` -- 0 results (all inline definitions removed)
- All 9 scripts source `_lib/common.sh`
- No `$PROJECT_DIR` inside `bun -e` JS strings in any hook script
- `bunx --bun tsc --noEmit` passes cleanly

## Deviations

- **[Rule 2 - Missing Critical]** Applied `shellEscape()` to `driftScript` and `bridgePath` interpolations in hook-handlers.ts in addition to the `filePath` injection specified in the plan. These were additional shell injection vectors discovered during implementation.
- **Note:** `session-start.sh` has a `$PI_AUTH_FILE` interpolation inside a `bun -e` string (line 69) that follows the same injection pattern. This was not in scope for this plan but should be addressed in a follow-up.
