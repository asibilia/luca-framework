# Plan 06-02 Summary: Migrate Skill Orchestrators from Step-Skipping to Always-Run with Model Routing

## Execution Info

- **Plan:** 06-02
- **Phase:** 06 — Model Routing Redesign
- **Wave:** 2
- **Started:** 2026-03-06T22:38:05Z
- **Completed:** 2026-03-06T22:52:00Z
- **Status:** COMPLETE

## Objective

Updated all skill orchestrators that previously skipped workflow steps based on complexity level to instead always run those steps with model tier resolved from the centralized routing table.

## Tasks Completed

### Task 1: Migrate phase-execute.skill.ts Learning Capture

- Replaced complexity-gated skip (TRIVIAL=Skip, SIMPLE=Brief) with always-run
- Learning capture now runs at all complexity levels with model tier from routing table
- TRIVIAL/SIMPLE use minimal context but still spawn lu-learner

### Task 2: Migrate phase-execute.skill.ts Code Review

- Removed "Skip if complexity is TRIVIAL or SIMPLE" gate
- All 5 reviewers (dx-advocate, code-simplifier, code-architect, performance-auditor, security-auditor) now always spawn
- Each reviewer resolves model tier from routing table (fast at TRIVIAL, capable at MODERATE+)
- `--skip-review` and `workflow.code_review: false` overrides preserved

### Task 3: Migrate phase-execute.skill.ts UAT

- Removed complexity-based skip for TRIVIAL/SIMPLE
- UAT now always runs with verification depth scaling via `verificationMode`
- `--skip-uat` and `workflow.uat_required: false` overrides preserved

### Task 4: Migrate phase-plan.skill.ts Research

- Removed "Research is skipped for TRIVIAL and SIMPLE"
- Research always runs with model tier from routing table
- `--skip-research` flag preserved

### Task 5: Migrate phase-plan.skill.ts Plan Verification

- Removed skip for TRIVIAL/SIMPLE
- Updated `planVerificationIterations`: TRIVIAL 0->1, SIMPLE 0->1
- Plan verification always runs with scaled iterations

### Task 6: Migrate phase-discuss.skill.ts

- Removed "TRIVIAL: Skip entirely" / "SIMPLE: Skip entirely"
- Discussion always runs with depth scaling (light/standard/extended/thorough)
- Model tier for lu-discuss-researcher resolved from routing table

### Task 7: Migrate verify.skill.ts Code Review

- Removed complexity-based skip for code review
- All reviewers always spawn with model tier from routing table
- Same pattern as Task 2

### Task 8: Migrate autopilot.skill.ts and lu.skill.ts

- autopilot: Removed discussion complexity gate (4d now always runs)
- autopilot: Updated learning capture description (4h) from skip-based to always-run
- autopilot: Updated sub-skill description from "MODERATE+ phases" to "all phases"
- lu.skill.ts: Removed learning capture skip for TRIVIAL/SIMPLE

### Task 9: Update DEFAULT_COMPLEXITY_MATRIX Deprecated Fields

- Set all `research` values to "run"
- Set all `discussion` values to "run"
- Set all `codeReviewAgents` to full reviewer list (5 reviewers at all levels)
- Set all `uat` values to "run" (CRITICAL stays "required+thorough")
- Set all `learningCapture` to minimum "standard" (never "skip" or "brief")
- Bumped TRIVIAL `planVerificationIterations` from 0 to 1
- Bumped SIMPLE `planVerificationIterations` from 0 to 1
- Bumped TRIVIAL `verifyFixIterations` from 0 to 1
- Replaced "tailwind-auditor" with "performance-auditor" in all reviewer lists

## Bonus: complexity-gating.rule.ts Update

- Updated the complexity-gating rule (referenced by .claude/rules/complexity-gating.md) to reflect the new always-run behavior
- Matrix now shows model tiers in parentheses instead of "Skip"
- "How to Apply" section updated to reference routing table instead of skip logic

## Deviations

- **[Rule 2 - Missing Critical]** Updated `complexity-gating.rule.ts` in addition to the planned files. This rule is the source that generates `.claude/rules/complexity-gating.md` and needed to reflect the always-run changes to prevent consumers from following stale skip logic.

## Verification

- `bunx --bun tsc --noEmit` passes with zero errors
- All changes are in TypeScript source files under `src/`
- No breaking changes to schemas (all new values are valid per existing Zod schemas)

## Files Modified

1. `src/skills/general/phase-execute.skill.ts` — Learning capture, code review, UAT
2. `src/skills/general/phase-plan.skill.ts` — Research, plan verification
3. `src/skills/general/phase-discuss.skill.ts` — Discussion gate
4. `src/skills/general/verify.skill.ts` — Code review
5. `src/skills/general/autopilot.skill.ts` — Discussion, learning capture
6. `src/skills/luca/lu.skill.ts` — Learning capture
7. `src/complexity/__helpers/defaults.ts` — DEFAULT_COMPLEXITY_MATRIX
8. `src/rules/general/complexity-gating.rule.ts` — Complexity gating rule
