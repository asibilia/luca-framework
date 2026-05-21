---
phase: 224
plan: 2
type: feature
autonomous: true
wave: 2
depends_on: [1]
---

# Phase 224 Plan 2: verify Anti-Skip Decomposition

## Objective

Decompose the verify monolith skill into 4 sub-skills with a thin orchestrator, state machine, context schema, pre-step enforcement hook, and registry entries -- replicating the validated pr-address pilot pattern.

> Appetite: Small. This is wave 2 of 4. Depends on wave 1 completion (pattern validated on milestone-complete).

## Context

- @src/skills/\_\_schemas/states/pr-address.states.ts (pilot state machine pattern)
- @src/skills/\_\_schemas/pr-address-context.schemas.ts (pilot context schema pattern)
- @src/hooks/scripts/pre-step-pr-address.ts (pilot enforcement hook pattern)
- @src/skills/\_\_schemas/states/milestone-complete.states.ts (wave 1 output -- second reference)
- @src/skills/general/verify.skill.ts (current monolith to decompose)
- @src/hooks/\_\_helpers/hook-registry.ts (registry to add hook entry)
- @src/skills/\_\_helpers/build-skill-registry.ts (registry to add sub-skill entries)
- @.planning/phases/224-anti-skip-rollout/01-RESEARCH.md (full decomposition analysis)

## Tasks

### 1. Create verify state machine definition

**Type:** auto
**TDD:** false
**Depends on:** none

Create `src/skills/__schemas/states/verify.states.ts` following the pilot pattern.

The verify skill has TWO divergent terminal paths (from RESEARCH.md analysis):

- Path A (no issues found): idle -> extracted -> tested -> reviewed (terminal -- phase verified)
- Path B (issues found): idle -> extracted -> tested -> diagnosed (terminal -- ready for --gaps-only)

State machine:

- idle -> EXTRACT_COMPLETE -> extracted
- extracted -> TEST_COMPLETE -> tested
- tested -> SKIP_DIAGNOSE -> reviewed (UAT passed, skip to review)
- tested -> DIAGNOSE_COMPLETE -> diagnosed (issues found)
- diagnosed: terminal (final) -- fixes planned, next run is --gaps-only
- tested -> SKIP_REVIEW -> reviewed (if UAT failed, skip review -- but RESEARCH says this is less common)
- reviewed: terminal (final) -- phase verified
- ABORT from every non-terminal state to failed
- failed: terminal (final)

Context schema: minimal (e.g., issues_found boolean for path decision, gap_mode boolean).

**Files to create:**

- `src/skills/__schemas/states/verify.states.ts`

**Verification:**

- File exports `verifyStateMachine`
- States: idle, extracted, tested, diagnosed, reviewed, failed
- Conditional paths: SKIP_DIAGNOSE (tested -> reviewed), SKIP_REVIEW (tested -> reviewed via different path or diagnosed as terminal)
- `bunx --bun tsc --noEmit` passes

### 2. Create verify context schema with read/write helpers

**Type:** auto
**TDD:** false
**Depends on:** none

Create `src/skills/__schemas/verify-context.schemas.ts` following the pilot context schema pattern.

Define output schemas for each sub-skill:

- `VerifyExtractOutputSchema` -- summaries_found, deliverables_extracted, uat_template_path
- `VerifyTestOutputSchema` -- tests_presented, tests_passed, tests_failed, issues_found
- `VerifyDiagnoseOutputSchema` -- debuggers_spawned, fix_plans_created, plan_checker_ran
- `VerifyReviewOutputSchema` -- reviewers_spawned, review_findings

Top-level `VerifyContextSchema` with:

- `context_version: z.literal(1)` (required)
- Each sub-skill output as optional section
- `VERIFY_CONTEXT_PATH = "/tmp/verify-context.json"`
- `readVerifyContext()` async helper
- `writeVerifyContext(patch)` async helper

