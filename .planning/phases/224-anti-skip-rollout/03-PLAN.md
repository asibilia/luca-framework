---
phase: 224
plan: 3
type: feature
autonomous: true
wave: 3
depends_on: [1, 2]
---

# Phase 224 Plan 3: phase-execute Anti-Skip Decomposition

## Objective

Decompose the phase-execute skill's major loops into 3 sub-skills with a thin orchestrator wrapper, state machine that extends existing bridge transitions, context schema, pre-step enforcement hook, and registry entries.

This is the trickiest skill because phase-execute already partially integrates with the luca-bridge state machine (VERIFY_PASSED, LEARN_COMPLETE, PROCESS_DATA_COMPLETE, COMMIT_COMPLETE events). The new state machine must be compatible with -- not replace -- existing bridge transitions.

> Appetite: Small. This is wave 3 of 4. Depends on waves 1-2 for pattern confidence.

## Context

- @src/skills/\_\_schemas/states/pr-address.states.ts (pilot state machine pattern)
- @src/skills/\_\_schemas/pr-address-context.schemas.ts (pilot context schema pattern)
- @src/hooks/scripts/pre-step-pr-address.ts (pilot enforcement hook pattern)
- @src/skills/general/phase-execute.skill.ts (current monolith -- 29K tokens, largest skill)
- @src/hooks/\_\_helpers/hook-registry.ts (registry to add hook entry)
- @src/skills/\_\_helpers/build-skill-registry.ts (registry to add sub-skill entries)
- @.planning/phases/224-anti-skip-rollout/01-RESEARCH.md (decomposition analysis, Pitfall 6)

## Tasks

### 1. Create phase-execute state machine definition

**Type:** auto
**TDD:** false
**Depends on:** none

Create `src/skills/__schemas/states/phase-execute.states.ts` following the pilot pattern.

**CRITICAL (Pitfall 6 from RESEARCH.md):** phase-execute already uses `luca-bridge transition` with events VERIFY_PASSED, LEARN_COMPLETE, PROCESS_DATA_COMPLETE, COMMIT_COMPLETE. The new state machine must EXTEND these existing transitions, not replace them.

The phase-execute decomposition extracts 3 loops per the todo spec:

1. Wave execution (Steps 1-4)
2. Verification loops (Steps 5-7: harness fix + verify fix)
3. Code review (Step 8)

Setup (Steps 0-0.6) and learning capture (Step 9+) remain in the orchestrator.

State machine:

- idle -> SETUP_COMPLETE -> setup (orchestrator handles setup internally)
- setup -> WAVES_COMPLETE -> executed
- executed -> VERIFY_COMPLETE -> verified (harness + verify fix loops)
- verified -> REVIEW_COMPLETE | SKIP_REVIEW -> reviewed
- reviewed -> LEARN_COMPLETE -> learned (orchestrator handles learning)
- learned -> COMMIT_COMPLETE -> committed (terminal)
- ABORT from every non-terminal state to failed
- failed: terminal

The LEARN_COMPLETE and COMMIT_COMPLETE events align with existing bridge transitions. The new machine tracks the sub-skill-level granularity while existing bridge events continue to work at the phase level.

Context schema: minimal (e.g., phase_number, plan_count, wave_count, gaps_only boolean, harness_passed boolean for SKIP_REVIEW decision).

**Files to create:**

- `src/skills/__schemas/states/phase-execute.states.ts`

**Verification:**

- File exports `phaseExecuteStateMachine`
- States: idle, setup, executed, verified, reviewed, learned, committed, failed
- Existing bridge event names (LEARN_COMPLETE, COMMIT_COMPLETE) are reused
- `bunx --bun tsc --noEmit` passes

### 2. Create phase-execute context schema with read/write helpers

**Type:** auto
**TDD:** false
**Depends on:** none

Create `src/skills/__schemas/phase-execute-context.schemas.ts` following the pilot context schema pattern.

Define output schemas for each sub-skill:

- `PhaseExecuteWavesOutputSchema` -- plans_discovered, waves_grouped, waves_executed, execution_summaries
- `PhaseExecuteVerifyOutputSchema` -- harness_ran, harness_passed, verify_ran, verify_passed, fix_iterations
- `PhaseExecuteReviewOutputSchema` -- reviewers_spawned, review_findings, review_summary

Top-level `PhaseExecuteContextSchema` with:

