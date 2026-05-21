---
phase: 269
plan: 1
type: fix
autonomous: true
wave: 1
---

# Phase 269: Audit P0 — Security & Integration Wiring

## Objective

Fix the 3 P0 blockers from the v9.0.0 milestone audit: shell injection vectors in the /lu orchestrator, budget matrix CLI wiring, and oversight gate wiring for drift detection.

## Context

@src/skills/luca/lu.skill.ts
@packages/luca-framework/src/state/**helpers/budget-matrix.ts
@packages/luca-framework/src/state/**helpers/oversight-gate.ts

## Tasks

### Task 1: SEC-001 — Fix shell injection via $TASK_DESCRIPTION (type="auto")

**Location:** `src/skills/luca/lu.skill.ts` ~line 204

**Problem:** `$TASK_DESCRIPTION` is interpolated directly into a shell command argument. User-supplied task descriptions can contain shell metacharacters (`$(cmd)`, `` `cmd` ``, `; rm -rf /`, etc.) that execute arbitrary code.

**Fix:** Pass `$TASK_DESCRIPTION` via environment variable (`TASK_DESCRIPTION="$TASK_DESCRIPTION"`) so the child process reads it from `process.env.TASK_DESCRIPTION` instead of shell interpolation. The classify.ts CLI must read from env when `--description` is not provided.

**Verification:**

- [ ] `$TASK_DESCRIPTION` no longer appears inside shell command string interpolation
- [ ] Environment variable pattern is used instead (e.g., `TASK_DESCRIPTION="$TASK_DESCRIPTION" bun ...`)

### Task 2: SEC-002 — Fix shell injection via $HISTORY_JSON in bun -e heredoc (type="auto")

**Location:** `src/skills/luca/lu.skill.ts` ~lines 218-225

**Problem:** `$RAW_COMPLEXITY`, `$USER_OVERRIDE`, and `$HISTORY_JSON` are interpolated directly inside a `bun -e "..."` inline script. JSON strings containing single quotes, backslashes, or shell metacharacters break execution or enable injection.

**Fix:** Export the variables as environment variables and read them via `process.env.*` inside the bun -e script, matching the pattern already used elsewhere in the file (e.g., line 609+).

**Verification:**

- [ ] No `'$RAW_COMPLEXITY'`, `'$USER_OVERRIDE'`, or `'$HISTORY_JSON'` inside bun -e string literals
- [ ] Uses `process.env.RAW_COMPLEXITY`, `process.env.USER_OVERRIDE`, `process.env.HISTORY_JSON` instead

### Task 3: Wire budget-matrix.ts CLI into lu.skill.ts (type="auto")

**Location:** `src/skills/luca/lu.skill.ts` — after Step 4 (TOKEN_PROFILE resolution)

**Problem:** The orchestrator has pseudocode comments for loop budget initialization but no actual CLI call to `budget-matrix.ts`. Loop budget variables (HARNESS_FIX_ITERATIONS, etc.) are mentioned but never initialized from the budget matrix.

**Fix:** Add actual `bun packages/luca-framework/src/state/__helpers/budget-matrix.ts` CLI call with `--complexity` and `--profile` args. Parse the JSON output to set HARNESS_FIX_ITERATIONS, MAX_IMPL_ITERATIONS, REVIEW_FIX_ITERATIONS, MAX_FILES_PER_TASK, MAX_TASKS_PER_WAVE.

**Verification:**

- [ ] Budget matrix CLI call present after TOKEN_PROFILE resolution
- [ ] All 5 budget variables extracted from CLI output
- [ ] Fallback defaults provided (|| echo "2", etc.)

### Task 4: Wire oversight-gate.ts into drift response (type="auto")

**Location:** `src/skills/luca/lu.skill.ts` — Step 7o-drift, ~line 928

**Problem:** The drift response block uses `OVERSIGHT_LEVEL == "autonomous"` which is an undefined variable. Should use the oversight-gate.ts CLI to evaluate the `drift_detected` decision point.

**Fix:** Replace the raw string comparison with an `oversight-gate.ts` CLI call that evaluates `drift_detected` for the current oversight mode and token profile. Use the returned `action` field to decide behavior.

**Verification:**

- [ ] `OVERSIGHT_LEVEL` reference removed from drift response block
- [ ] `oversight-gate.ts` CLI call present with `--decision=drift_detected`
- [ ] `$DRIFT_ACTION` used instead of raw string comparison

## Success Criteria

- All 4 fixes applied to `src/skills/luca/lu.skill.ts`
- No shell injection vectors remain in the fixed areas
- `bunx --bun tsc --noEmit` passes
- All budget matrix fields wired into orchestrator
- Drift response uses typed oversight gate evaluation