**Files to create:**

- `src/skills/__schemas/verify-context.schemas.ts`

**Verification:**

- File exports context schema, path constant, read/write helpers
- `context_version: z.literal(1)` is required
- `bunx --bun tsc --noEmit` passes

### 3. Create verify-extract sub-skill

**Type:** auto
**TDD:** false
**Depends on:** none

Create `src/skills/general/verify-extract.skill.ts` using `createSkill` factory.

Extracts Steps 1-4 from the verify monolith:

- Find phase summaries and execution artifacts
- Extract deliverables from completed plans
- Create UAT.md test template with verification items
- Write results to context file

**Files to create:**

- `src/skills/general/verify-extract.skill.ts`

**Verification:**

- File exports `verifyExtractSkill`
- `bunx --bun tsc --noEmit` passes

### 4. Create verify-test sub-skill

**Type:** auto
**TDD:** false
**Depends on:** none

Create `src/skills/general/verify-test.skill.ts` using `createSkill` factory.

Extracts Steps 5-7 from the verify monolith:

- Present test items to user one at a time
- Collect pass/fail results interactively
- Update UAT.md with results
- Track issues_found for orchestrator path decision
- Write results to context file

**Files to create:**

- `src/skills/general/verify-test.skill.ts`

**Verification:**

- File exports `verifyTestSkill`
- `bunx --bun tsc --noEmit` passes

### 5. Create verify-diagnose sub-skill

**Type:** auto
**TDD:** false
**Depends on:** none

Create `src/skills/general/verify-diagnose.skill.ts` using `createSkill` factory.

Extracts Step 8 from the verify monolith:

- Spawn lu-debugger agents in parallel for each failed test
- Spawn lu-planner to create fix plans
- Spawn lu-plan-checker to validate plans
- Write results to context file

This sub-skill only runs if UAT issues were found (orchestrator decides via DIAGNOSE_COMPLETE vs SKIP_DIAGNOSE).

**Files to create:**

- `src/skills/general/verify-diagnose.skill.ts`

**Verification:**

- File exports `verifyDiagnoseSkill`
- `bunx --bun tsc --noEmit` passes

### 6. Create verify-review sub-skill

**Type:** auto
**TDD:** false
**Depends on:** none

Create `src/skills/general/verify-review.skill.ts` using `createSkill` factory.

Extracts Steps 9-12 from the verify monolith:

- Spawn code review swarm (code-architect, dx-advocate, code-simplifier, etc.) in parallel
- Aggregate review findings
- Write results to context file

This sub-skill only runs if UAT passed (orchestrator decides via SKIP_DIAGNOSE path leading to review).

**Files to create:**

- `src/skills/general/verify-review.skill.ts`

**Verification:**

- File exports `verifyReviewSkill`
- `bunx --bun tsc --noEmit` passes

### 7. Create pre-step-verify enforcement hook

**Type:** auto
**TDD:** false
**Depends on:** 1

Create `src/hooks/scripts/pre-step-verify.ts` following the pre-step-pr-address.ts pattern.

Key elements:

- SUB_SKILLS set: verify-extract, verify-test, verify-diagnose, verify-review
- VALID_STATES_FOR_SKILL mapping:
  - verify-extract: valid from ["idle"]
  - verify-test: valid from ["extracted"]
  - verify-diagnose: valid from ["tested"]
  - verify-review: valid from ["tested", "diagnosed"] (tested via SKIP_DIAGNOSE, or diagnosed)
- CONTEXT_PATH = "/tmp/verify-context.json"
- Uses guardPreStep, readStdinJson, exitSuccess, exitBlock from hook-io.ts

Note: verify-review is valid from "tested" (when SKIP_DIAGNOSE was sent, meaning no issues) but the state machine path makes this: tested -> SKIP_DIAGNOSE -> reviewed (which is terminal). Actually, the orchestrator would call verify-review when in "tested" state (no issues) -- the hook must allow this. Review the state machine carefully to get the VALID_STATES mapping right.

