---
id: "108-05"
title: "Wire observer-emitter into bridge.ts transitions"
phase: 108
wave: 2
complexity: SIMPLE
depends_on: ["108-04"]
tasks:
  - id: "108-05-1"
    title: "Emit observer events from bridge.ts transition and set-field commands"
    goal: "Wire emitObserverEvent into handleTransition and handleSetField so state machine transitions are automatically reported to the observer dashboard"
    verify: "handleTransition emits a state.transition event with previous_state, current_state, event_type; handleSetField emits a state.field_set event with field, value, previous_value; events are fire-and-forget (no impact on bridge performance)"
  - id: "108-05-2"
    title: "Emit observer events from bridge.ts suspend and resume-phase commands"
    goal: "Wire emitObserverEvent into handleSuspend and handleResumePhase for phase lifecycle visibility"
    verify: "handleSuspend emits a state.suspended event; handleResumePhase emits a state.resumed event; both include phase_id and session context"
---

# 108-05: Wire observer-emitter into bridge.ts

## Goal

Connect the state machine bridge CLI to the observer dashboard by emitting events on every state transition, field update, suspend, and resume. This gives the observer real-time visibility into workflow state changes via TypeScript-native event emission (not shell-based curl).

## Context

@packages/luca-framework/src/state/bridge.ts -- State machine bridge CLI (1047 lines)
@packages/luca-framework/src/state/observer-emitter.ts -- Fire-and-forget emitter (after Plans 01 + 04 apply auth + SSRF fixes)

**Current state:**

- `bridge.ts` has 12 subcommands. Four of them mutate state: `transition`, `set-field`, `suspend`, `resume-phase`
- `observer-emitter.ts` exports `emitObserverEvent()` which is fire-and-forget
- Currently, no bridge commands emit observer events -- the observer only receives events from hook shell scripts via curl
- The bridge already appends to the session ledger (fire-and-forget pattern), so adding observer emission follows the same pattern

**Why this matters:**

- Currently, the observer dashboard sees hook events (session.start, pre-commit, etc.) but NOT state machine transitions
- State transitions (START, COMPLETE_PHASE, SET_COMPLEXITY, SUSPEND, RESUME_PHASE) are the most important workflow events
- After this plan, the observer gets full workflow visibility without requiring shell hooks

**Dependency on Plan 04:**

Plan 04 adds SSRF protection to `observer-emitter.ts`. This plan imports the emitter, so it should run after Plan 04 ensures the emitter is secure. The emitter is also updated by Plan 01 to send the API key header.

## Tasks

### Task 108-05-1: Emit Events from transition and set-field

**File to modify:** `packages/luca-framework/src/state/bridge.ts`

Add import at the top of the file:

```typescript
import { emitObserverEvent } from "./observer-emitter";
```

**In `handleTransition`** (around line 552, after `console.log(JSON.stringify(record, null, 2))`):

```typescript
// Emit to observer dashboard (fire-and-forget)
emitObserverEvent("state.transition", {
  session_id: nextSnapshot.context.session_id,
  phase_id: nextSnapshot.context.current_phase ?? undefined,
  payload: {
    previous_state: String(prevState),
    current_state: String(nextSnapshot.value),
    event_type: eventType,
    complexity: nextSnapshot.context.complexity,
  },
});
```

**In `handleSetField`** (around line 463, after the `console.log` output):

```typescript
// Emit to observer dashboard (fire-and-forget)
emitObserverEvent("state.field_set", {
  session_id: (updatedContext.session_id as string) ?? undefined,
  payload: {
    field: fieldPath,
    value,
    previous_value: previousValue ?? null,
    state: String(snapshotJson.value),
  },
});
```

**Key decisions:**

- Place emission AFTER the `console.log` output so the bridge CLI responds first, then emits asynchronously
- Use the same fire-and-forget pattern as `appendLedgerEntry` -- call without await, no `.catch()` needed because `emitObserverEvent` already swallows errors internally
- Include `session_id` at the top level (matching ObserverEventSchema) for SSE client filtering
- Include `phase_id` for dashboard phase tracking
- Put detailed transition data in `payload` (matching the event store's flexible payload field)
- Event types use `state.*` namespace to distinguish from hook events

### Task 108-05-2: Emit Events from suspend and resume-phase

**In `handleSuspend`** (around line 797, after the final `console.log`):

```typescript
// Emit to observer dashboard (fire-and-forget)
emitObserverEvent("state.suspended", {
  session_id: sessionId,
  phase_id: phaseId,
  payload: {
    reason,
    wave_index: waveIndex,
    completed_task_ids: completedTaskIds,
    previous_state: String(prevState),
    current_state: String(nextSnapshot.value),
  },
});
```

**In `handleResumePhase`** (around line 905, after the final `console.log`):

```typescript
// Emit to observer dashboard (fire-and-forget)
emitObserverEvent("state.resumed", {
  session_id: checkpoint.session_id,
  phase_id: phaseId,
  payload: {
    wave_index: checkpoint.wave_index,
    completed_task_ids: checkpoint.completed_task_ids,
    previous_state: String(prevState),
    current_state: String(nextSnapshot.value),
    checkpoint_cleared: !keepCheckpoint,
  },
});
```

**Event type summary:**

| Bridge Command | Observer Event Type | Key Payload Fields                                    |
| -------------- | ------------------- | ----------------------------------------------------- |
| `transition`   | `state.transition`  | previous_state, current_state, event_type, complexity |
| `set-field`    | `state.field_set`   | field, value, previous_value, state                   |
| `suspend`      | `state.suspended`   | reason, wave_index, completed_task_ids                |
| `resume-phase` | `state.resumed`     | wave_index, completed_task_ids, checkpoint_cleared    |

**What we intentionally do NOT emit from:**

- `read-*` commands -- read-only, no state change
- `snapshot` -- regenerates STATE.md but does not change state
- `ensure-init` -- initialization is already covered by session.start hook events
- `gate-check` -- read-only query

## Exit Criteria

1. `handleTransition` emits `state.transition` event after successful transition
2. `handleSetField` emits `state.field_set` event after successful field update
3. `handleSuspend` emits `state.suspended` event after successful suspension
4. `handleResumePhase` emits `state.resumed` event after successful resume
5. All emissions are fire-and-forget -- bridge CLI response time is unaffected
6. All emissions include `session_id` for SSE client filtering
7. No emissions occur on failed commands (error paths exit before emission)
8. `bunx --bun tsc --noEmit` passes
9. `bun test` passes
