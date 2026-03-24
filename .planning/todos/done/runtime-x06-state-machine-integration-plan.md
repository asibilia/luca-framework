---
title: "Runtime X06: State machine integration plan — exact changes for DAG lifecycle events"
area: runtime-architecture
created: 2026-03-24
source: docs/runtime-architecture/research/backlog-integration.md
depends_on: []
phase: runtime-x
estimated_files: 3
---

## Context

The DAG executor needs to integrate with the existing XState v5 state machine (`packages/luca-framework/src/state/machine.ts`, 616 lines). The state machine has 13 workflow states (idle, preflight, routing, discussing, planning, executing, verifying, learning, committing, complete, cooldown, paused, suspended, failed) with guards, actions, and a phase actor.

**Integration approach decision (from risk analysis Risk 13):** The DAG executor sends XState events, and the state machine remains the authority on valid transitions. The executor does NOT maintain its own state — it reads state from the machine and sends events to advance it. Each DAG step completion maps to an XState event.

## Task

### 1. Add DAG lifecycle events to the event union

**File:** `packages/luca-framework/src/state/types.ts`

Add new event types to the `WorkflowEvent` discriminated union. Find the existing event type definitions and add:

```typescript
/** DAG executor reports a step has started */
| { type: "DAG_STEP_START"; step_id: string; step_name: string; wave: number }
/** DAG executor reports a step completed successfully */
| { type: "DAG_STEP_COMPLETE"; step_id: string; step_name: string; output?: Record<string, unknown> }
/** DAG executor reports a step failed */
| { type: "DAG_STEP_FAILED"; step_id: string; step_name: string; error: string }
/** DAG executor reports a step is being retried */
| { type: "DAG_STEP_RETRY"; step_id: string; step_name: string; attempt: number; max_attempts: number }
```

These events are informational (logged to ledger) during the executing state. They do NOT cause state transitions — the existing `PHASE_COMPLETE` and `PHASE_FAILED` events handle transitions. DAG step events are sub-phase granularity.

### 2. Add DAG step tracking to context

**File:** `packages/luca-framework/src/state/types.ts`

Add to the `WorkflowContext` type:

```typescript
/** Active DAG step tracking (only populated when workflow.engine is "dag") */
dag_execution?: {
  /** Current active step ID */
  current_step_id: string | undefined;
  /** Steps completed in current phase */
  completed_steps: string[];
  /** Current wave number (0-indexed) */
  current_wave: number;
  /** Total waves in current phase */
  total_waves: number;
  /** DAG execution mode flag */
  active: boolean;
};
```

Add the corresponding Zod schema field to `workflowContextSchema`:

```typescript
dag_execution: z.object({
  current_step_id: z.string().optional(),
  completed_steps: z.array(z.string()).default([]),
  current_wave: z.number().int().nonnegative().default(0),
  total_waves: z.number().int().nonnegative().default(0),
  active: z.boolean().default(false),
}).optional(),
```

### 3. Add actions to record DAG step events

**File:** `packages/luca-framework/src/state/machine.ts`

In the `actions` section of the `setup()` call, add:

```typescript
/** Record DAG step start */
recordDagStepStart: assign({
  dag_execution: ({ context, event }) => {
    if (event.type !== "DAG_STEP_START") return context.dag_execution;
    return {
      ...context.dag_execution,
      current_step_id: event.step_id,
      current_wave: event.wave,
      active: true,
      completed_steps: context.dag_execution?.completed_steps ?? [],
      total_waves: context.dag_execution?.total_waves ?? 0,
    };
  },
}),

/** Record DAG step completion */
recordDagStepComplete: assign({
  dag_execution: ({ context, event }) => {
    if (event.type !== "DAG_STEP_COMPLETE") return context.dag_execution;
    return {
      ...context.dag_execution,
      current_step_id: undefined,
      completed_steps: [
        ...(context.dag_execution?.completed_steps ?? []),
        event.step_id,
      ],
      active: true,
      current_wave: context.dag_execution?.current_wave ?? 0,
      total_waves: context.dag_execution?.total_waves ?? 0,
    };
  },
}),
```

### 4. Handle DAG events in the executing state

**File:** `packages/luca-framework/src/state/machine.ts`

In the `executing` state's `on` handler, add DAG step events as self-transitions (stay in executing state, just record context):

```typescript
executing: {
  // ... existing invoke and on handlers ...
  on: {
    // ... existing PHASE_COMPLETE, PHASE_FAILED, SUSPEND handlers ...

    // DAG step events — self-transitions that update context
    DAG_STEP_START: {
      actions: ["recordDagStepStart", "recordTransition"],
    },
    DAG_STEP_COMPLETE: {
      actions: ["recordDagStepComplete", "recordTransition"],
    },
    DAG_STEP_FAILED: {
      // Step failure is recorded but does NOT transition to failed.
      // The DAG executor handles retry logic. If all retries exhausted,
      // the executor sends PHASE_FAILED which transitions to verifying/failed.
      actions: ["recordTransition"],
    },
    DAG_STEP_RETRY: {
      actions: ["recordTransition"],
    },
  },
},
```

### 5. Expose DAG state via bridge CLI

**File:** `packages/luca-framework/src/state/bridge.ts`

Add DAG execution state to the `read-status` output. In the `handleReadStatus` function, include `dag_execution` in the returned JSON:

```typescript
// In handleReadStatus, add to the output object:
dag_execution: context.dag_execution ?? null,
```

This allows shell-based skills to read: `luca-bridge read-status | bun -e "..." | grep dag_execution`

### 6. Handle checkpoint/resume for DAG state

The existing `suspend-checkpoint.ts` serializes `WorkflowContext`. Since `dag_execution` is added to `WorkflowContext`, it will be automatically included in suspend checkpoints. No additional code is needed for basic checkpoint/resume.

However, the DAG executor should also serialize its internal execution state (step completion map, retry counts, etc.) separately. This is handled in Phase A's `dag-serializer.ts`, not in the state machine. The state machine tracks high-level progress (`dag_execution`); the DAG serializer tracks detailed execution state.

## Verification

- `bunx --bun tsc --noEmit` passes after all changes
- The `WorkflowEvent` union includes `DAG_STEP_START`, `DAG_STEP_COMPLETE`, `DAG_STEP_FAILED`, `DAG_STEP_RETRY`
- The `WorkflowContext` includes optional `dag_execution` field
- The state machine accepts DAG step events in the `executing` state without transitioning away
- `luca-bridge read-status` output includes `dag_execution` field
- Suspend/resume round-trips preserve `dag_execution` state
- Existing event handling (PHASE_COMPLETE, PHASE_FAILED, etc.) is unchanged — no behavioral regression

## Notes

- The DAG step events are designed as a non-breaking addition. When `workflow.engine` is `"prose"`, these events are never sent and `dag_execution` remains `undefined`. All existing behavior is preserved.
- The state machine does NOT manage DAG step retry logic — that is the DAG executor's responsibility (using `src/iteration/` budget/convergence helpers). The state machine only records step events for observability and persistence.
- This integration follows "Option A" from risk analysis Risk 13: the DAG executor drives XState events, the state machine remains authoritative on valid transitions.
