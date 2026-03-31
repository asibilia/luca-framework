# Phase 257: Step Enforcement Phase 2 -- XState Compound Sub-States

## Phase Context

**Goal:** Add compound sub-states to `executing` in the XState machine so the machine structurally enforces step ordering within a phase. Steps cannot be skipped.

**Complexity:** COMPLEX

**Dependency:** Phase 256 (COMPLETE) -- resolveStateValue/resolveStatePath utilities deployed and all 22 `String(snapshot.value)` call sites replaced.

## Current Architecture

### Top-Level State Flow

The workflow machine (`id: "luca-workflow"`) has these top-level states:

```
idle -> preflight -> routing -> discussing -> planning -> executing -> verifying -> learning -> committing -> complete
```

Currently `executing` is a flat state with a `phaseActor` invoke and event handlers for PHASE*COMPLETE, PHASE_FAILED, SUSPEND, SET_WAVE_COUNT, and DAG_STEP*\* events.

### In-Phase Pipeline Steps

Inside the lu orchestrator's phase loop (lu.skill.ts Step 7), these steps run sequentially while the machine is in the flat `executing` state:

1. **classify** (7c) -- per-phase complexity
2. **research** (7d-v2) -- research pipeline
3. **discuss** (7e) -- phase discussion
4. **plan** (7g) -- plan creation
5. **execute** (7h) -- wave execution
6. **harness** (7i) -- harness fix loop
7. **verify** (7j) -- goal-backward verification
8. **review** (7k) -- code review (parallel reviewers)
9. **learn** (7l) -- learning capture
10. **commit** (inline)

Currently, the machine has NO visibility into which step is active. All steps report as "executing" to the enforcement layer. This phase adds compound sub-states to structurally enforce step ordering.

### Key Existing Components

| File                                                                 | Role                               | Lines of Interest                                      |
| -------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------ |
| `packages/luca-framework/src/state/machine.ts`                       | Workflow machine definition        | L367 (id: "luca-workflow"), L442-501 (executing state) |
| `packages/luca-framework/src/state/types.ts`                         | Event schema (workflowEventSchema) | L264-389                                               |
| `packages/luca-framework/src/state/__helpers/resolve-state-value.ts` | Phase 256 utilities                | Already handles compound `{ executing: "reviewing" }`  |
| `packages/luca-framework/src/state/__helpers/pipeline-position.ts`   | PipelinePosition type              | Already defines `executing.*` compound positions       |
| `src/hooks/scripts/pre-step-lu.ts`                                   | Enforcement hook                   | L17-103 (validStates)                                  |
| `src/hooks/scripts/agent-transition-sync.ts`                         | PostToolUse auto-transitions       | L293-332 (lu orchestrator block)                       |
| `packages/luca-framework/src/state/actors/phase-actor.ts`            | Child actor for wave lifecycle     | Stays on executing node across sub-state changes       |

## Decisions Made

### D1: Machine ID for Absolute Targets

The machine ID is `"luca-workflow"` (machine.ts L367). All absolute targets from compound sub-states must use `#luca-workflow.verifying`, `#luca-workflow.paused`, `#luca-workflow.suspended` -- NOT `#workflow.verifying` as the todo suggested.

**Evidence:** `machine.ts` line 367: `id: "luca-workflow"`

### D2: Top-Level discussing/planning vs. Compound Sub-States

The top-level `discussing` and `planning` states are SEPARATE from the compound sub-states within `executing`. They serve different purposes:

- **Top-level `discussing`**: Entered from `routing` when `shouldRunDiscussion` guard is true. Handles the initial routing-level discussion before any phase starts.
- **Top-level `planning`**: Entered from `discussing` or `routing`. Transitions to `executing` via PLAN_COMPLETE.
- **`executing.discussing`**: Initial sub-state of `executing`. Handles the IN-PHASE discussion (discuss-{NN} agent) during the phase loop.
- **`executing.planning`**: Handles the IN-PHASE planning (plan-{NN} agent) within the phase.

The `DISCUSS_COMPLETE` event is handled by BOTH the top-level `discussing` state AND the `executing.discussing` sub-state. This is safe because XState handles events at the deepest matching state first, and the machine can never be in both `discussing` (top-level) and `executing.discussing` simultaneously. They are mutually exclusive states.

### D3: Event Handling -- Child-First, Then Bubbles Up

XState v5 processes events by checking the deepest child state first. If the child has a handler, it processes the event and it does NOT bubble up to the parent. If the child does not have a handler, the event bubbles up to the parent.

**Consequence for DISCUSS_COMPLETE / PLAN_COMPLETE "double duty":**

