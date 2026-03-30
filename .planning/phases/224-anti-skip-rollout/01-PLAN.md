---
phase: 224
plan: 1
type: feature
autonomous: true
wave: 1
depends_on: []
---

# Phase 224 Plan 1: milestone-complete Anti-Skip Decomposition

## Objective

Decompose the milestone-complete monolith skill into 5 sub-skills with a thin orchestrator, state machine, context schema, pre-step enforcement hook, and registry entries -- replicating the validated pr-address pilot pattern from Phase 223.

> Appetite: Small (50K tokens remaining of 50K ceiling). This is wave 1 of 4.

## Context

- @src/skills/\_\_schemas/states/pr-address.states.ts (pilot state machine pattern)
- @src/skills/\_\_schemas/pr-address-context.schemas.ts (pilot context schema pattern)
- @src/hooks/scripts/pre-step-pr-address.ts (pilot enforcement hook pattern)
- @src/skills/general/milestone-complete.skill.ts (current monolith to decompose)
- @src/hooks/\_\_helpers/hook-registry.ts (registry to add hook entry)
- @src/skills/\_\_helpers/build-skill-registry.ts (registry to add sub-skill entries)
- @.planning/phases/224-anti-skip-rollout/01-RESEARCH.md (full file manifest + code templates)

## Tasks

### 1. Create milestone-complete state machine definition

**Type:** auto
**TDD:** false
**Depends on:** none

Create `src/skills/__schemas/states/milestone-complete.states.ts` following the pr-address pilot pattern exactly.

State machine: IDLE -> LEARNED -> PRUNED -> SCANNED -> ARCHIVED -> FINALIZED (+ failed terminal).

States and events:

- idle -> LEARN_COMPLETE -> learned
- learned -> PRUNE_COMPLETE -> pruned
- pruned -> SCAN_COMPLETE | SKIP_SCAN -> scanned
- scanned -> ARCHIVE_COMPLETE -> archived
- archived -> FINALIZE_COMPLETE -> finalized
- finalized: terminal (final)
- failed: terminal (final)
- ABORT from every non-terminal state to failed

Context schema: minimal (only what orchestrator needs for decisions -- e.g., shadow_debt_enabled boolean for SKIP_SCAN decision).

Use `createSkillStateMachine` factory from `~/workflow/__helpers/skill-state-machine`. Include full JSDoc documentation matching the pr-address pilot quality.

**Files to create:**

- `src/skills/__schemas/states/milestone-complete.states.ts`

**Verification:**

- File exports `milestoneCompleteStateMachine` with `createActor` and `validateContext` methods
- All 7 states defined (idle, learned, pruned, scanned, archived, finalized, failed)
- ABORT transition from all non-terminal states
- SKIP_SCAN conditional path from pruned to scanned
- `bunx --bun tsc --noEmit` passes

### 2. Create milestone-complete context schema with read/write helpers

**Type:** auto
**TDD:** false
**Depends on:** none

Create `src/skills/__schemas/milestone-complete-context.schemas.ts` following the pr-address-context.schemas.ts pattern.

Define output schemas for each sub-skill:

- `MilestoneLearnOutputSchema` -- learnings_extracted, engrams captured
- `MilestonePruneOutputSchema` -- stale_memories_found, pruned_count
- `MilestoneShadowGateOutputSchema` -- shadow_scan_ran, violations_found
- `MilestoneArchiveOutputSchema` -- archived, stats_generated, retro_written
- `MilestoneFinalizeOutputSchema` -- committed, tagged, tag_name

Top-level `MilestoneCompleteContextSchema` with:

- `context_version: z.literal(1)` (required)
- Each sub-skill output as optional section
- `MILESTONE_COMPLETE_CONTEXT_PATH = "/tmp/milestone-complete-context.json"`
- `readMilestoneCompleteContext()` async helper (safeParse, returns success/error)
- `writeMilestoneCompleteContext(patch)` async helper (deep merge via lodash/merge)

Use snake_case for all field names per API conventions. Include full JSDoc documentation.

**Files to create:**

- `src/skills/__schemas/milestone-complete-context.schemas.ts`

**Verification:**

- File exports context schema, path constant, read/write helpers, and all sub-schema types
- `context_version: z.literal(1)` is required
- All sub-skill output sections are optional
- `bunx --bun tsc --noEmit` passes

### 3. Create milestone-learn sub-skill

**Type:** auto
**TDD:** false
**Depends on:** none

