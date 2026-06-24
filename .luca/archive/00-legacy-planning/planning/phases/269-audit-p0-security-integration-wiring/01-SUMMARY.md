---
phase: 269
plan: 1
status: complete
---

# Phase 269 Summary: Audit P0 — Security & Integration Wiring

## Outcome

All 4 P0 blockers from the v9.0.0 milestone audit have been fixed in `src/skills/luca/lu.skill.ts`.

## Fixes Applied

### Fix 1: SEC-001 — Shell injection via $TASK_DESCRIPTION (line 204)

**Before:** `bun src/complexity/__helpers/classify.ts --description="$TASK_DESCRIPTION" ...`
**After:** `TASK_DESCRIPTION="$TASK_DESCRIPTION" bun src/complexity/__helpers/classify.ts ...`

The task description is now passed as an environment variable prefix instead of being interpolated into the shell command string. The child process reads it from `process.env.TASK_DESCRIPTION`. This prevents shell metacharacters in user-supplied descriptions from being interpreted.

### Fix 2: SEC-002 — Shell injection via $HISTORY_JSON in bun -e heredoc (lines 218-226)

**Before:** Variables `$RAW_COMPLEXITY`, `$USER_OVERRIDE`, and `$HISTORY_JSON` were interpolated directly inside single quotes within a `bun -e "..."` inline script.
**After:** All three variables are exported as environment variables and read via `process.env.*` inside the bun -e script. This matches the established pattern already used in the harness fix loop (lines 609+).

### Fix 3: Budget matrix CLI wiring (after Step 4)

**Added:** A `bun packages/luca-framework/src/state/__helpers/budget-matrix.ts` CLI call between Step 4 (TOKEN_PROFILE resolution) and Step 4.5 (Git Workflow Setup). The call passes `--complexity=$COMPLEXITY --profile=$TOKEN_PROFILE` and parses the JSON output to initialize all 5 budget variables:

- `HARNESS_FIX_ITERATIONS`
- `MAX_IMPL_ITERATIONS`
- `REVIEW_FIX_ITERATIONS`
- `MAX_FILES_PER_TASK`
- `MAX_TASKS_PER_WAVE`

Fallback defaults (MODERATE/balanced) are provided via `|| echo` for all variables.

### Fix 4: Oversight gate wiring for drift response (Step 7o-drift)

**Before:** `IF OVERSIGHT_LEVEL == "autonomous"` (undefined variable, no typed gate evaluation)
**After:** Calls `oversight-gate.ts --decision=drift_detected --oversight=$OVERSIGHT_MODE --profile=$TOKEN_PROFILE` and uses the returned `$DRIFT_ACTION` ("auto_apply" vs "pause") to decide whether to auto-replan or flag for user review.

## Verification

- `bunx --bun tsc --noEmit` passes (0 errors)

## Deviations

None. All fixes were applied as specified.

## Files Modified

- `src/skills/luca/lu.skill.ts` — All 4 fixes
- `.planning/phases/269-audit-p0-security-integration-wiring/01-PLAN.md` — Plan file (created)
- `.planning/phases/269-audit-p0-security-integration-wiring/01-SUMMARY.md` — This file (created)
