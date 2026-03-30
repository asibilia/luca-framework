---
phase: 224
plan: 4
type: feature
autonomous: true
wave: 4
depends_on: [1, 2, 3]
---

# Phase 224 Plan 4: lu Anti-Skip Decomposition

## Objective

Decompose the lu monolith skill into 4 sub-skills with a thin orchestrator, state machine, context schema, pre-step enforcement hook, and registry entries -- replicating the validated pattern. lu is the largest blast radius skill (~19K tokens) and benefits from lessons learned on the previous 3 skills.

> Appetite: Small. This is wave 4 of 4 (final wave). Depends on waves 1-3 for pattern validation.

## Context

- @src/skills/\_\_schemas/states/pr-address.states.ts (pilot state machine pattern)
- @src/skills/\_\_schemas/pr-address-context.schemas.ts (pilot context schema pattern)
- @src/hooks/scripts/pre-step-pr-address.ts (pilot enforcement hook pattern)
- @src/skills/luca/lu.skill.ts (current monolith to decompose -- NOTE: lives in luca/ not general/)
- @src/hooks/\_\_helpers/hook-registry.ts (registry to add hook entry)
- @src/skills/\_\_helpers/build-skill-registry.ts (registry to add sub-skill entries)
- @.planning/phases/224-anti-skip-rollout/01-RESEARCH.md (full decomposition analysis)

## Tasks

### 1. Create lu state machine definition

**Type:** auto
**TDD:** false
**Depends on:** none

Create `src/skills/__schemas/states/lu.states.ts` following the pilot pattern.

State machine:

- idle -> ROUTE_COMPLETE -> routed
- routed -> CONFIGURE_COMPLETE -> configured
- configured -> SCAN_COMPLETE | SKIP_BACKLOG -> scanned
- scanned -> EXECUTE_START -> executing
- executing -> EXECUTE_COMPLETE -> complete
- complete: terminal (final)
- failed: terminal (final)
- ABORT from every non-terminal state to failed

Conditional paths:

- SKIP_BACKLOG: orchestrator sends this when --skip-backlog flag is passed
- SKIP_COGNITION: this is handled within lu-route (not a state machine event, internal to the sub-skill)

Context schema: minimal (e.g., complexity_level, phase_number, skip_backlog boolean, skip_memory boolean).

**Files to create:**

- `src/skills/__schemas/states/lu.states.ts`

**Verification:**

- File exports `luStateMachine`
- States: idle, routed, configured, scanned, executing, complete, failed
- SKIP_BACKLOG conditional path from configured to scanned
- `bunx --bun tsc --noEmit` passes

### 2. Create lu context schema with read/write helpers

**Type:** auto
**TDD:** false
**Depends on:** none

Create `src/skills/__schemas/lu-context.schemas.ts` following the pilot context schema pattern.

Define output schemas for each sub-skill:

- `LuRouteOutputSchema` -- request_parsed, git_context_loaded, cognition_ran, complexity_level, routing_decision (e.g., "phase-execute", "quick", "debug")
- `LuConfigureOutputSchema` -- config_loaded, overrides_applied, pre_flight_complete
- `LuBacklogOutputSchema` -- todos_scanned, wsjf_scored, backlog_revised, phases_added
- `LuPhaseLoopOutputSchema` -- phases_executed, milestone_gate_checked, summary_generated

Top-level `LuContextSchema` with:

- `context_version: z.literal(1)` (required)
- Each sub-skill output as optional section
- `LU_CONTEXT_PATH = "/tmp/lu-context.json"`
- `readLuContext()` async helper
- `writeLuContext(patch)` async helper

**Files to create:**

- `src/skills/__schemas/lu-context.schemas.ts`

**Verification:**

- File exports context schema, path constant, read/write helpers
- `bunx --bun tsc --noEmit` passes

### 3. Create lu-route sub-skill

**Type:** auto
**TDD:** false
**Depends on:** none

Create `src/skills/luca/lu-route.skill.ts` using `createSkill` factory.

**NOTE:** lu sub-skills live in `src/skills/luca/`, not `src/skills/general/`.

Extracts Steps 0-3 from the lu monolith (routing and classification):

- Step 0: Parse user request and args (--complexity, --skip-memory, --skip-backlog, etc.)
- Step 1: Load git context (branch, status, recent commits)
- Step 2: Spawn lu-cognition for cognitive pre-flight (unless --skip-memory)
- Step 3: Spawn lu-router for complexity classification and routing decision
- Write results to context file

