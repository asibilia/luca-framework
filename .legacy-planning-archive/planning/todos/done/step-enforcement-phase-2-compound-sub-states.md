---
title: "Step Enforcement Phase 2: XState Compound Sub-States"
area: state-machine
created: 2026-03-31
source: conversation — pipeline step enforcement planning session
priority: high
depends_on: [step-enforcement-phase-1-value-normalization]
---

## Context

This is Phase 2 of the step enforcement migration. Phase 1 (value normalization) must be complete first — it replaces all 22 `String(snapshot.value)` call sites with `resolveStateValue()`, making the codebase forward-compatible with compound state values.

**The core principle:** Pipeline step IS state, not data. It determines which operations are valid — that is the definition of state. XState's value proposition is making invalid state transitions impossible. This phase adds compound sub-states to `executing` so the machine structurally enforces step ordering.

**XState v5 confirms:** `invoke` and `states` coexist on the same node. The existing `phaseActor` stays alive across sub-state transitions (parent is not re-entered). No conflict.

## Task

### Wave 2.1: Add sub-states to `executing`

**`packages/luca-framework/src/state/machine.ts`** (~line 441)

Replace the flat `executing` state with a compound state:

```typescript
executing: {
  initial: "discussing",
  invoke: {
    id: "phase",
    src: "phaseActor",
    input: ({ context }) => ({ ... }),  // unchanged
    onDone: { target: "#workflow.verifying", actions: [...] },
    onError: { target: "#workflow.paused", actions: [...] },
  },
  states: {
    discussing: {
      on: {
        DISCUSS_COMPLETE: { target: "planning", actions: ["recordTransition"] },
        SKIP: { target: "planning", actions: ["recordTransition"] },
      },
    },
    planning: {
      on: {
        PLAN_COMPLETE: { target: "running", actions: ["recordTransition"] },
      },
    },
    running: {
      on: {
        EXECUTION_COMPLETE: { target: "harnessing", actions: ["recordTransition"] },
      },
    },
    harnessing: {
      on: {
        HARNESS_COMPLETE: { target: "verifying", actions: ["recordTransition"] },
      },
    },
    verifying: {
      on: {
        PHASE_VERIFY_PASSED: { target: "reviewing", actions: ["recordTransition"] },
      },
    },
    reviewing: {
      on: {
        REVIEW_COMPLETE: { target: "learning", actions: ["recordTransition"] },
      },
    },
    learning: {
      on: {
        PHASE_LEARN_COMPLETE: { target: "committing", actions: ["recordTransition"] },
      },
    },
    committing: {},
  },
  on: {
    // Events that can fire from ANY sub-state (lifted to parent):
    PHASE_COMPLETE: { target: "#workflow.verifying", actions: ["recordPhaseResult", "recordTransition"] },
    PHASE_FAILED: { target: "#workflow.verifying", actions: ["recordPhaseError", "recordTransition"] },
    SUSPEND: { target: "#workflow.suspended", actions: ["recordSuspend", "recordTransition"] },
    SET_WAVE_COUNT: { actions: ["setWaveCount", "recordTransition"] },
    DAG_STEP_START: { actions: ["recordDagStepStart", "recordTransition"] },
    DAG_STEP_COMPLETE: { actions: ["recordDagStepComplete", "recordTransition"] },
    DAG_STEP_FAILED: { actions: ["recordTransition"] },
    DAG_STEP_RETRY: { actions: ["recordTransition"] },
  },
},
```

**Sub-state naming decisions:**

- Uses `"running"` (not `"executing"`) to avoid confusion with the parent state
- Uses `"harnessing"` and `"verifying"` within executing — distinct from the top-level `"verifying"` state
- Top-level targets use `#workflow.verifying` (or whatever the machine ID is) to exit the compound state

### Wave 2.2: Add new events to type schema

**`packages/luca-framework/src/state/types.ts`**

Add to `workflowEventSchema` discriminated union:

- `EXECUTION_COMPLETE` (data: optional) — fired when execute-\* agent completes
- `PHASE_VERIFY_PASSED` (data: optional) — fired when verify-\* completes within a phase (distinct from top-level VERIFY_PASSED)
- `REVIEW_COMPLETE` (data: optional) — fired when review-\* agents complete
- `PHASE_LEARN_COMPLETE` (data: optional) — fired when learn-\* completes within a phase

These are sub-state-scoped events distinct from existing top-level events.

