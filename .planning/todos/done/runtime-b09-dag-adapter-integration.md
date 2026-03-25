---
title: "Runtime B09: DAG-adapter integration — wire dag-executor.ts to call adapter.executeStep()"
area: adapters
created: 2026-03-24
source: docs/runtime-architecture/adapter-architecture.md
depends_on: [B01, B05, B07, A01]
phase: runtime-b
estimated_files: 2
---

## Context

Phase A creates `src/workflow/__helpers/dag-executor.ts` which executes a `WorkflowDAG` wave-by-wave. The executor receives an `Adapter` instance via dependency injection and calls `adapter.executeStep(step, context)` for each step in the workflow.

Phase A defines a minimal `Adapter` interface stub in `src/workflow/__schemas/workflow.schemas.ts` with just `{ name: string; executeStep: (step, input, context) => Promise<StepResult> }`. This task replaces that stub with the full `Adapter` type from `src/adapters/__schemas/adapter.schemas.ts` (B01).

This task also narrows the `executeStep` parameter in `src/adapters/__schemas/adapter.schemas.ts` from `unknown` to the concrete `WorkflowStep` type from Phase A.

**This task has a hard dependency on Phase A completion** — `WorkflowStep`, `StepResult`, `ExecutionContext`, and `dag-executor.ts` must all exist.

## Task

### Step 1: Narrow the `executeStep` type in adapter schemas

Modify `src/adapters/__schemas/adapter.schemas.ts` to import and use the concrete `WorkflowStep` type:

**Change the `Adapter` type's `executeStep` method:**

From (current, set in B01):
```typescript
executeStep?: (
  step: unknown,
  context: Record<string, unknown>,
) => Promise<AdapterStepResult>;
```

To:
```typescript
import type { WorkflowStep } from "~/workflow/__schemas/workflow.schemas";

executeStep?: (
  step: WorkflowStep,
  context: Record<string, unknown>,
) => Promise<AdapterStepResult>;
```

This import is valid: T3 (adapters) importing T1 (workflow).

### Step 2: Update Claude adapter `executeStep` type

Modify `src/adapters/claude/claude-adapter.ts`:

Change the `executeStep` parameter type from `_step: unknown` to `_step: WorkflowStep`:

```typescript
import type { WorkflowStep } from "~/workflow/__schemas/workflow.schemas";

executeStep: async (
  _step: WorkflowStep,
  _context: Record<string, unknown>,
): Promise<AdapterStepResult> => {
  // Stub remains — DAG-to-prose compilation is future work
  return {
    success: false,
    error:
      "Claude adapter executeStep is not yet implemented. " +
      "DAG-to-prose compilation is a future task.",
  };
},
```

### Step 3: Update API adapter `executeStep` type

Modify `src/adapters/api/api-adapter.ts`:

Replace the `step as Record<string, unknown>` cast with typed access:

```typescript
import type { WorkflowStep } from "~/workflow/__schemas/workflow.schemas";

executeStep: async (
  step: WorkflowStep,
  context: Record<string, unknown>,
): Promise<AdapterStepResult> => {
  const stepName = step.name;
  const prompt =
    typeof (step as Record<string, unknown>).prompt === "string"
      ? String((step as Record<string, unknown>).prompt)
      : `Execute workflow step: ${stepName}. Handler: ${step.handler}`;

  const systemPrompt =
    typeof context.systemPrompt === "string"
      ? context.systemPrompt
      : `You are executing workflow step "${stepName}". Complete the task thoroughly.`;

  const sessionId =
    typeof context.sessionId === "string" ? context.sessionId : undefined;

  return executeViaSDK(prompt, systemPrompt, executorConfig, sessionId);
},
```

### Step 4: Verify DAG executor uses the Adapter type