The routing decision determines what happens next: phase-execute, quick, debug, or full workflow.

**Files to create:**

- `src/skills/luca/lu-route.skill.ts`

**Verification:**

- File exports `luRouteSkill`
- Skill spec covers arg parsing, git context, cognition, routing
- `bunx --bun tsc --noEmit` passes

### 4. Create lu-configure sub-skill

**Type:** auto
**TDD:** false
**Depends on:** none

Create `src/skills/luca/lu-configure.skill.ts` using `createSkill` factory.

Extracts the configuration section from the lu monolith:

- Read .planning/config.json
- Apply command-line overrides (--complexity, flags)
- Run pre-flight validation (check STATE.md, verify branch, check phase directory)
- Write results to context file

**Files to create:**

- `src/skills/luca/lu-configure.skill.ts`

**Verification:**

- File exports `luConfigureSkill`
- `bunx --bun tsc --noEmit` passes

### 5. Create lu-backlog sub-skill

**Type:** auto
**TDD:** false
**Depends on:** none

Create `src/skills/luca/lu-backlog.skill.ts` using `createSkill` factory.

Extracts the backlog scan + roadmap revision sections from the lu monolith:

- Scan MuninnDB for outstanding todos
- WSJF scoring of pending items
- Roadmap revision (add/reorder phases)
- Optional swarm mode (--no-swarm flag)
- Write results to context file

This sub-skill is OPTIONAL (orchestrator sends SKIP_BACKLOG when --skip-backlog flag is set).

**Files to create:**

- `src/skills/luca/lu-backlog.skill.ts`

**Verification:**

- File exports `luBacklogSkill`
- `bunx --bun tsc --noEmit` passes

### 6. Create lu-phase-loop sub-skill

**Type:** auto
**TDD:** false
**Depends on:** none

Create `src/skills/luca/lu-phase-loop.skill.ts` using `createSkill` factory.

Extracts the phase loop + milestone gate + summary sections from the lu monolith. This is the LARGEST sub-skill (~500+ lines of instructions) but per CONTEXT.md Decision #2 we follow the todo spec and do not further decompose.

The phase loop:

- Determine next phase to execute (from roadmap position)
- Call phase-discuss, phase-plan, phase-execute in sequence (or appropriate subset)
- After execution: check milestone gate (all phases complete?)
- If milestone gate passes: trigger milestone-complete
- Generate session summary
- Write results to context file

Contains both serial execution path (single phase) and parallel execution path (multiple phases if --parallel flag).

**Files to create:**

- `src/skills/luca/lu-phase-loop.skill.ts`

**Verification:**

- File exports `luPhaseLoopSkill`
- Skill spec covers phase loop, milestone gate, summary generation
- `bunx --bun tsc --noEmit` passes

### 7. Create pre-step-lu enforcement hook

**Type:** auto
**TDD:** false
**Depends on:** 1

Create `src/hooks/scripts/pre-step-lu.ts` following the pre-step-pr-address.ts pattern.

Key elements:

- SUB_SKILLS set: lu-route, lu-configure, lu-backlog, lu-phase-loop
- VALID_STATES_FOR_SKILL mapping:
  - lu-route: valid from ["idle"]
  - lu-configure: valid from ["routed"]
  - lu-backlog: valid from ["configured"]
  - lu-phase-loop: valid from ["scanned", "configured"] (scanned via SCAN_COMPLETE or configured via SKIP_BACKLOG)
- CONTEXT_PATH = "/tmp/lu-context.json"
- Uses guardPreStep, readStdinJson, exitSuccess, exitBlock from hook-io.ts

Note: lu-phase-loop is valid from "configured" (if SKIP_BACKLOG was sent) or "scanned" (if backlog ran). The hook must accept both states.

**Files to create:**

- `src/hooks/scripts/pre-step-lu.ts`

**Verification:**

- All 4 sub-skills listed in SUB_SKILLS set
- VALID_STATES_FOR_SKILL correctly maps each sub-skill including lu-phase-loop's dual valid states
- `bunx --bun tsc --noEmit` passes

### 8. Register hook and sub-skills in registries

**Type:** auto
**TDD:** false
**Depends on:** 3, 4, 5, 6, 7

