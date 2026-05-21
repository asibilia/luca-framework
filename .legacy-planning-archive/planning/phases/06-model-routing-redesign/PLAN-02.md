---
phase: 06
plan: 02
type: improvement
autonomous: true
wave: 2
depends_on: ["06-01"]
---

# Phase 06 Plan 02: Migrate Skill Orchestrators from Step-Skipping to Always-Run with Model Routing

## Objective

Update all skill orchestrators that currently skip workflow steps based on complexity level (TRIVIAL/SIMPLE skip research, discussion, code review, UAT, learning) to instead always run those steps but route their sub-agents to appropriate model tiers. This is the core behavioral change of the model routing redesign.

The migration pattern: where a skill currently says "if TRIVIAL/SIMPLE, skip code review", it should instead say "always run code review, but resolve the reviewer model tier from the routing table" -- at TRIVIAL the reviewer runs on haiku (fast, cheap), at CRITICAL it runs on opus (thorough, expensive).

## Context

@src/skills/general/phase-execute.skill.ts
@src/skills/general/phase-plan.skill.ts
@src/skills/general/verify.skill.ts
@src/skills/general/phase-discuss.skill.ts
@src/skills/general/autopilot.skill.ts
@src/skills/luca/lu.skill.ts
@src/complexity/**helpers/model-routing.ts
@src/agents/**helpers/resolve-model.ts

## Tasks

### 1. Migrate phase-execute.skill.ts Learning Capture

**Type:** auto
**TDD:** false
**Depends on:** none

Currently (lines 158-165): TRIVIAL skips lu-learner entirely, SIMPLE spawns with minimal context.

New behavior: Always spawn lu-learner. At TRIVIAL/SIMPLE, the routing table assigns "fast" tier (haiku), so the learner runs quickly with minimal depth. At COMPLEX/CRITICAL, it runs on "capable" tier with full context.

Remove the complexity-conditional skip. Replace with model resolution:

```
Resolve model tier for lu-learner at current complexity via resolveModelForAgent("lu-learner", complexity).
Always spawn lu-learner with the resolved model. Depth is determined by model capability, not by skipping.
```

Update the learning capture section to remove the TRIVIAL/SIMPLE skip table and add model routing guidance.

**Files to create/edit:**

- `src/skills/general/phase-execute.skill.ts`

**Verification:**

- No "skip" language for learning capture based on complexity
- Learning capture always runs with model tier from routing table
- `bunx --bun tsc --noEmit` passes

### 2. Migrate phase-execute.skill.ts Code Review

**Type:** auto
**TDD:** false
**Depends on:** none

Currently (lines 1229-1231): Code review skipped entirely for TRIVIAL/SIMPLE. At MODERATE+, spawns varying sets of reviewers.

New behavior: Always run code review. The set of reviewers is always the full set (dx-advocate, code-simplifier, code-architect, security-auditor, performance-auditor). Each reviewer resolves its model tier from the routing table. At TRIVIAL, reviewers run on "fast" (haiku) for quick surface-level review. At CRITICAL, they run on "capable" (opus) for deep review.

Remove:

- "Skip if: complexity is TRIVIAL or SIMPLE" language
- The complexity-conditional reviewer spawning matrix
- The `codeReviewAgents` gate reference

Replace with:

- Always spawn all reviewers with their per-agent resolved model
- Note that `--skip-review` flag and `workflow.code_review: false` config override still honored

**Files to create/edit:**

- `src/skills/general/phase-execute.skill.ts`

**Verification:**

- No complexity-based skip for code review
- All reviewers always spawn with model routing
- `--skip-review` and config override still work
- `bunx --bun tsc --noEmit` passes

### 3. Migrate phase-execute.skill.ts UAT

**Type:** auto
**TDD:** false
**Depends on:** none

Currently (lines 1596-1604): UAT skipped for TRIVIAL/SIMPLE, optional for MODERATE.

New behavior: Always run UAT. At TRIVIAL/SIMPLE, the verifier runs on "fast" model for a lightweight pass. At CRITICAL, it runs on "capable" with thorough verification. The `verificationMode` field (quick/standard/full/full+human) is NOT deprecated and still controls depth.

Remove:

- "Skip if: complexity is TRIVIAL or SIMPLE" for UAT
- The TRIVIAL/SIMPLE skip rows from the UAT table

Keep:

- `--skip-uat` flag and `workflow.uat_required: false` config override
- `verificationMode` scaling (quick at TRIVIAL, full+human at CRITICAL)

**Files to create/edit:**

- `src/skills/general/phase-execute.skill.ts`

**Verification:**

- No complexity-based skip for UAT
- UAT always runs with model routing
- `--skip-uat` still works
- `bunx --bun tsc --noEmit` passes

### 4. Migrate phase-plan.skill.ts Research

**Type:** auto
**TDD:** false
**Depends on:** none

Currently (lines 205-221): Research skipped for TRIVIAL/SIMPLE, optional for MODERATE, required for COMPLEX/CRITICAL.

New behavior: Research always runs. At TRIVIAL/SIMPLE, the researcher runs on "fast" model for lightweight discovery. At COMPLEX/CRITICAL, it runs on "capable" for deep research.

Remove:

- "Complexity gate: Research is skipped for TRIVIAL and SIMPLE"
- "If TRIVIAL or SIMPLE, skip to step 6"
- The skip rows from the research complexity table

Keep:

- `--skip-research` flag still works as explicit opt-out
- `--research` flag still works as explicit opt-in

**Files to create/edit:**

- `src/skills/general/phase-plan.skill.ts`

**Verification:**

- No complexity-based skip for research
- Research always runs with model routing
- `--skip-research` still works
- `bunx --bun tsc --noEmit` passes

### 5. Migrate phase-plan.skill.ts Plan Verification

**Type:** auto
**TDD:** false
**Depends on:** none

Currently (lines 411-421): Plan verification skipped entirely for TRIVIAL/SIMPLE. Iteration count scales with complexity.

New behavior: Plan verification always runs. At TRIVIAL, it runs 1 iteration on "fast" model. At CRITICAL, 3 iterations on "capable" model. The iteration count from the complexity matrix (`planVerificationIterations`) is NOT deprecated and still controls loop count.

Update: Set `planVerificationIterations` for TRIVIAL to 1 (was 0) and SIMPLE to 1 (was 0) in `DEFAULT_COMPLEXITY_MATRIX`.

**Files to create/edit:**

- `src/skills/general/phase-plan.skill.ts`
- `src/complexity/__helpers/defaults.ts` (update TRIVIAL/SIMPLE planVerificationIterations from 0 to 1)

**Verification:**

- No complexity-based skip for plan verification
- Plan verification always runs with at least 1 iteration
- `bunx --bun tsc --noEmit` passes

### 6. Migrate phase-discuss.skill.ts

**Type:** auto
**TDD:** false
**Depends on:** none

Currently (lines 66-78): Discussion skipped entirely for TRIVIAL/SIMPLE.

New behavior: Discussion always runs. At TRIVIAL/SIMPLE, the discuss-researcher runs on "fast" model for a brief context pass. At COMPLEX/CRITICAL, it runs on "capable" for deep discussion.

Remove:

- "TRIVIAL: Skip entirely" / "SIMPLE: Skip entirely" rows
- "DISCUSSION SKIPPED (TRIVIAL/SIMPLE)" message
- The early return for TRIVIAL/SIMPLE

**Files to create/edit:**

- `src/skills/general/phase-discuss.skill.ts`

**Verification:**

- No complexity-based skip for discussion
- Discussion always runs with model routing
- `bunx --bun tsc --noEmit` passes

### 7. Migrate verify.skill.ts Code Review

**Type:** auto
**TDD:** false
**Depends on:** none

Currently (line 174): Code review skipped for TRIVIAL/SIMPLE. Same pattern as phase-execute.

New behavior: Always run code review with model routing. Same approach as Task 2.

Remove:

- "Complexity gate: Code review runs at MODERATE and above. If complexity is TRIVIAL or SIMPLE, skip code review entirely"
- The complexity-conditional reviewer table

Replace with always-run + model routing guidance matching phase-execute.

**Files to create/edit:**

- `src/skills/general/verify.skill.ts`

**Verification:**

- No complexity-based skip for code review
- All reviewers always spawn with model routing
- `bunx --bun tsc --noEmit` passes

### 8. Migrate autopilot.skill.ts and lu.skill.ts

**Type:** auto
**TDD:** false
**Depends on:** none

autopilot.skill.ts:

- Line 725: Discussion skip based on complexity -- remove, discussion always runs
- Line 832-833: Learning capture TRIVIAL skip / SIMPLE brief -- remove, learning always runs with routing

lu.skill.ts:

- Line 140: TRIVIAL/SIMPLE may skip roadmap planning -- keep (this is a routing decision, not step-skipping)
- Line 188: TRIVIAL/SIMPLE skip learning capture -- remove, learning always runs with routing

**Files to create/edit:**

- `src/skills/general/autopilot.skill.ts`
- `src/skills/luca/lu.skill.ts`

**Verification:**

- No complexity-based step-skipping in autopilot or lu
- Model routing determines agent depth, not skip/run
- `bunx --bun tsc --noEmit` passes

### 9. Update DEFAULT_COMPLEXITY_MATRIX Deprecated Fields

**Type:** auto
**TDD:** false
**Depends on:** 1-8

Now that no skill consumers read the deprecated step-activation fields, update them to reflect the new always-run behavior. This is a documentation-level change to make the matrix consistent with reality.

In `src/complexity/__helpers/defaults.ts`, update `DEFAULT_COMPLEXITY_MATRIX`:

- All `research` values: set to "run" across all levels
- All `discussion` values: set to "run" across all levels
- All `codeReviewAgents` values: set to full reviewer list at all levels
- All `uat` values: set to "run" across all levels (except CRITICAL stays "required+thorough")
- All `learningCapture` values: set to "standard" as minimum (never "skip")
- TRIVIAL/SIMPLE `verifyFixIterations`: bump from 0/1 to 1 minimum

These fields remain deprecated and will be removed in a future plan, but they should no longer contain "skip" values.

**Files to create/edit:**

- `src/complexity/__helpers/defaults.ts`

**Verification:**

- No "skip" values remain in DEFAULT_COMPLEXITY_MATRIX for step-activation fields
- Deprecated fields are consistent with always-run behavior
- `bunx --bun tsc --noEmit` passes
- `bun run build:all` completes and `bun run check:drift` passes

## Verification

- Grep for "skip" in skill files returns zero results related to complexity-based step-skipping (flag-based skips like `--skip-review` still exist and are expected)
- All skills always execute all workflow steps regardless of complexity
- Model routing determines sub-agent depth at each complexity level
- `bunx --bun tsc --noEmit` passes
- `bun run build:all` completes successfully
- `bun run check:drift` shows no drift

## Success Criteria

- Zero complexity-based step-skipping in any skill orchestrator
- Every workflow step runs at every complexity level
- Sub-agent model selection is determined by the routing table, not by skip/run logic
- Flag-based overrides (`--skip-review`, `--skip-uat`, `--skip-research`) still work
- Config-based overrides (`workflow.code_review: false`, `workflow.uat_required: false`) still work
- The deprecated fields in ComplexityGateSchema no longer contain "skip" values

## Output Specification

- Updated skill files: phase-execute, phase-plan, verify, phase-discuss, autopilot, lu
- Updated `src/complexity/__helpers/defaults.ts` matrix values
- All generated files rebuilt via `bun run build:all`
