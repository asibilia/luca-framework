---
phase: 222
plan: 1
type: feature
autonomous: true
wave: 1
depends_on: []
---

# Phase 222 Plan 1: Per-Skill State Machine Factory + Schema Foundations

## Objective

Create the `createSkillStateMachine` factory in `src/workflow/__helpers/skill-state-machine.ts` and lay the schema foundations (SkipReasonSchema, SkippedStepEntrySchema, optional field on WorkflowStepSchema) that all subsequent layers depend on. This is the dependency root -- Layers 1, 3, and 4 all build on the schemas and factory established here.

> Appetite: Large (200,000 tokens remaining of 200,000 ceiling)

## Context

@src/workflow/**schemas/workflow.schemas.ts
@src/workflow/**helpers/dag-builder.ts
@src/workflow/\_\_helpers/dag-executor.ts
@src/workflow/index.ts
@packages/luca-framework/src/state/machine.ts
@.planning/phases/222-anti-skip-infrastructure/01-CONTEXT.md
@.planning/phases/222-anti-skip-infrastructure/01-PREMORTEM.md

## Tasks

### 1. Add SkipReasonSchema, SkippedStepEntrySchema, and optional field to workflow schemas

**Type:** auto
**TDD:** false
**Depends on:** none

Modify `src/workflow/__schemas/workflow.schemas.ts` to add three things:

1. **SkipReasonSchema** -- a Zod enum with values `"guard-false"`, `"guard-exception"`, `"flag-skip"`. Place it between the FailedStepInfoSchema and DAGCheckpointSchema sections (after line 318).

2. **SkippedStepEntrySchema** -- a Zod object with fields `{ id: z.string(), reason: SkipReasonSchema, optional: z.boolean().default(false) }`. Place immediately after SkipReasonSchema.

3. **`optional` field on WorkflowStepSchema** -- add `optional: z.boolean().default(false)` after the `metadata` field (line 157). This is backward-compatible since it defaults to false.

4. **Widen DAGCheckpointSchema.skippedSteps** -- change from `z.array(z.string())` (line 355) to `z.array(SkippedStepEntrySchema)`. Increment `checkpointSchemaVersion` default to `2`.

**PREMORTEM Constraint #1:** This widening MUST happen before gap-detector.ts is authored (Layer 4). It is satisfied by placing this task in Wave 1.

Export all new schemas and types from the file.

**Files to create/edit:**

- `src/workflow/__schemas/workflow.schemas.ts` (edit)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `SkipReasonSchema`, `SkippedStepEntrySchema`, `SkippedStepEntry`, `SkipReason` types exist
- `WorkflowStepSchema` has `optional` field
- `DAGCheckpointSchema.skippedSteps` accepts structured objects, not bare strings

### 2. Update dag-executor.ts to record structured skip entries

**Type:** auto
**TDD:** false
**Depends on:** 1

Modify `src/workflow/__helpers/dag-executor.ts` to produce structured skip entries instead of bare string IDs.

**Changes in the guard evaluation block (lines 184-205):**

- When guard returns false (line 187-195): record a structured skip entry with reason `"guard-false"` and pull the step's `optional` field.
- When guard throws exception (line 196-204): record with reason `"guard-exception"`.
- Store these in a local `skippedEntries` array of `SkippedStepEntry` objects.

**Changes in checkpoint persistence (lines 275-278):**

- Replace the current `skippedSteps` assembly:
  ```
  skippedSteps: Object.entries(stepResults)
    .filter(([, r]) => r.status === "skipped")
    .map(([id]) => id),
  ```
  with structured entries that include reason and optional:
  ```
  skippedSteps: skippedEntries,
  ```

**Changes in checkpoint restoration (lines 155-163):**

- Update the loop `for (const stepId of checkpoint.skippedSteps)` to handle structured entries:
  ```
  for (const entry of checkpoint.skippedSteps) {
    stepResults[entry.id] = {
      stepId: entry.id,
      status: "skipped",
      durationMs: 0,
      retryCount: 0,
    };
  }
  ```

**Files to create/edit:**

- `src/workflow/__helpers/dag-executor.ts` (edit)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Skipped steps in checkpoint now include `{ id, reason, optional }` structure
- Checkpoint restoration handles the new structure

### 3. Create skill-state-machine.ts factory

**Type:** auto
**TDD:** false
**Depends on:** 1

Create `src/workflow/__helpers/skill-state-machine.ts` with the `createSkillStateMachine` factory function.

**Design decisions (from CONTEXT.md Decision #1):**

- Place in `src/workflow/__helpers/` (T1 Core) -- allows T2 entities to import
- Functional factory pattern (no classes), following `buildPhaseDAG` precedent
- Accept caller-supplied Zod schemas for context validation
- Wrap XState v5 `setup()` API

**Factory signature:**

```typescript
export function createSkillStateMachine<
  TContext extends Record<string, unknown>,
  TEvent extends { type: string },
>(
  config: SkillStateMachineConfig<TContext, TEvent>,
): SkillStateMachineResult<TContext, TEvent>;
```

**Config schema (define with Zod):**

```typescript
interface SkillStateMachineConfig<TContext, TEvent> {
  id: string; // Machine identifier
  contextSchema: z.ZodType<TContext>; // Zod schema for context validation
  initialState: string; // Initial state name
  states: Record<string, StateConfig<TEvent>>; // State definitions
  initialContext: TContext; // Initial context values
  guards?: Record<string, (ctx: TContext, event: TEvent) => boolean>;
  actions?: Record<string, (ctx: TContext, event: TEvent) => Partial<TContext>>;
}
```

**Return shape:**

```typescript
interface SkillStateMachineResult<TContext, TEvent> {
  machine: StateMachine; // The XState machine definition
  createActor: (override?: Partial<TContext>) => Actor; // Convenience actor creator
  validateContext: (ctx: unknown) => SafeParseReturnType; // Zod safeParse on context
}
```

**Key behaviors:**

- Validate initial context against `contextSchema` via `safeParse` at construction time
- Use `assign()` for all context mutations (immutable updates)
- Return a frozen machine definition (via `deepFreeze` from shared)
- Provide `validateContext` for runtime context validation by callers

**Files to create/edit:**

- `src/workflow/__helpers/skill-state-machine.ts` (create)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- File exports `createSkillStateMachine` function
- Factory accepts Zod schemas and returns XState machine + actor creator

### 4. Update workflow barrel exports

**Type:** auto
**TDD:** false
**Depends on:** 1, 3

Add new exports to `src/workflow/index.ts`:

1. From `workflow.schemas.ts`: `SkipReasonSchema`, `SkippedStepEntrySchema` (values) and `SkipReason`, `SkippedStepEntry` (types)
2. From `skill-state-machine.ts`: `createSkillStateMachine` function and its config/result types

**Files to create/edit:**

- `src/workflow/index.ts` (edit)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `import { createSkillStateMachine, SkipReasonSchema, SkippedStepEntrySchema } from "~/workflow"` resolves

## Verification

1. Run `bunx --bun tsc --noEmit` -- must pass with zero errors
2. Confirm `src/workflow/__helpers/skill-state-machine.ts` exists and exports `createSkillStateMachine`
3. Confirm `src/workflow/__schemas/workflow.schemas.ts` has `SkipReasonSchema`, `SkippedStepEntrySchema`, and `optional` on `WorkflowStepSchema`
4. Confirm `src/workflow/__helpers/dag-executor.ts` writes structured skip entries (not bare strings)
5. Confirm `src/workflow/index.ts` exports all new symbols

## Success Criteria

- The `createSkillStateMachine` factory compiles and accepts Zod schemas + XState state definitions
- DAGCheckpointSchema.skippedSteps is widened to structured entries (PREMORTEM Constraint #1 satisfied)
- dag-executor.ts distinguishes guard-false from guard-exception in skip entries
- WorkflowStepSchema has the `optional` field for gap detector use
- All new symbols are exported from the workflow barrel

## Output Specification

- Modified: `src/workflow/__schemas/workflow.schemas.ts`
- Modified: `src/workflow/__helpers/dag-executor.ts`
- Modified: `src/workflow/index.ts`
- Created: `src/workflow/__helpers/skill-state-machine.ts`