Phase A's `dag-executor.ts` should already accept an `Adapter` parameter. Verify that it imports `Adapter` from `~/workflow/__schemas/workflow.schemas` (Phase A's stub) or from `~/adapters/__schemas/adapter.schemas` (B01's full type).

If Phase A used its own minimal stub, update the import in `dag-executor.ts`:

From:
```typescript
import type { Adapter } from "../__schemas/workflow.schemas";
```

To:
```typescript
import type { Adapter } from "~/adapters/__schemas/adapter.schemas";
```

**Important tier note:** `src/workflow/` is T1 and `src/adapters/` is T3. T1 cannot import T3 — this would be an upward dependency violation.

**Resolution:** The `Adapter` type that `dag-executor.ts` uses must remain in T1 (workflow domain). There are two options:

**Option A (recommended):** Keep Phase A's minimal `Adapter` type in `src/workflow/__schemas/workflow.schemas.ts`. The full `Adapter` type in `src/adapters/` extends it (structurally compatible). The DAG executor accepts the minimal type; concrete adapters satisfy it because they are structurally wider.

**Option B:** Define a `StepExecutor` function type in workflow schemas:
```typescript
// In src/workflow/__schemas/workflow.schemas.ts
export type StepExecutor = (
  step: WorkflowStep,
  context: Record<string, unknown>,
) => Promise<StepResult>;
```

And `dag-executor.ts` accepts `StepExecutor` instead of `Adapter`. The caller wraps `adapter.executeStep` to match.

**Use Option A.** The minimal adapter interface in workflow is:
```typescript
// Already in src/workflow/__schemas/workflow.schemas.ts (from Phase A)
export type WorkflowAdapter = {
  name: string;
  executeStep: (
    step: WorkflowStep,
    input: unknown,
    context: Record<string, unknown>,
  ) => Promise<StepResult>;
};
```

The full `Adapter` from `src/adapters/` is structurally compatible (it has `config.name` and `executeStep`). No import from T3 to T1 is needed. When calling `dag-executor.ts`, the caller wraps the full adapter:

```typescript
// In the orchestrator (outside src/)
import type { Adapter } from "~/adapters/__schemas/adapter.schemas";
import { executeDAG } from "~/workflow";

const adapter: Adapter = createClaudeAdapter();
await executeDAG(dag, {
  name: adapter.config.name,
  executeStep: async (step, input, context) => {
    const result = await adapter.executeStep!(step, context);
    return {
      stepId: step.id,
      status: result.success ? "completed" : "failed",
      output: result.output,
      error: result.error,
      durationMs: 0, // Timing handled by DAG executor
      retryCount: 0,
    };
  },
}, initialContext);
```

### Step 5: Create adapter-executor bridge helper

Create `src/adapters/__helpers/adapter-executor-bridge.ts` to encapsulate the type mapping:

```typescript
import type { Adapter } from "../__schemas/adapter.schemas";

/**
 * Bridge between the full Adapter interface (T3) and the minimal
 * WorkflowAdapter interface expected by the DAG executor (T1).
 *
 * This function wraps a full Adapter into the shape that dag-executor.ts
 * accepts, handling the type mapping between AdapterStepResult and StepResult.
 *
 * @param adapter - The full adapter instance
 * @returns An object compatible with the DAG executor's WorkflowAdapter type
 */
export function bridgeAdapterForExecutor(adapter: Adapter): {
  name: string;
  executeStep: (
    step: unknown,
    input: unknown,
    context: Record<string, unknown>,
  ) => Promise<{
    stepId: string;
    status: "completed" | "failed" | "skipped" | "timeout";
    output?: unknown;
    error?: string;
    durationMs: number;
    retryCount: number;
  }>;
} {
  if (!adapter.executeStep) {
    throw new Error(
      `Adapter "${adapter.config.name}" does not support step execution. ` +
        "Only adapters with executeStep can be used with the DAG executor.",
    );
  }

  const adapterExecuteStep = adapter.executeStep;

  return {
    name: adapter.config.name,
    executeStep: async (step, _input, context) => {
      const stepObj = step as Record<string, unknown>;
      const stepId = String(stepObj.id ?? "unknown");
      const result = await adapterExecuteStep(step, context);
      return {
        stepId,
        status: result.success ? ("completed" as const) : ("failed" as const),
        output: result.output,
        error: result.error,
        durationMs: 0, // Timing is measured by the DAG executor, not the adapter
        retryCount: 0,
      };
    },
  };
}
```

### Exports

`src/adapters/__helpers/adapter-executor-bridge.ts` exports:

```typescript
export { bridgeAdapterForExecutor };
```

Update `src/adapters/index.ts` (in B10) to re-export this function.

## Verification

```bash
bunx --bun tsc --noEmit
```

- `src/adapters/__schemas/adapter.schemas.ts` imports `WorkflowStep` from `~/workflow/__schemas/workflow.schemas`
- `Adapter.executeStep` parameter is typed as `WorkflowStep` (not `unknown`)
- `src/adapters/claude/claude-adapter.ts` uses `WorkflowStep` for `executeStep` parameter
- `src/adapters/api/api-adapter.ts` uses `WorkflowStep` for `executeStep` parameter
- `src/adapters/__helpers/adapter-executor-bridge.ts` exists and exports `bridgeAdapterForExecutor`
- No T1-imports-T3 violations (workflow does not import adapters)
- `bun run scripts/check-domain-boundaries.ts` passes
- No TypeScript errors
- No classes used

## Notes

- This task has a hard dependency on Phase A. It cannot be started until `src/workflow/__schemas/workflow.schemas.ts` defines `WorkflowStep` and `dag-executor.ts` exists.
- The bridge pattern (`bridgeAdapterForExecutor`) is necessary because the DAG executor lives in T1 and cannot import the full T3 Adapter type. The bridge lives in T3 and does the mapping.
- The `durationMs: 0` in the bridge is intentional — the DAG executor wraps each step call with its own timer and sets the real duration. The adapter does not need to track timing.
- If Phase A's `WorkflowAdapter` type in `workflow.schemas.ts` has a different shape than expected, the bridge function must be adjusted to match. The implementing agent should read Phase A's actual types before implementing.