- When machine is in top-level `discussing`: DISCUSS_COMPLETE transitions to `planning` (top-level handler)
- When machine is in `executing.discussing`: DISCUSS_COMPLETE transitions to `executing.planning` (child handler consumes it; does NOT bubble to parent `executing.on` block)
- These are mutually exclusive -- no conflict

**Consequence for PHASE*COMPLETE, SUSPEND, DAG_STEP*\* events:**

- These are defined on the parent `executing.on` block (NOT on any child sub-state)
- When any of these fire from within a sub-state, the sub-state has no handler, so the event bubbles up to the parent
- The parent's handler fires, potentially targeting `#luca-workflow.verifying` or `#luca-workflow.suspended`
- This is the correct behavior -- these events can fire from ANY sub-state

**Source:** [XState v5 Events and Transitions](https://stately.ai/docs/transitions), [XState v5 Parent States](https://stately.ai/docs/parent-states)

### D4: phaseActor invoke Coexists with Compound Sub-States

XState v5 allows `invoke` and `states` to coexist on the same state node. The phaseActor invoke is defined on the `executing` state. When `executing` gains compound sub-states, the invoked actor:

- **Starts** when `executing` is entered (regardless of which sub-state is initial)
- **Stays alive** across all internal sub-state transitions (discussing -> planning -> running -> etc.)
- **Stops** only when `executing` is exited entirely (to verifying, paused, suspended, etc.)

No changes needed to the phaseActor invoke configuration.

**Source:** [XState v5 Invoke docs](https://stately.ai/docs/invoke), confirmed by expert panel in todo research summary

### D5: HARNESS_COMPLETE Interaction

Currently HARNESS_COMPLETE is:

1. Fired explicitly by the lu.skill.ts prompt via `luca-bridge transition --event=HARNESS_COMPLETE`
2. Handled on the top-level machine in `executing.on` (currently does nothing useful -- it's defined in the event schema but NOT handled in the executing state's `on` block)

Wait -- re-checking. Looking at machine.ts L442-501, `HARNESS_COMPLETE` is NOT in the current `executing.on` handlers. It's only defined in the `workflowEventSchema` (types.ts L298-301). The lu.skill.ts fires it via luca-bridge, which persists it to the ledger, but the machine does not transition on it.

**With compound sub-states:** `HARNESS_COMPLETE` will be handled in `executing.harnessing` sub-state, transitioning to `executing.verifying`. This gives it an actual structural purpose for the first time.

**No conflict with existing behavior** since HARNESS_COMPLETE currently has no handler in the machine.

### D6: getAllowedEvents() Needs Update

The `getAllowedEvents()` function (machine.ts L671-680) currently indexes into `workflowMachine.config.states?.[state]` to find available events. With compound sub-states, when the state is `{ executing: "discussing" }`:

- `resolveStateValue()` returns `"executing"` (top-level)
- The function looks at `workflowMachine.config.states?.executing.on` which gives the PARENT-level events
- It does NOT return the sub-state events (from `executing.states.discussing.on`)

**Required fix:** Walk the compound state tree to include both parent events and current sub-state events. This is a small change but critical for CLI `status` command accuracy.

### D7: Backward Compatibility for Old state.json

If a persisted `state.json` has `value: "executing"` (flat, from before this change), the enforcement hook must still work. The `validStates` in pre-step-lu.ts includes bare `"executing"` in every set alongside the compound `"executing.*"` positions. The `resolveStatePath()` utility returns `"executing"` for flat values, which matches the bare `"executing"` entry.

## Key Questions Resolved

### Q1: Event Bubbling from Child to Parent

**RESOLVED.** XState v5 checks deepest child first. If child handles the event, parent does not see it. If child has no handler, event bubbles to parent. This is exactly what we need:

- Sub-state-specific events (DISCUSS_COMPLETE in discussing) are consumed by the child
- Global events (PHASE_COMPLETE, SUSPEND) bubble to the parent because no child defines them

### Q2: Machine ID for Absolute Targets

**RESOLVED.** Machine ID is `"luca-workflow"`. Absolute targets: `#luca-workflow.verifying`, `#luca-workflow.paused`, `#luca-workflow.suspended`.

### Q3: HARNESS_COMPLETE Interaction

**RESOLVED.** HARNESS_COMPLETE is currently defined in the event schema but has no handler in the machine. Adding it to `executing.harnessing` is a clean addition with no conflict.

## Gray Areas Requiring Planner Attention

### GA1: New Events vs. Reused Events -- DESIGN DECISION NEEDED

The todo proposes 4 new event types: `EXECUTION_COMPLETE`, `PHASE_VERIFY_PASSED`, `REVIEW_COMPLETE`, `PHASE_LEARN_COMPLETE`. The rationale is to avoid collision with existing events.

However, some existing events could potentially be reused within sub-states:

- `HARNESS_COMPLETE` already exists and can be reused (handled in `executing.harnessing`)
- `VERIFY_PASSED` could be reused in `executing.verifying` but it currently transitions the TOP-LEVEL `verifying` -> `learning`. If it fires while in `executing.verifying`, the child handles it first (good), but the event schema expects no payload for `VERIFY_PASSED` which may be fine for the sub-state transition.

**Recommendation:** Follow the todo's approach -- use NEW event names for sub-state transitions to avoid any ambiguity. The cost is 4 new Zod schema entries; the benefit is zero risk of event name collision between top-level and sub-state handlers. The ONLY reused event should be `HARNESS_COMPLETE` which is currently unused in the machine.

The planner should confirm this decision. The alternative (reusing VERIFY_PASSED, LEARN_COMPLETE inside sub-states) works mechanically in XState but makes the codebase harder to reason about.

### GA2: agent-transition-sync Dual Event Firing

Currently `agent-transition-sync.ts` fires ONE event per agent completion (e.g., `discuss-*` -> `DISCUSS_COMPLETE`). With compound sub-states, the same `DISCUSS_COMPLETE` event needs to work for BOTH:

1. Top-level `discussing` -> `planning` (when machine is in top-level discussing)
2. `executing.discussing` -> `executing.planning` (when machine is in compound sub-state)

This works because of XState's child-first event handling. But the `agent-transition-sync.ts` lu block currently fires `DISCUSS_COMPLETE` without knowing whether the machine is in top-level `discussing` or `executing.discussing`. It fires blindly. In XState, the event is delivered to the current state, and the current state's handler (or its parent's) processes it.

**The design works as-is.** No change needed to the existing DISCUSS_COMPLETE/PLAN_COMPLETE mappings. We only need to ADD new mappings for the new events (EXECUTION_COMPLETE, REVIEW_COMPLETE, PHASE_VERIFY_PASSED, PHASE_LEARN_COMPLETE).

However, there is a subtlety: `agent-transition-sync.ts` fires events via `luca-bridge transition --event=X`. If the machine is NOT in a state that handles that event, luca-bridge will likely log a warning and the event is silently dropped. This is fine for the current design but needs validation during testing.

### GA3: Review Step -- Parallel Agents, Single Transition

The `review-*` agents (review-arch, review-dx, review-security, review-simplify) are spawned in PARALLEL. The `agent-transition-sync.ts` currently has a NOTE that review agents are SKIPPED:

```
// NOTE: review-arch-*, review-dx-*, review-security-*, review-simplify-*
// are SKIPPED -- review loop needs special handling (parallel agents,
// REVIEW_COMPLETE fires only after ALL reviewers finish). Kept in template.
```

With compound sub-states, `executing.reviewing` needs to transition to `executing.learning` via `REVIEW_COMPLETE`. But REVIEW_COMPLETE should only fire after ALL parallel reviewers complete.

**Question for planner:** How does the lu orchestrator know all reviewers are done? Currently, the lu.skill.ts template fires them in parallel and waits for all to return (Claude Code's Agent() calls are sequential within the template, but the reviewers are listed as "spawn PARALLEL"). The orchestrator template itself handles the coordination.

**Recommendation:** The `REVIEW_COMPLETE` event should be fired by the lu.skill.ts template (explicitly via luca-bridge) AFTER all reviewers return, NOT by agent-transition-sync. This matches the existing pattern where `HARNESS_COMPLETE` is fired explicitly by the template. Add a `luca-bridge transition --event=REVIEW_COMPLETE` line after the review block in lu.skill.ts.

### GA4: VERIFY_FAILED Retry Loop and Compound Sub-State Re-Entry

Currently, when `VERIFY_FAILED` fires in top-level `verifying`, it can transition back to `executing` (if canRetryVerification guard passes). With compound sub-states, re-entering `executing` would start at the `initial` sub-state (`executing.discussing`).

**This is wrong.** On a verification retry, the workflow should re-enter execution at `executing.running` (to re-execute and re-verify), not start over from `executing.discussing`.

**Options:**

1. Add a `RETRY_EXECUTION` event that targets `executing.running` directly using `#luca-workflow.executing.running`
2. Use XState's `target` with explicit sub-state: the verifying -> executing retry transition specifies `target: "executing.running"` or `target: { executing: "running" }`
3. Keep the retry targeting `executing` (initial sub-state) and let the lu orchestrator skip discuss/plan steps via its own logic

**Recommendation:** Option 2 -- update the VERIFY_FAILED retry transition to target `executing.running` explicitly. This is the most structurally correct approach. The planner needs to implement this.

### GA5: RESUME from Paused/Suspended -- Which Sub-State?

Currently, `RESUME` in `paused` targets `executing`. With compound sub-states, this enters `executing.discussing` (the initial sub-state). But when resuming from a pause, the user likely wants to continue from where they left off, not restart from discussion.

**Options:**

1. Store the last sub-state in context before pausing, and use a guard/action to route to the correct sub-state on resume
2. Always resume to `executing.running` (most common pause point)
3. Keep resuming to `executing` (initial sub-state) and let the orchestrator template handle skip logic

**Recommendation:** Option 3 for now. The orchestrator template already checks for existing artifacts (plan exists? skip planning. discussion done? skip discussion). Targeting a specific sub-state on resume adds complexity that may not be needed. This can be optimized in a future phase.

## Risks

### R1: TypeScript Type Complexity (MEDIUM)

XState v5 TypeScript types for compound states with inline definitions work correctly, but extracting compound states as separate constants has known issues (GitHub discussion #4697). The implementation must define sub-states inline within the machine definition, not as extracted constants.

**Mitigation:** Keep the compound sub-state definition inline in machine.ts. Do not extract.

### R2: getAllowedEvents() Breakage (LOW-MEDIUM)

The `getAllowedEvents()` function must be updated to walk the compound state tree. If missed, the CLI `status` command and any LLM prompt construction that uses it will show incomplete allowed events.

**Mitigation:** Task 1 should include updating getAllowedEvents(). The function is used in bridge.ts and snapshot.ts.

### R3: agent-transition-sync Event Storm (LOW)

If agent-transition-sync fires an event that the machine cannot handle in its current state (e.g., DISCUSS_COMPLETE fires when machine is in `executing.running`), the event is silently dropped by XState. But luca-bridge may log a warning or return an error code.

**Mitigation:** agent-transition-sync already uses fire-and-forget patterns with `try/catch` and `Bun.spawnSync`. Silent event drops are acceptable. No action needed beyond documentation.

### R4: VERIFY_FAILED Re-Entry to Wrong Sub-State (HIGH)

If the VERIFY_FAILED retry transition is not updated to target a specific sub-state, it will enter `executing.discussing` instead of `executing.running`, breaking the retry flow.

**Mitigation:** Must be addressed in GA4. Planner should include explicit re-entry target in the plan.

### R5: Persisted State Compatibility (LOW)

Existing `state.json` files with flat `"executing"` values will be loaded by the machine. XState v5 handles this by entering the initial sub-state when a parent state is entered. The `resolveStateValue()` utility returns `"executing"` for flat values, and the enforcement hook's `validStates` includes bare `"executing"` as a fallback.

**Mitigation:** Already handled by Phase 256 utilities and backward-compat design in validStates.

## Files to Modify

1. `packages/luca-framework/src/state/machine.ts` -- Add compound sub-states to executing, update getAllowedEvents(), fix absolute targets
2. `packages/luca-framework/src/state/types.ts` -- Add 4 new events to workflowEventSchema (EXECUTION_COMPLETE, PHASE_VERIFY_PASSED, REVIEW_COMPLETE, PHASE_LEARN_COMPLETE)
3. `src/hooks/scripts/pre-step-lu.ts` -- Update validStates to include compound positions
4. `src/hooks/scripts/agent-transition-sync.ts` -- Add new event mappings for execute-_, verify-_ (PHASE_VERIFY_PASSED), learn-\* (PHASE_LEARN_COMPLETE)
5. `src/skills/luca/lu.skill.ts` -- Add explicit `luca-bridge transition --event=REVIEW_COMPLETE` after review block, add `luca-bridge transition --event=EXECUTION_COMPLETE` after execute agent

## Sources

- [XState v5 Events and Transitions](https://stately.ai/docs/transitions) -- child-first event handling, event bubbling
- [XState v5 Parent States](https://stately.ai/docs/parent-states) -- compound state documentation
- [XState v5 Invoke](https://stately.ai/docs/invoke) -- invoke coexists with states on same node
- [XState v5 State Machines](https://stately.ai/docs/states) -- compound state value representation
- [GitHub Discussion #4697](https://github.com/statelyai/xstate/discussions/4697) -- TypeScript extraction issues with compound states