- `context_version: z.literal(1)` (required)
- Each sub-skill output as optional section
- `PHASE_EXECUTE_CONTEXT_PATH = "/tmp/phase-execute-context.json"`
- `readPhaseExecuteContext()` async helper
- `writePhaseExecuteContext(patch)` async helper

**Files to create:**

- `src/skills/__schemas/phase-execute-context.schemas.ts`

**Verification:**

- File exports context schema, path constant, read/write helpers
- `bunx --bun tsc --noEmit` passes

### 3. Create phase-execute-waves sub-skill

**Type:** auto
**TDD:** false
**Depends on:** none

Create `src/skills/general/phase-execute-waves.skill.ts` using `createSkill` factory.

Extracts Steps 1-4 from the phase-execute monolith (wave execution loop):

- Step 1: Validate phase directory and plan files
- Step 2: Discover all PLAN.md files in phase directory
- Step 3: Group plans by wave number (from frontmatter)
- Step 4: Execute waves sequentially (plans within a wave execute in dependency order)

This is the core execution loop. Each wave's plans are spawned via Skill() or Task() calls. The sub-skill reads plan frontmatter, resolves dependencies, and orchestrates execution.

Write results to context file via `writePhaseExecuteContext`.

**Files to create:**

- `src/skills/general/phase-execute-waves.skill.ts`

**Verification:**

- File exports `phaseExecuteWavesSkill`
- Skill spec handles plan discovery, wave grouping, sequential wave execution
- `bunx --bun tsc --noEmit` passes

### 4. Create phase-execute-verify sub-skill

**Type:** auto
**TDD:** false
**Depends on:** none

Create `src/skills/general/phase-execute-verify.skill.ts` using `createSkill` factory.

Extracts Steps 5-7 from the phase-execute monolith (verification loops):

- Step 5: Run Loop A (harness mechanical fix) -- run harness, if failures spawn executor to fix, re-run (max iterations from complexity matrix)
- Step 6: Run Loop B (verify semantic fix) -- spawn lu-verifier, if issues spawn executor to fix, re-verify (max iterations from complexity matrix)
- Step 7: Aggregate verification results

This sub-skill implements the two fix-iteration loops with configurable max iterations from the complexity gating matrix.

Write results to context file.

**Files to create:**

- `src/skills/general/phase-execute-verify.skill.ts`

**Verification:**

- File exports `phaseExecuteVerifySkill`
- Skill spec handles Loop A (harness) and Loop B (verify) with iteration limits
- `bunx --bun tsc --noEmit` passes

### 5. Create phase-execute-review sub-skill

**Type:** auto
**TDD:** false
**Depends on:** none

Create `src/skills/general/phase-execute-review.skill.ts` using `createSkill` factory.

Extracts Step 8 from the phase-execute monolith (code review swarm):

- Spawn all configured reviewers in parallel (code-architect, dx-advocate, code-simplifier, security-auditor, etc.)
- Aggregate review findings
- Write results to context file

This sub-skill is optional (orchestrator sends SKIP_REVIEW if verification failed or if workflow.code_review is false).

**Files to create:**

- `src/skills/general/phase-execute-review.skill.ts`

**Verification:**

- File exports `phaseExecuteReviewSkill`
- `bunx --bun tsc --noEmit` passes

### 6. Create pre-step-phase-execute enforcement hook

**Type:** auto
**TDD:** false
**Depends on:** 1

Create `src/hooks/scripts/pre-step-phase-execute.ts` following the pre-step-pr-address.ts pattern.

Key elements:

- SUB_SKILLS set: phase-execute-waves, phase-execute-verify, phase-execute-review
- VALID_STATES_FOR_SKILL mapping:
  - phase-execute-waves: valid from ["setup"]
  - phase-execute-verify: valid from ["executed"]
  - phase-execute-review: valid from ["verified"]
- CONTEXT_PATH = "/tmp/phase-execute-context.json"
- Uses guardPreStep, readStdinJson, exitSuccess, exitBlock from hook-io.ts

Note: Setup and learning/commit steps are handled by the orchestrator directly (not sub-skills), so the hook only enforces the 3 extracted loop sub-skills.

**Files to create:**

- `src/hooks/scripts/pre-step-phase-execute.ts`

**Verification:**

