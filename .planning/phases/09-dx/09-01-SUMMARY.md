# 09-01 Summary: CLI Error Messages

**Plan:** 09-01-PLAN.md — Actionable Errors for init, update, and version-check
**Status:** COMPLETE
**Date:** 2026-02-10

## Tasks Completed

### Task 1: Fix non-actionable "Installation failed" error (DX-001 HIGH)
**File:** `packages/luca-framework/src/commands/init.ts` (line ~91)
**Before:** `logger.error('Installation failed')` — no reason, no recovery steps
**After:** Includes `result.error` message, plus recovery guidance (check permissions, disk space, re-run init, report bug)

### Task 2: Fix raw exception in config file error (DX-002 MEDIUM)
**File:** `packages/luca-framework/src/commands/init.ts` (line ~66)
**Before:** `Failed to read config file: ${error}` — dumps raw exception object
**After:** Extracts clean error message via `error instanceof Error ? error.message : String(error)`, includes the config file path, and provides guidance on file existence, JSON validity, schema format, and usage example

### Task 3: Add reinitialize guidance to existing project error (DX-003 LOW)
**File:** `packages/luca-framework/src/commands/init.ts` (lines ~51-55)
**Before:** Says "Luca is already installed" with only `npx luca update` suggestion
**After:** Provides two clear paths: (1) update with `npx luca update`, (2) reinitialize from scratch with `rm -rf .planning/ .cursor/luca/ && npx luca init`

### Task 4: Make conflicting flags error actionable (DX-004 MEDIUM)
**File:** `packages/luca-framework/src/commands/update.ts` (lines ~354-356)
**Before:** `Cannot use both --accept-theirs and --accept-mine` — no explanation of what each does
**After:** Describes each flag: `--accept-theirs` overwrites local changes, `--accept-mine` keeps local changes; also suggests omitting both for interactive resolution

### Task 5: Add recovery guidance to update failure error (DX-005 MEDIUM)
**File:** `packages/luca-framework/src/commands/update.ts` (lines ~477-486)
**Before:** Shows error message and restores backup, but no next steps
**After:** Confirms files were restored, then provides 3 recovery steps: (1) run `npx luca doctor`, (2) run `npx luca update --dry-run`, (3) report a bug with link

### Task 6: Fix misleading update notification message (DX-008 LOW)
**File:** `packages/luca-framework/src/utils/version-check.ts` (line ~55)
**Before:** `Run: npx luca update` — misleading because `luca update` updates project files, not the CLI
**After:** Distinguishes CLI update (`npm install -g luca-framework@latest`) from project file update (`npx luca update`)

## Error Message Pattern

All error messages now follow the pattern:
1. **What failed** — clear description of the error
2. **Why** — the underlying cause/reason
3. **What to do next** — actionable recovery steps

## Test Results

- **433 tests pass** (no regressions introduced)
- **6 pre-existing failures** in `doctor.test.ts` and `config-validation.test.ts` (unrelated to this plan)

## Files Modified

| File | Tasks |
|------|-------|
| `packages/luca-framework/src/commands/init.ts` | 1, 2, 3 |
| `packages/luca-framework/src/commands/update.ts` | 4, 5 |
| `packages/luca-framework/src/utils/version-check.ts` | 6 |
