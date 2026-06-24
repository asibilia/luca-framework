# Phase 158 Summary — Remove Complexity Step Gating

**Executed:** 2026-03-14T17:45:54Z
**Duration:** ~5 minutes
**Status:** Complete
**Branch:** 77--v4.5-platform-simplification-proactive-intelligence

## Objective

Remove all `"skip"` values from the workflow activation matrix and simplify guard functions so that every workflow step runs at every complexity level.

## Tasks Completed

### Task 1: Update defaults.ts — replace "skip" values and fix type union

**Files modified:**

- `packages/luca-framework/src/state/utils/complexity-utils.ts`
- `packages/luca-framework/src/state/defaults.ts`

**Changes:**

- Removed `"skip"` from `StepActivation` type union; added `"brief"` in its place
- New union: `"brief" | "optional" | "run" | "required" | "required+thorough"`
- Removed `"skip"` from `ComplexityGate.learningCapture` type union
- New union: `"brief" | "standard" | "full" | "full+debrief"`
- Updated `DEFAULT_COMPLEXITY_MATRIX` TRIVIAL entry:
  - `research`: `"skip"` → `"brief"`
  - `discussion`: `"skip"` → `"brief"`
  - `uat`: `"skip"` → `"optional"`
  - `learningCapture`: `"skip"` → `"brief"`
  - `codeReviewAgents`: `[]` → `["code-simplifier"]`
- Updated `DEFAULT_COMPLEXITY_MATRIX` SIMPLE entry:
  - `research`: `"skip"` → `"brief"`
  - `discussion`: `"skip"` → `"brief"`
  - `uat`: `"skip"` → `"optional"`
  - `codeReviewAgents`: `[]` → `["code-simplifier"]`

**Commit:** e29a4fc1

### Task 2: Simplify guards.ts — always-on step guards

**Files modified:**

- `packages/luca-framework/src/state/guards.ts`

**Changes:**

- `shouldRunResearch`: returns `true` unless `context.workflow_config.research === false`
- `shouldRunDiscussion`: returns `true` unless `context.workflow_config.discussion === false`
- `shouldRunUAT`: returns `true` unless `context.workflow_config.uat_required === false`
- `shouldCaptureLearnings`: always returns `true` (every level captures learnings)
- Removed `shouldActivate` helper (was only used to check for `"skip"`, no longer needed)
- Removed `StepActivation` import (unused after removing `shouldActivate`)
- Updated `shouldRunLearning` comment to remove stale `"skip"` reference

**Commit:** e29a4fc1 (same commit as Task 1, since Tasks 1+2 were committed together for a clean typecheck)

### Task 3: Remove complexity-based pre-mortem gate from phase-discuss.skill.ts

**Files modified:**

- `src/skills/general/phase-discuss.skill.ts`

**Changes:**

- Removed "Complexity is TRIVIAL or SIMPLE" bullet from Skip Conditions
- Pre-mortem now runs at all complexity levels when `PREMORTEM_GATE` is enabled
- Updated step 7.75 reference: "MODERATE+ and gate enabled" → "gate enabled"
- Updated step 10.75a reference: "MODERATE+ and gate enabled" → "gate enabled"
- Updated Success Criteria: "completed (MODERATE+) or skipped (TRIVIAL/SIMPLE)" → "completed or skipped (gate disabled)"
- Updated self-tuning auto-skip note: removed "(MODERATE+)" qualifier from sample count condition text

**Commit:** 6306e5a6

## Verification Results

```
bunx --bun tsc --noEmit   # exit 0 — no errors
grep -r '"skip"' packages/luca-framework/src/state/  # no matches
```

Both checks passed cleanly.

## Deviations

None. All changes matched the plan specification exactly.