Create `src/skills/general/milestone-learn.skill.ts` using `createSkill` factory.

This sub-skill extracts Step 0 (learning extraction) from the milestone-complete monolith:

- MuninnDB recall for session learnings
- Spawn lu-learner agent for pattern/decision/pitfall extraction
- Write results to context file via `writeMilestoneCompleteContext({ milestone_learn: { ... } })`

Skill spec should instruct the LLM to read context file at start, perform learning extraction, and write results back. Include full JSDoc.

**Files to create:**

- `src/skills/general/milestone-learn.skill.ts`

**Verification:**

- File exports `milestoneLearnSkill` using createSkill factory
- Skill spec references context file read/write
- `bunx --bun tsc --noEmit` passes

### 4. Create milestone-prune sub-skill

**Type:** auto
**TDD:** false
**Depends on:** none

Create `src/skills/general/milestone-prune.skill.ts` using `createSkill` factory.

Extracts Step 0.5 (stale memory detection) from the monolith:

- MuninnDB recall for stale/contradictory memories
- Interactive prune with user confirmation
- Memory consolidation
- Write results to context file

**Files to create:**

- `src/skills/general/milestone-prune.skill.ts`

**Verification:**

- File exports `milestonePruneSkill`
- `bunx --bun tsc --noEmit` passes

### 5. Create milestone-shadow-gate sub-skill

**Type:** auto
**TDD:** false
**Depends on:** none

Create `src/skills/general/milestone-shadow-gate.skill.ts` using `createSkill` factory.

Extracts Step 0.7 (shadow debt scan) from the monolith:

- Check if shadow scanning is enabled in config
- Spawn lu-shadow-scanner if enabled
- Write results to context file
- This is an OPTIONAL step (orchestrator sends SKIP_SCAN if disabled)

**Files to create:**

- `src/skills/general/milestone-shadow-gate.skill.ts`

**Verification:**

- File exports `milestoneShadowGateSkill`
- `bunx --bun tsc --noEmit` passes

### 6. Create milestone-archive sub-skill

**Type:** auto
**TDD:** false
**Depends on:** none

Create `src/skills/general/milestone-archive.skill.ts` using `createSkill` factory.

Extracts Steps 1-7.5 (archive + stats + retro) from the monolith. This is the bulk of the workflow:

- Archive completed phases
- Generate milestone statistics
- Write retrospective
- GitHub milestone creation/closure
- Write results to context file

Note: This is the largest sub-skill (~300 lines of instructions). Per CONTEXT.md Decision #2, we follow the todo spec exactly and do not further decompose.

**Files to create:**

- `src/skills/general/milestone-archive.skill.ts`

**Verification:**

- File exports `milestoneArchiveSkill`
- `bunx --bun tsc --noEmit` passes

### 7. Create milestone-finalize sub-skill

**Type:** auto
**TDD:** false
**Depends on:** none

Create `src/skills/general/milestone-finalize.skill.ts` using `createSkill` factory.

Extracts Steps 8-9 (commit + tag + divergent mode) from the monolith:

- Git tag creation
- Final commit
- Divergent mode advisory
- Write results to context file

**Files to create:**

- `src/skills/general/milestone-finalize.skill.ts`

**Verification:**

- File exports `milestoneFinalizeSkill`
- `bunx --bun tsc --noEmit` passes

### 8. Create pre-step-milestone-complete enforcement hook

**Type:** auto
**TDD:** false
**Depends on:** 1

Create `src/hooks/scripts/pre-step-milestone-complete.ts` following the pre-step-pr-address.ts pattern exactly.

Key elements:

- SUB_SKILLS set: milestone-learn, milestone-prune, milestone-shadow-gate, milestone-archive, milestone-finalize
- VALID_STATES_FOR_SKILL mapping derived from state machine:
  - milestone-learn: valid from ["idle"]
  - milestone-prune: valid from ["learned"]
  - milestone-shadow-gate: valid from ["pruned"]
  - milestone-archive: valid from ["scanned"]
  - milestone-finalize: valid from ["archived"]
- CONTEXT_PATH = "/tmp/milestone-complete-context.json"
- Uses guardPreStep with 200ms TTL dedup
- Uses readStdinJson, exitSuccess, exitBlock from hook-io.ts
- Falls open for unrecognized skills

**Files to create:**

- `src/hooks/scripts/pre-step-milestone-complete.ts`

**Verification:**

