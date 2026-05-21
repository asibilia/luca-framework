---
phase: 257
plan: 1
type: improvement
autonomous: false
wave: 1
depends_on: []
---

# Phase 257 Plan 1: XState Compound Sub-States for Executing

## Objective

Add compound sub-states to the `executing` state in the XState workflow machine so that pipeline step ordering within a phase is structurally enforced. Currently all in-phase steps (discuss, plan, execute, harness, verify, review, learn, commit) report as flat `"executing"` -- the machine has no visibility into which step is active. After this phase, the machine value will be `{ executing: "discussing" }`, `{ executing: "running" }`, etc., and the enforcement hook will block agents from running in the wrong sub-state.

This eliminates an entire class of bugs where agents fire in wrong pipeline positions, because the machine itself will reject invalid transitions rather than relying on external enforcement logic alone.

## Context

@.planning/phases/257-step-enforcement-compound-sub-states/01-CONTEXT.md -- Discussion analysis with all design decisions and gray areas resolved
@.planning/todos/pending/step-enforcement-phase-2-compound-sub-states.md -- Full todo with implementation details
@packages/luca-framework/src/state/machine.ts -- Current machine definition (executing state at L442-502, VERIFY_FAILED at L517-531, getAllowedEvents at L671-680)
@packages/luca-framework/src/state/types.ts -- workflowEventSchema discriminated union (L264-389)
@src/hooks/scripts/agent-transition-sync.ts -- Lu orchestrator block (L293-332)
@src/hooks/scripts/pre-step-lu.ts -- validStates map (L61-100)
@packages/luca-framework/src/state/**helpers/pipeline-position.ts -- PipelinePosition type already defines compound positions
@packages/luca-framework/src/state/**helpers/resolve-state-value.ts -- resolveStatePath() already handles compound objects
@src/skills/luca/lu.skill.ts -- Skill prompt template with luca-bridge transition calls

## Tasks

### 1. Add 4 new event types to workflowEventSchema

**Type:** auto
**TDD:** false
**Depends on:** none

Add 4 new events to the `workflowEventSchema` discriminated union in `types.ts`. These are sub-state-scoped events distinct from existing top-level events, to avoid any ambiguity between top-level handlers and compound sub-state handlers.

New events:

- `EXECUTION_COMPLETE` -- fired when `execute-*` agent completes, transitions `running` -> `harnessing`
- `PHASE_VERIFY_PASSED` -- fired when `verify-*` completes within a phase, transitions `verifying` -> `reviewing` (distinct from top-level `VERIFY_PASSED`)
- `REVIEW_COMPLETE` -- fired when all parallel `review-*` agents complete, transitions `reviewing` -> `learning`
- `PHASE_LEARN_COMPLETE` -- fired when `learn-*` completes within a phase, transitions `learning` -> `committing`

Each event should follow the existing pattern: a `z.object` with `type: z.literal("EVENT_NAME")` and optional payload fields. These events carry minimal data:

```typescript
z.object({ type: z.literal("EXECUTION_COMPLETE") }),
z.object({ type: z.literal("PHASE_VERIFY_PASSED") }),
z.object({ type: z.literal("REVIEW_COMPLETE") }),
z.object({ type: z.literal("PHASE_LEARN_COMPLETE") }),
```

**Files to create/edit:**

- `packages/luca-framework/src/state/types.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- The 4 new event types appear in the `WorkflowEvent` union type

### 2. Replace flat executing state with compound sub-states in machine.ts

**Type:** checkpoint:human-verify
**TDD:** false
**Depends on:** 1

This is the core structural change. Replace the flat `executing` state with a compound state containing 8 sub-states: `discussing`, `planning`, `running`, `harnessing`, `verifying`, `reviewing`, `learning`, `committing`.

Key design decisions that MUST be followed:

**a) Machine ID is `"luca-workflow"` (L367).** All absolute targets exiting the compound state MUST use `#luca-workflow.verifying`, `#luca-workflow.paused`, `#luca-workflow.suspended` -- NOT `#workflow.*`.

**b) The `invoke` block (phaseActor) stays on the parent `executing` node.** XState v5 allows `invoke` and `states` to coexist. The phaseActor starts when `executing` is entered and stays alive across all sub-state transitions. No changes to the invoke config.

**c) Sub-state event handlers:**

- `discussing.on`: `DISCUSS_COMPLETE` -> `planning`, `SKIP` -> `planning`
- `planning.on`: `PLAN_COMPLETE` -> `running`
- `running.on`: `EXECUTION_COMPLETE` -> `harnessing`
- `harnessing.on`: `HARNESS_COMPLETE` -> `verifying`
- `verifying.on`: `PHASE_VERIFY_PASSED` -> `reviewing`
- `reviewing.on`: `REVIEW_COMPLETE` -> `learning`
- `learning.on`: `PHASE_LEARN_COMPLETE` -> `committing`
- `committing`: empty (terminal sub-state, PHASE_COMPLETE bubbles to parent)

All sub-state transitions should include `actions: ["recordTransition"]`.

**d) Parent-level events stay on `executing.on`:** `PHASE_COMPLETE`, `PHASE_FAILED`, `SUSPEND`, `SET_WAVE_COUNT`, `DAG_STEP_START`, `DAG_STEP_COMPLETE`, `DAG_STEP_FAILED`, `DAG_STEP_RETRY`. These can fire from ANY sub-state -- they bubble up because no child defines them.

**e) Define sub-states INLINE.** Do NOT extract as separate constants. XState v5 TypeScript types have known issues with extracted compound state constants (GitHub discussion #4697).

**f) CRITICAL -- VERIFY_FAILED retry target.** The `VERIFY_FAILED` handler in the top-level `verifying` state (L517-531) currently targets `"executing"`. With compound sub-states, this would enter the `initial` sub-state (`executing.discussing`), which is WRONG for a retry. Update the target to `"#luca-workflow.executing.running"` so retries re-enter at the execution step, not the discussion step. This is the single highest-risk change in this phase.

**g) RESUME and RESUME_PHASE targets.** In `paused.on.RESUME` (L616-619) and `suspended.on.RESUME_PHASE` (L635-638), the targets are `"executing"` which will enter the initial sub-state `executing.discussing`. Per discussion decision GA5, keep this as-is for now -- the orchestrator template already handles skip logic for completed steps. This can be optimized in a future phase.

**Files to create/edit:**

- `packages/luca-framework/src/state/machine.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- The `executing` state has `initial: "discussing"` and 8 sub-states
- The `VERIFY_FAILED` retry transition targets `#luca-workflow.executing.running`
- The `phaseActor` invoke remains on the parent `executing` node
- Parent-level events (PHASE_COMPLETE, SUSPEND, etc.) remain in `executing.on`

### 3. Update getAllowedEvents() to walk compound state tree

**Type:** auto
**TDD:** false
**Depends on:** 2

The current `getAllowedEvents()` function (machine.ts L671-680) only looks at `workflowMachine.config.states?.[state].on` which returns parent-level events only. With compound sub-states, it must also include sub-state-specific events.

Update the function to:

1. Get the parent state events as before
2. If the state value is compound (an object), walk into the sub-state's `on` block
3. Merge both parent and sub-state events into the result

The function receives a snapshot, so it can check `snapshot.value` to determine if the state is compound. Use `resolveStatePath(snapshot.value)` to get the full path, then navigate the config tree.

**Files to create/edit:**

- `packages/luca-framework/src/state/machine.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- When state is `{ executing: "reviewing" }`, `getAllowedEvents()` returns both parent events (PHASE_COMPLETE, SUSPEND, etc.) AND sub-state events (REVIEW_COMPLETE)

### 4. Update pre-step-lu.ts validStates with compound positions

**Type:** auto
**TDD:** false
**Depends on:** 2

Update the `validStates` map in `pre-step-lu.ts` to include compound sub-state positions alongside bare `"executing"` for backward compatibility.

Updated mappings:

```
"classify-":     ["idle", "scanned", "configured", "executing", "executing.discussing"]
"discuss-":      ["scanned", "configured", "executing", "executing.discussing"]
"plan-":         ["scanned", "configured", "executing", "executing.planning"]
"plan-gaps-":    ["executing", "executing.planning"]
"plan-review-":  ["executing", "executing.planning"]
"plan-revise-":  ["executing", "executing.planning"]
"execute-":      ["executing", "executing.running"]
"execute-gaps-": ["executing", "executing.running"]
"harness-":      ["executing", "executing.harnessing"]
"fix-":          ["executing", "executing.harnessing", "executing.running"]
"verify-":       ["executing", "executing.verifying"]
"review-":       ["executing", "executing.reviewing"]
"learn-":        ["executing", "executing.learning"]
"process-data-": ["executing", "executing.learning"]
```

Bare `"executing"` remains in every set for backward compatibility with old `state.json` files that have flat `"executing"` values.

Research agents, milestone agents, and review-accuracy/completeness/actionability agents keep `["executing"]` only -- they are not part of the linear pipeline and run within the parent executing state without sub-state awareness.

**Files to create/edit:**

- `src/hooks/scripts/pre-step-lu.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Each pipeline agent prefix has both bare `"executing"` and its corresponding compound position
- Research and milestone agents still have only `["executing"]`

### 5. Update agent-transition-sync.ts with new event mappings

**Type:** auto
**TDD:** false
**Depends on:** 1

Update the lu orchestrator agent mappings in `agent-transition-sync.ts` (L293-332) to fire the new sub-state events for agents that don't already have mappings.

Changes to the `agents` array in the lu orchestrator block:

1. **Keep existing** `discuss-` -> `DISCUSS_COMPLETE` (now does double duty: top-level discussing->planning AND executing.discussing->executing.planning)
2. **Keep existing** `plan-` -> `PLAN_COMPLETE` (now does double duty: top-level planning->executing AND executing.planning->executing.running)
3. **Add new** `execute-` (excl. `execute-gaps-`) -> `EXECUTION_COMPLETE` (transitions executing.running->executing.harnessing)
4. **Keep existing** `verify-` -> but CHANGE event to `PHASE_VERIFY_PASSED` (transitions executing.verifying->executing.reviewing). The existing `VERIFY_PASSED` was for the TOP-LEVEL verifying state. Within executing, we use `PHASE_VERIFY_PASSED` to avoid collision.
5. **Keep existing** `learn-` -> but CHANGE event to `PHASE_LEARN_COMPLETE` (transitions executing.learning->executing.committing). The existing `LEARN_COMPLETE` was for the TOP-LEVEL learning state.
6. **Keep existing** `process-data-` -> `LEARN_COMPLETE` (this fires from top-level `learning` state, unchanged)

NOTE: `review-*` agents are NOT added here. They run in parallel and REVIEW_COMPLETE must fire only after ALL reviewers complete. This is handled in Task 6.

NOTE: `harness-*` remains SKIPPED in agent-transition-sync (as noted in existing comment L315-316). HARNESS_COMPLETE is already fired explicitly by the lu.skill.ts template.

**Files to create/edit:**

- `src/hooks/scripts/agent-transition-sync.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `execute-` prefix has a new mapping to `EXECUTION_COMPLETE`
- `verify-` prefix fires `PHASE_VERIFY_PASSED` instead of `VERIFY_PASSED`
- `learn-` prefix fires `PHASE_LEARN_COMPLETE` instead of `LEARN_COMPLETE`
- `review-*` agents are NOT in the mappings (parallel agents need special handling)

### 6. Add REVIEW_COMPLETE and EXECUTION_COMPLETE emissions to lu.skill.ts

**Type:** auto
**TDD:** false
**Depends on:** 1

Update the lu.skill.ts template to emit two new luca-bridge transitions:

**a) After Step 7k (code review block, after all 4 parallel reviewers return):**
Add between the review block (L403-409) and Step 7l (learning capture, L411):

````
After ALL reviewers return:
```bash
luca-bridge transition --event=REVIEW_COMPLETE 2>/dev/null || true
````

```

This is necessary because parallel reviewer agents cannot be tracked by agent-transition-sync (which fires on individual agent completion, not on all-complete). The template knows when all 4 have returned because it waits for all Agent() calls to finish.

**b) The EXECUTION_COMPLETE event is handled by agent-transition-sync (Task 5) when `execute-*` completes, so no explicit emission is needed in the template for that event.**

**Files to create/edit:**
- `src/skills/luca/lu.skill.ts`

**Verification:**
- The template includes `luca-bridge transition --event=REVIEW_COMPLETE` after the parallel reviewer block
- The REVIEW_COMPLETE emission is placed BEFORE the learning capture step

## Verification

Overall verification after all tasks complete:

1. **Type safety:** `bunx --bun tsc --noEmit` passes cleanly across the entire monorepo
2. **Machine structure:** The `executing` state in machine.ts has:
   - `initial: "discussing"`
   - 8 sub-states: discussing, planning, running, harnessing, verifying, reviewing, learning, committing
   - Parent-level events on `executing.on` (PHASE_COMPLETE, PHASE_FAILED, SUSPEND, SET_WAVE_COUNT, DAG_STEP_*)
   - Sub-state-specific events on each child state's `on` block
3. **VERIFY_FAILED retry:** The transition targets `#luca-workflow.executing.running`, NOT bare `executing`
4. **Event schema:** `workflowEventSchema` includes EXECUTION_COMPLETE, PHASE_VERIFY_PASSED, REVIEW_COMPLETE, PHASE_LEARN_COMPLETE
5. **Enforcement hook:** `pre-step-lu.ts` validStates includes compound positions for all pipeline agents
6. **Agent sync:** `agent-transition-sync.ts` fires correct events for execute-*, verify-*, learn-* agents
7. **Skill template:** lu.skill.ts emits REVIEW_COMPLETE after the parallel review block
8. **Backward compat:** Bare `"executing"` remains in all validStates sets -- old state.json files still work

## Success Criteria

- The XState machine structurally enforces pipeline step ordering within the executing state
- Invalid transitions (e.g., spawning `learn-*` while in `executing.running`) are rejected by XState event handling (sub-state has no handler, event does not bubble to match)
- The enforcement hook (`pre-step-lu.ts`) provides a secondary guard layer with compound position matching
- All existing pipeline flows continue to work (DISCUSS_COMPLETE, PLAN_COMPLETE do double duty for top-level and sub-state transitions)
- The VERIFY_FAILED retry loop correctly re-enters at `executing.running`, not `executing.discussing`

## Output Specification

- Modified: `packages/luca-framework/src/state/machine.ts` -- compound sub-states in executing, updated getAllowedEvents(), updated VERIFY_FAILED target
- Modified: `packages/luca-framework/src/state/types.ts` -- 4 new event types in workflowEventSchema
- Modified: `src/hooks/scripts/pre-step-lu.ts` -- compound positions in validStates
- Modified: `src/hooks/scripts/agent-transition-sync.ts` -- new/updated event mappings for execute-*, verify-*, learn-*
- Modified: `src/skills/luca/lu.skill.ts` -- REVIEW_COMPLETE emission after code review block
```