Add entries to both registries:

**Hook registry** (`src/hooks/__helpers/hook-registry.ts`):
Add `"pre-step-lu"` entry:

```typescript
"pre-step-lu": () => ({
  event: "pre_tool_use",
  tool_filter: "Skill",
  script: "pre-step-lu.ts",
  timeout: 5,
  async: false,
  status_message: "Validating lu step order...",
}),
```

**Skill registry** (`src/skills/__helpers/build-skill-registry.ts`):
Add imports and entries for all 4 sub-skills. Note these come from `../luca/` not `../general/`:

```typescript
import { luRouteSkill } from "../luca/lu-route.skill";
import { luConfigureSkill } from "../luca/lu-configure.skill";
import { luBacklogSkill } from "../luca/lu-backlog.skill";
import { luPhaseLoopSkill } from "../luca/lu-phase-loop.skill";
```

Registry entries:

- "lu-route": () => luRouteSkill
- "lu-configure": () => luConfigureSkill
- "lu-backlog": () => luBacklogSkill
- "lu-phase-loop": () => luPhaseLoopSkill

**Files to edit:**

- `src/hooks/__helpers/hook-registry.ts`
- `src/skills/__helpers/build-skill-registry.ts`

**Verification:**

- Both registries have all new entries
- Imports use `../luca/` path (not `../general/`)
- `bunx --bun tsc --noEmit` passes

### 9. Refactor lu.skill.ts to thin orchestrator

**Type:** auto
**TDD:** false
**Depends on:** 1, 2, 3, 4, 5, 6

Rewrite `src/skills/luca/lu.skill.ts` to be a thin orchestrator:

1. Parse args (user request, flags), initialize context file via `writeLuContext`
2. `Skill("lu-route", "{user_request}")` -- on success write `current_state: "routed"`
3. `Skill("lu-configure")` -- on success write `current_state: "configured"`
4. Read context, check --skip-backlog flag:
   - If skip: send SKIP_BACKLOG, write `current_state: "scanned"`
   - If not: `Skill("lu-backlog")` -- write `current_state: "scanned"`
5. Write `current_state: "executing"` (EXECUTE_START event)
6. `Skill("lu-phase-loop")` -- on success write `current_state: "complete"`

Zero inline logic constraint: ONLY Skill() calls + context reads + state transitions + arg parsing.

**CRITICAL (Pitfall 1):** Write `current_state` to context file after every state transition.

**NOTE:** The lu skill file lives in `src/skills/luca/lu.skill.ts` not in `general/`.

**Files to edit:**

- `src/skills/luca/lu.skill.ts`

**Verification:**

- Orchestrator contains ONLY Skill() calls, context reads, state writes, arg parsing
- No inline logic (no gh commands, no Task() spawns, no data processing)
- Conditional backlog skip logic based on flag
- `current_state` written after every transition
- `bunx --bun tsc --noEmit` passes

## Verification

1. `bunx --bun tsc --noEmit` passes with all new files
2. All 7 new files exist in correct locations (luca/ directory for sub-skills)
3. Both registries updated with correct import paths
4. lu.skill.ts is a thin orchestrator with zero inline logic
5. State machine correctly models SKIP_BACKLOG conditional path
6. Pre-step hook allows lu-phase-loop from both "scanned" and "configured" states

## Success Criteria

- 7 new files created (1 state machine, 1 context schema, 4 sub-skills, 1 hook)
- 3 existing files modified (orchestrator, hook registry, skill registry)
- TypeScript compiles cleanly
- Sub-skill imports use `../luca/` path consistently
- lu-phase-loop is the largest sub-skill but follows the todo spec decomposition exactly

## Output Specification

New artifacts:

- `src/skills/__schemas/states/lu.states.ts`
- `src/skills/__schemas/lu-context.schemas.ts`
- `src/skills/luca/lu-route.skill.ts`
- `src/skills/luca/lu-configure.skill.ts`
- `src/skills/luca/lu-backlog.skill.ts`
- `src/skills/luca/lu-phase-loop.skill.ts`
- `src/hooks/scripts/pre-step-lu.ts`

Modified artifacts:

- `src/skills/luca/lu.skill.ts` (thin orchestrator)
- `src/hooks/__helpers/hook-registry.ts` (new hook entry)
- `src/skills/__helpers/build-skill-registry.ts` (4 new sub-skill entries)