**Files to create:**

- `src/hooks/scripts/pre-step-verify.ts`

**Verification:**

- All 4 sub-skills listed in SUB_SKILLS set
- VALID_STATES_FOR_SKILL correctly maps each sub-skill
- `bunx --bun tsc --noEmit` passes

### 8. Register hook and sub-skills in registries

**Type:** auto
**TDD:** false
**Depends on:** 3, 4, 5, 6, 7

Add entries to both registries:

**Hook registry** (`src/hooks/__helpers/hook-registry.ts`):
Add `"pre-step-verify"` entry:

```typescript
"pre-step-verify": () => ({
  event: "pre_tool_use",
  tool_filter: "Skill",
  script: "pre-step-verify.ts",
  timeout: 5,
  async: false,
  status_message: "Validating verify step order...",
}),
```

**Skill registry** (`src/skills/__helpers/build-skill-registry.ts`):
Add imports and entries for all 4 sub-skills:

- verify-extract
- verify-test
- verify-diagnose
- verify-review

**Files to edit:**

- `src/hooks/__helpers/hook-registry.ts`
- `src/skills/__helpers/build-skill-registry.ts`

**Verification:**

- Both registries have all new entries
- `bunx --bun tsc --noEmit` passes

### 9. Refactor verify.skill.ts to thin orchestrator

**Type:** auto
**TDD:** false
**Depends on:** 1, 2, 3, 4, 5, 6

Rewrite `src/skills/general/verify.skill.ts` to be a thin orchestrator:

1. Parse args (phase_number, --gaps-only flag), initialize context file
2. `Skill("verify-extract", "{phase_number}")` -- on success write `current_state: "extracted"`
3. `Skill("verify-test", "{phase_number}")` -- on success write `current_state: "tested"`
4. Read context, check `issues_found`:
   - If issues found: `Skill("verify-diagnose")` -- write `current_state: "diagnosed"` (terminal path)
   - If no issues: send SKIP_DIAGNOSE, `Skill("verify-review")` -- write `current_state: "reviewed"` (terminal path)
5. Report summary to user

Zero inline logic constraint applies.

**CRITICAL (Pitfall 1):** Write `current_state` to context file after every state transition.

**Files to edit:**

- `src/skills/general/verify.skill.ts`

**Verification:**

- Orchestrator contains ONLY Skill() calls, context reads, state writes, arg parsing
- Path decision (diagnose vs review) based on context file data
- `current_state` written after every transition
- `bunx --bun tsc --noEmit` passes

## Verification

1. `bunx --bun tsc --noEmit` passes with all new files
2. All 7 new files exist in correct locations
3. Both registries updated
4. verify.skill.ts is a thin orchestrator with conditional path logic
5. State machine correctly models two terminal paths (diagnosed vs reviewed)

## Success Criteria

- 7 new files created (1 state machine, 1 context schema, 4 sub-skills, 1 hook)
- 3 existing files modified (orchestrator, hook registry, skill registry)
- TypeScript compiles cleanly
- Divergent path logic (issues vs no-issues) is correctly modeled in state machine and orchestrator

## Output Specification

New artifacts:

- `src/skills/__schemas/states/verify.states.ts`
- `src/skills/__schemas/verify-context.schemas.ts`
- `src/skills/general/verify-extract.skill.ts`
- `src/skills/general/verify-test.skill.ts`
- `src/skills/general/verify-diagnose.skill.ts`
- `src/skills/general/verify-review.skill.ts`
- `src/hooks/scripts/pre-step-verify.ts`

Modified artifacts:

- `src/skills/general/verify.skill.ts` (thin orchestrator)
- `src/hooks/__helpers/hook-registry.ts` (new hook entry)
- `src/skills/__helpers/build-skill-registry.ts` (4 new sub-skill entries)
