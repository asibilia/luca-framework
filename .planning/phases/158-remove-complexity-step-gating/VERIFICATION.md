# Phase 158 Verification Report

**Phase Goal:** Remove complexity-based workflow step skipping — ALL workflow steps run at every complexity level. Complexity controls model tier + loop budgets only.

**Status:** PASSED

## Verification Checklist

### 1. StepActivation Type Removed "skip" Variant

**File:** `packages/luca-framework/src/state/utils/complexity-utils.ts`

**Result:** PASS

The `StepActivation` type now contains only:

- `"brief"` — Low-depth execution
- `"optional"` — User can choose
- `"run"` — Standard execution
- `"required"` — Must execute
- `"required+thorough"` — Must execute with extended scope

No "skip" variant in the type definition.

### 2. Removed "skip" Values from Complexity Matrix

**File:** `packages/luca-framework/src/state/defaults.ts`

**Result:** PASS

All complexity levels (TRIVIAL, SIMPLE, MODERATE, COMPLEX, CRITICAL) use activation values from the allowed set:

- `research`: "brief", "optional", "required"
- `discussion`: "brief", "optional", "run", "required"
- `uat`: "optional", "required", "required+thorough"
- `learningCapture`: "brief", "standard", "full", "full+debrief"

No "skip" values in the entire DEFAULT_COMPLEXITY_MATRIX.

### 3. Simplified Guard Functions to Always Run

**File:** `packages/luca-framework/src/state/guards.ts`

**Result:** PASS

Guard functions verified:

| Guard                    | Implementation                                          | Behavior                                |
| ------------------------ | ------------------------------------------------------- | --------------------------------------- |
| `shouldRunResearch`      | `return context.workflow_config.research !== false`     | Always runs unless explicitly disabled  |
| `shouldRunDiscussion`    | `return context.workflow_config.discussion !== false`   | Always runs unless explicitly disabled  |
| `shouldRunUAT`           | `return context.workflow_config.uat_required !== false` | Always runs unless explicitly disabled  |
| `shouldCaptureLearnings` | `return true`                                           | Always runs (every complexity level)    |
| `shouldRunCodeReview`    | Checks config override first, then spawns agents        | Always runs (agents vary by complexity) |
| `shouldRunLearning`      | Checks learning capture depth >= "standard"             | Depth-based, not complexity-based       |

All guards now default to true with config overrides as the only gating mechanism.

### 4. Removed Complexity-Based Pre-Mortem Skip

**File:** `src/skills/general/phase-discuss.skill.ts`

**Result:** PASS

**Pre-Mortem Section (lines 250-298):**

- Gate Check: Only checks `premortem_gate` config value
- Skip Conditions: Only skips if `PREMORTEM_GATE` is "false"
- No complexity-based conditions

**Appetite Declaration Section (lines 190-248):**

- TRIVIAL/SIMPLE use auto-inference (no skip)
- MODERATE+ prompt for developer choice (no skip)
- All complexity levels declare appetite and run pre-mortem if gate enabled

No complexity-based skip conditions found anywhere in the skill.

### 5. TypeScript Compilation

**Command:** `bunx --bun tsc --noEmit`

**Result:** PASS (0 errors)

TypeScript compiler passes without errors. All type changes are correctly reflected in the codebase.

## Changes Summary

### Removed

- `"skip"` from `StepActivation` type union
- All `"skip"` activation values from complexity matrix
- Complexity-based conditional skipping in `phase-discuss` pre-mortem logic
- `shouldActivate` helper function (no longer needed)

### Simplified

- `shouldRunResearch`: Removed complexity check, kept config override
- `shouldRunDiscussion`: Removed complexity check, kept config override
- `shouldRunUAT`: Removed complexity check, kept config override
- `shouldCaptureLearnings`: Now always returns true
- All guards now follow "always-run unless config disables" pattern

### Confirmed

- Model tier resolution via routing table (separate concern, unchanged)
- Iteration count scaling per complexity (separate concern, unchanged)
- Config-based overrides still work for all steps
- Phase-discuss still gates pre-mortem on config and signal rate (not complexity)

## Architectural Implications

**Before:** Steps were skipped entirely at TRIVIAL/SIMPLE complexity
**After:** All steps run at all complexity levels, with:

- **Depth/scope** controlled by `StepActivation` values (brief/optional/run/required)
- **Model tier** controlled by `MODEL_ROUTING_TABLE` (haiku/sonnet/opus)
- **Loop budgets** controlled by iteration count matrix (plan verification, harness fix, etc.)
- **Config overrides** respected (still allow explicit disable via workflow_config)

This aligns with `.claude/rules/complexity-gating.md` which states:

> "ALL workflow steps run at every complexity level. Complexity no longer gates step activation -- it controls **model tier** (via the routing table below) and **iteration counts**."

## Related Files Verified

- ✅ `packages/luca-framework/src/state/defaults.ts` — No skip values
- ✅ `packages/luca-framework/src/state/guards.ts` — Guards default to true
- ✅ `packages/luca-framework/src/state/utils/complexity-utils.ts` — StepActivation type clean
- ✅ `src/skills/general/phase-discuss.skill.ts` — No complexity-based skip in pre-mortem
- ✅ `packages/luca-framework/src/state/types.ts` — Types reflect changes
- ✅ `packages/luca-framework/src/state/machine.ts` — Action definitions unchanged (skip_reason is for transition reasons, not step activation)

## Conclusion

Phase 158 goal has been successfully achieved. The workflow system now enforces:

1. ALL workflow steps run at every complexity level (no skip activation)
2. Complexity controls model tier and iteration loop budgets only
3. Config-based overrides remain the only way to disable steps
4. TypeScript compilation passes with 0 errors

**Verification Result:** PASSED
