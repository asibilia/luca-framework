---
phase: 06
plan: 04
type: improvement
autonomous: false
wave: 4
depends_on: ["06-03"]
---

# Phase 06 Plan 04: Remove Deprecated Step-Activation Fields and Final Validation

## Objective

Remove the deprecated step-activation fields from `ComplexityGateSchema` and `DEFAULT_COMPLEXITY_MATRIX`, clean up the `StepActivationSchema` that is no longer needed, and perform a comprehensive validation sweep to confirm the entire model-routing redesign is complete and coherent.

This is the final cleanup plan. It removes the backward-compatibility scaffolding now that all consumers have been migrated.

## Context

@src/complexity/**schemas/complexity.schemas.ts
@src/complexity/**helpers/defaults.ts
@src/complexity/index.ts
@src/complexity/**helpers/model-routing.ts
@src/agents/**helpers/resolve-model.ts
@src/skills/general/phase-execute.skill.ts
@src/skills/general/phase-plan.skill.ts
@src/skills/general/autopilot.skill.ts

## Tasks

### 1. Remove Deprecated Fields from ComplexityGateSchema

**Type:** auto
**TDD:** false
**Depends on:** none

Remove these deprecated fields from `ComplexityGateSchema`:

- `research` (StepActivationSchema)
- `discussion` (StepActivationSchema)
- `codeReviewAgents` (z.array(z.string()))
- `uat` (StepActivationSchema)
- `learningCapture` (z.enum([...]))

Keep these non-deprecated fields:

- `cognitivePreflight` (still used for pre-flight depth)
- `planVerificationIterations` (still used for iteration count)
- `harnessFixIterations` (still used for harness loop count)
- `verifyFixIterations` (still used for verify loop count)
- `verificationMode` (still used for verification depth)
- `cognitionPromotions` (still used for tier promotion)
- `contextPromotions` (still used for context tier promotion)
- `default_model` (still used as gate-level fallback for model resolution)

If `StepActivationSchema` is no longer used by any field in the schema, remove it as well.

**Files to create/edit:**

- `src/complexity/__schemas/complexity.schemas.ts`

**Verification:**

- Deprecated fields removed from ComplexityGateSchema
- `StepActivationSchema` removed if unused
- `bunx --bun tsc --noEmit` passes (no consumers reference removed fields)

### 2. Remove Deprecated Fields from DEFAULT_COMPLEXITY_MATRIX

**Type:** auto
**TDD:** false
**Depends on:** 1

Remove the deprecated field values from every entry in `DEFAULT_COMPLEXITY_MATRIX`. Each gate object should only contain the non-deprecated fields listed in Task 1.

**Files to create/edit:**

- `src/complexity/__helpers/defaults.ts`

**Verification:**

- No deprecated fields in any matrix entry
- Matrix entries match the updated ComplexityGateSchema
- `bunx --bun tsc --noEmit` passes

### 3. Update Barrel Exports

**Type:** auto
**TDD:** false
**Depends on:** 1

Update `src/complexity/index.ts` to remove exports of `StepActivationSchema` and `StepActivation` type if they were removed in Task 1.

Check if any other domain imports `StepActivation` or `StepActivationSchema` and update those imports.

**Files to create/edit:**

- `src/complexity/index.ts`
- Any files that import removed exports (search with grep)

**Verification:**

- No broken imports
- Barrel exports only contain existing symbols
- `bunx --bun tsc --noEmit` passes

### 4. Comprehensive Grep Validation

**Type:** checkpoint:human-verify
**TDD:** false
**Depends on:** 1, 2, 3

Run a comprehensive search to confirm no remaining references to the old step-skipping system:

1. **Grep for removed field names:**
   - `grep -r "codeReviewAgents" src/` -- should find zero results (or only in deprecated code comments)
   - `grep -r "learningCapture" src/` -- should find zero results
   - `grep -r "StepActivation" src/` -- should find zero results

2. **Grep for skip-based complexity gating in skills:**
   - `grep -rn "skip.*TRIVIAL\|TRIVIAL.*skip\|skip.*SIMPLE\|SIMPLE.*skip" src/skills/` -- should find only flag-based skips (--skip-review, etc.), not complexity-based skips

3. **Grep for old matrix references:**
   - `grep -rn "gate\.research\|gate\.discussion\|gate\.uat\|gate\.codeReviewAgents\|gate\.learningCapture" src/` -- should find zero results

4. **Verify model routing references exist:**
   - `grep -rn "resolveModelForAgent\|MODEL_ROUTING_TABLE\|model_routing\|model_tier" src/` -- should find routing references in skills and agents

Present results for human verification.

**Files to create/edit:**

- None (validation only)

**Verification:**

- All greps return expected results
- Human confirms no stale references remain

### 5. Final Build and Drift Check

**Type:** auto
**TDD:** false
**Depends on:** 1, 2, 3, 4

Run the complete build and validation pipeline:

1. `bunx --bun tsc --noEmit` -- type check
2. `bun run build:all` -- rebuild all generated outputs
3. `bun run check:drift` -- verify no drift between source and generated

**Files to create/edit:**

- Generated files in `.claude/`, `.cursor/`, `.pi/` (via build)

**Verification:**

- All three commands pass without errors
- No drift between source and generated outputs

### 6. Update ROADMAP.md Phase 6 Status

**Type:** auto
**TDD:** false
**Depends on:** 5

Mark the Phase 6 todo as complete in `ROADMAP.md`:

Change:

```
- [ ] PLAN: Replace complexity gating with per-agent model routing (replace-complexity-gating)
```

To:

```
- [x] PLAN: Replace complexity gating with per-agent model routing (replace-complexity-gating)
```

Move the todo from pending to complete:

- Move `.planning/todos/pending/replace-complexity-gating-with-model-routing.md` to `.planning/todos/complete/`

**Files to create/edit:**

- `.planning/ROADMAP.md`
- `.planning/todos/pending/replace-complexity-gating-with-model-routing.md` (move to complete/)

**Verification:**

- ROADMAP shows Phase 6 todo as complete
- Todo file moved to complete directory

## Verification

- All deprecated fields removed from schemas and defaults
- No broken imports or type errors
- No stale references to old step-skipping system
- Complete build pipeline passes
- ROADMAP updated to reflect completion

## Success Criteria

- `ComplexityGateSchema` contains only non-deprecated, actively-used fields
- `DEFAULT_COMPLEXITY_MATRIX` is lean and contains only scaling parameters
- Zero references to removed fields in any source file
- Full build pipeline passes: tsc, build:all, check:drift
- ROADMAP and todo tracking updated
- Human has verified the grep validation results

## Output Specification

- Cleaned `src/complexity/__schemas/complexity.schemas.ts`
- Cleaned `src/complexity/__helpers/defaults.ts`
- Updated `src/complexity/index.ts` barrel
- Updated `.planning/ROADMAP.md`
- Moved todo to `.planning/todos/complete/`
- Regenerated `.claude/`, `.cursor/`, `.pi/` outputs