- File uses same imports/pattern as pre-step-pr-address.ts
- All 5 sub-skills listed in SUB_SKILLS set
- VALID_STATES_FOR_SKILL maps each sub-skill to correct state(s)
- `bunx --bun tsc --noEmit` passes

### 9. Register hook and sub-skills in registries

**Type:** auto
**TDD:** false
**Depends on:** 3, 4, 5, 6, 7, 8

Add entries to both registries:

**Hook registry** (`src/hooks/__helpers/hook-registry.ts`):
Add `"pre-step-milestone-complete"` entry to `canonicalHookRegistry` following the pr-address pattern:

```typescript
"pre-step-milestone-complete": () => ({
  event: "pre_tool_use",
  tool_filter: "Skill",
  script: "pre-step-milestone-complete.ts",
  timeout: 5,
  async: false,
  status_message: "Validating milestone-complete step order...",
}),
```

**Skill registry** (`src/skills/__helpers/build-skill-registry.ts`):
Add imports and entries for all 5 sub-skills:

- milestone-learn
- milestone-prune
- milestone-shadow-gate
- milestone-archive
- milestone-finalize

**Files to edit:**

- `src/hooks/__helpers/hook-registry.ts`
- `src/skills/__helpers/build-skill-registry.ts`

**Verification:**

- Hook registry has the new entry
- Skill registry has all 5 new sub-skill imports and entries
- `bunx --bun tsc --noEmit` passes

### 10. Refactor milestone-complete.skill.ts to thin orchestrator

**Type:** auto
**TDD:** false
**Depends on:** 1, 2, 3, 4, 5, 6, 7

Rewrite `src/skills/general/milestone-complete.skill.ts` to be a thin orchestrator following the pr-address.skill.ts pattern:

1. Parse args, initialize context file via `writeMilestoneCompleteContext`
2. `Skill("milestone-learn")` -- on success write `current_state: "learned"`
3. `Skill("milestone-prune")` -- on success write `current_state: "pruned"`
4. Read context/config, decide SKIP_SCAN or `Skill("milestone-shadow-gate")` -- write `current_state: "scanned"`
5. `Skill("milestone-archive")` -- on success write `current_state: "archived"`
6. `Skill("milestone-finalize")` -- on success write `current_state: "finalized"`

Zero inline logic constraint: ONLY Skill() calls + context reads + state transitions + arg parsing.

**CRITICAL (Pitfall 1 from RESEARCH.md):** After each state transition event, the orchestrator MUST write `current_state` to the context file. The pre-step hook reads this field to validate ordering.

**Files to edit:**

- `src/skills/general/milestone-complete.skill.ts`

**Verification:**

- Orchestrator contains ONLY Skill() calls, context reads, state writes, and arg parsing
- No gh commands, no Task() spawns, no data processing inline
- `current_state` is written after every state transition
- `bunx --bun tsc --noEmit` passes

## Verification

1. Run `bunx --bun tsc --noEmit` -- all new files compile without errors
2. All 8 new files exist in their correct locations under `src/`
3. Both registries (hook + skill) have all new entries
4. milestone-complete.skill.ts is a thin orchestrator with zero inline logic
5. State machine has correct transitions matching the sub-skill chain
6. Context schema has all sub-skill output sections as optional
7. Pre-step hook maps each sub-skill to valid states correctly

## Success Criteria

- 8 new files created (1 state machine, 1 context schema, 5 sub-skills, 1 hook)
- 2 existing files modified (orchestrator, registries x2 = 3 files modified total)
- TypeScript compiles cleanly
- Pattern matches pr-address pilot exactly (same code structure, same conventions)

## Output Specification

New artifacts:

- `src/skills/__schemas/states/milestone-complete.states.ts`
- `src/skills/__schemas/milestone-complete-context.schemas.ts`
- `src/skills/general/milestone-learn.skill.ts`
- `src/skills/general/milestone-prune.skill.ts`
- `src/skills/general/milestone-shadow-gate.skill.ts`
- `src/skills/general/milestone-archive.skill.ts`
- `src/skills/general/milestone-finalize.skill.ts`
- `src/hooks/scripts/pre-step-milestone-complete.ts`

Modified artifacts:

- `src/skills/general/milestone-complete.skill.ts` (thin orchestrator)
- `src/hooks/__helpers/hook-registry.ts` (new hook entry)
- `src/skills/__helpers/build-skill-registry.ts` (5 new sub-skill entries)