- All 3 sub-skills listed in SUB_SKILLS set
- VALID_STATES_FOR_SKILL correctly maps each sub-skill
- `bunx --bun tsc --noEmit` passes

### 7. Register hook and sub-skills in registries

**Type:** auto
**TDD:** false
**Depends on:** 3, 4, 5, 6

Add entries to both registries:

**Hook registry** (`src/hooks/__helpers/hook-registry.ts`):
Add `"pre-step-phase-execute"` entry:

```typescript
"pre-step-phase-execute": () => ({
  event: "pre_tool_use",
  tool_filter: "Skill",
  script: "pre-step-phase-execute.ts",
  timeout: 5,
  async: false,
  status_message: "Validating phase-execute step order...",
}),
```

**Skill registry** (`src/skills/__helpers/build-skill-registry.ts`):
Add imports and entries for all 3 sub-skills:

- phase-execute-waves
- phase-execute-verify
- phase-execute-review

**Files to edit:**

- `src/hooks/__helpers/hook-registry.ts`
- `src/skills/__helpers/build-skill-registry.ts`

**Verification:**

- Both registries have all new entries
- `bunx --bun tsc --noEmit` passes

### 8. Refactor phase-execute.skill.ts to thin orchestrator

**Type:** auto
**TDD:** false
**Depends on:** 1, 2, 3, 4, 5

Rewrite `src/skills/general/phase-execute.skill.ts` to be a thin orchestrator.

The orchestrator retains:

- Steps 0-0.6: Setup (arg parsing, model routing, phase start commit, GitHub tracking, procedure replay) -- these stay as orchestrator instructions because they are configuration/initialization
- Learning capture (Step 9+): lu-learner spawn, process data -- these stay because they are post-execution wrap-up

The orchestrator delegates:

1. Initialize context file, do setup steps, write `current_state: "setup"`
2. `Skill("phase-execute-waves", "{args}")` -- on success write `current_state: "executed"`
3. `Skill("phase-execute-verify", "{args}")` -- on success write `current_state: "verified"`
4. Read config, decide SKIP_REVIEW or `Skill("phase-execute-review")` -- write `current_state: "reviewed"`
5. Learning capture (lu-learner, process data) -- write `current_state: "learned"`
6. Final commit -- write `current_state: "committed"`

**CRITICAL (Pitfall 6):** Existing `luca-bridge transition` calls for VERIFY_PASSED, LEARN_COMPLETE, PROCESS_DATA_COMPLETE, COMMIT_COMPLETE must be preserved. The orchestrator continues to emit bridge events at the appropriate points alongside the new context file state tracking.

**CRITICAL (Pitfall 1):** Write `current_state` to context file after every state transition.

**Files to edit:**

- `src/skills/general/phase-execute.skill.ts`

**Verification:**

- Orchestrator retains setup and learning capture
- Wave execution, verification loops, and code review are delegated to sub-skills
- Existing bridge transition calls are preserved
- `current_state` written after every transition
- `bunx --bun tsc --noEmit` passes

## Verification

1. `bunx --bun tsc --noEmit` passes with all new files
2. All 6 new files exist in correct locations
3. Both registries updated
4. phase-execute.skill.ts correctly delegates the 3 loops while keeping setup/teardown
5. Existing bridge transitions are preserved (not broken)
6. State machine is compatible with existing LEARN_COMPLETE and COMMIT_COMPLETE events

## Success Criteria

- 6 new files created (1 state machine, 1 context schema, 3 sub-skills, 1 hook)
- 3 existing files modified (orchestrator, hook registry, skill registry)
- TypeScript compiles cleanly
- Bridge transition compatibility maintained
- Setup and learning capture remain in orchestrator (not extracted)

## Output Specification

New artifacts:

- `src/skills/__schemas/states/phase-execute.states.ts`
- `src/skills/__schemas/phase-execute-context.schemas.ts`
- `src/skills/general/phase-execute-waves.skill.ts`
- `src/skills/general/phase-execute-verify.skill.ts`
- `src/skills/general/phase-execute-review.skill.ts`
- `src/hooks/scripts/pre-step-phase-execute.ts`

Modified artifacts:

- `src/skills/general/phase-execute.skill.ts` (thin orchestrator)
- `src/hooks/__helpers/hook-registry.ts` (new hook entry)
- `src/skills/__helpers/build-skill-registry.ts` (3 new sub-skill entries)
