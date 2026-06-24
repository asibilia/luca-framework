# Plan 108-05 Summary: Wire observer-emitter into bridge.ts

## Objective

Connect the state machine bridge CLI to the observer dashboard by emitting events on every state transition, field update, suspend, and resume.

## Changes Made

**File modified:** `packages/luca-framework/src/state/bridge.ts`

### 1. Import Addition

Added `import { emitObserverEvent } from "./observer-emitter"` alongside existing imports.

### 2. handleTransition — `state.transition` event

After the `console.log(JSON.stringify(record, null, 2))` output, emits:

- `event_type`: `"state.transition"`
- `session_id`: from snapshot context
- `phase_id`: from snapshot context (nullable)
- `payload`: previous_state, current_state, event_type, complexity

### 3. handleSetField — `state.field_set` event

After the `console.log` output, emits:

- `event_type`: `"state.field_set"`
- `session_id`: from updated context
- `payload`: field, value, previous_value, state

### 4. handleSuspend — `state.suspended` event

After the final `console.log` output, emits:

- `event_type`: `"state.suspended"`
- `session_id`: from actor snapshot
- `phase_id`: from CLI arg
- `payload`: reason, wave_index, completed_task_ids, previous_state, current_state

### 5. handleResumePhase — `state.resumed` event

After the final `console.log` output, emits:

- `event_type`: `"state.resumed"`
- `session_id`: from checkpoint
- `phase_id`: from CLI arg
- `payload`: wave_index, completed_task_ids, previous_state, current_state, checkpoint_cleared

## Exit Criteria Verification

| Criterion                               | Status |
| --------------------------------------- | ------ |
| handleTransition emits state.transition | Pass   |
| handleSetField emits state.field_set    | Pass   |
| handleSuspend emits state.suspended     | Pass   |
| handleResumePhase emits state.resumed   | Pass   |
| All emissions are fire-and-forget       | Pass   |
| All emissions include session_id        | Pass   |
| No emissions on error paths             | Pass   |
| `bunx --bun tsc --noEmit` passes        | Pass   |
| `bun test` passes (3410/3410, 0 fail)   | Pass   |

## Commit

`41cac8a` — `feat(108-05): #44 wire observer-emitter into bridge.ts`