### Wave 2.3: Update enforcement hook validStates

**`src/hooks/scripts/pre-step-lu.ts`**

Update `validStates` to use compound positions from `resolveStatePath`:

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

**Backward compat:** Bare `"executing"` stays in every set. If `pipeline_step` is not yet set (old state.json, Phase 1 only), the agent is still allowed. Enforcement only tightens once compound sub-states are active and `snapshot.value` is an object.

Research agents, milestone agents keep `["executing"]` only — not part of the linear pipeline.

### Wave 2.4: Update agent-transition-sync to fire sub-state events

**`src/hooks/scripts/agent-transition-sync.ts`** (lu orchestrator block, ~lines 294-332)

Update the lu orchestrator agent mappings to fire the appropriate events:

- `discuss-*` completes → fire `DISCUSS_COMPLETE` (already exists — now transitions sub-state from discussing→planning)
- `plan-*` completes (excl. plan-review/plan-revise) → fire `PLAN_COMPLETE` (already exists — now transitions planning→running)
- `execute-*` completes → fire new `EXECUTION_COMPLETE` (transitions running→harnessing)
- `harness-*` completes → `HARNESS_COMPLETE` already exists (transitions harnessing→verifying sub-state)
- `verify-*` completes (excl. verify-route) → fire new `PHASE_VERIFY_PASSED` (transitions verifying→reviewing sub-state)
- `review-*` completes → fire new `REVIEW_COMPLETE` (transitions reviewing→learning)
- `learn-*` completes (excl. learn-route) → fire new `PHASE_LEARN_COMPLETE` (transitions learning→committing)

Note: Some existing events (DISCUSS_COMPLETE, PLAN_COMPLETE) do double duty — they already transition top-level states AND will now transition sub-states. The sub-state machine handles the event first; if no sub-state matches, it bubbles to the parent.

### Wave 2.5: resetContext — No Change Needed

`resetContext` is an action on the parent machine. When the machine transitions back to `idle`, the compound state is exited entirely and all sub-state is lost. No explicit cleanup needed.

### Wave 2.6: Verify

- `bunx --bun tsc --noEmit` passes
- Run `/lu` on a test phase — observe `state.json` `value` changes through:
  `{ executing: "discussing" }` → `{ executing: "planning" }` → `{ executing: "running" }` → `{ executing: "harnessing" }` → `{ executing: "verifying" }` → `{ executing: "reviewing" }` → `{ executing: "learning" }` → `{ executing: "committing" }`
- Manually try to spawn `learn-255` when state is `{ executing: "running" }` — expect `pre-step-lu` to block with: `cannot run learn-255 from state 'executing.running'. Valid states: [executing, executing.learning]`
- Verify statusline shows correct state throughout
- Run with old state.json (flat `"executing"`) — all agents still work via bare `"executing"` fallback in validStates

## Notes

- Total: 5 files modified (machine.ts, types.ts, pre-step-lu.ts, agent-transition-sync.ts, and possibly pre-step-lu-allowlist.ts for new event names)
- The `phaseActor` invoke on `executing` stays alive across all sub-state transitions — XState does NOT re-enter the parent state during internal transitions
- Events on the parent `on:` block (PHASE*COMPLETE, SUSPEND, DAG_STEP*\*, etc.) can fire from ANY sub-state — they "lift" above the sub-state machine
- The `getAllowedEvents()` function in machine.ts (line 674) needs attention — it indexes into `workflowMachine.config.states` which may not include sub-states. May need to walk the compound state tree. Validate during implementation.

## Expert Panel Research Summary

Three expert agents evaluated this approach:

1. **XState Expert** — Confirmed 22 call sites break with compound states. Recommended Phase 1 normalization first. Flagged phaseActor conflict (resolved: XState v5 supports invoke + states on same node).

2. **Architecture Reviewer** — Recommended compound states: "Pipeline step IS state, not data. XState's value proposition is making invalid state transitions impossible." Higher upfront cost justified by elimination of entire bug class.

3. **Migration Analyst** — Mapped all 22 call sites across 6 files. Proposed `resolveStateValue()` utility as single fix point. Confirmed two-phase migration is safe.

4. **XState Invoke+States Verification** — Confirmed XState v5 TypeScript types allow both `invoke` and `states` on same `StateNodeConfig`. Official docs confirm invoked actor persists across internal sub-state transitions.
