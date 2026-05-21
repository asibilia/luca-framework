# Phase 222 Plan 1 Summary: Per-Skill State Machine Factory + Schema Foundations

## Outcome

**Status:** COMPLETED
**Duration:** ~8 minutes
**Branch:** 113--anti-skip-enforcement-layer

## Tasks Completed

### Task 1: Add SkipReasonSchema, SkippedStepEntrySchema, and optional field to workflow schemas

- **Commit:** `7b57ee5c`
- **File:** `src/workflow/__schemas/workflow.schemas.ts`
- Added `SkipReasonSchema` — Zod enum: `"guard-false"`, `"guard-exception"`, `"flag-skip"`
- Added `SkippedStepEntrySchema` — `{ id, reason, optional }` structured entry
- Added `optional: z.boolean().default(false)` field to `WorkflowStepSchema`
- Widened `DAGCheckpointSchema.skippedSteps` from `z.array(z.string())` to `z.array(SkippedStepEntrySchema)`

### Task 2: Update dag-executor.ts to record structured skip entries

- **Commit:** `ac741dc4`
- **File:** `src/workflow/__helpers/dag-executor.ts`
- Guard returns false now records `{ id, reason: "guard-false", optional: step.optional }`
- Guard throws now records `{ id, reason: "guard-exception", optional: step.optional }`
- Checkpoint persistence uses `skippedEntries` array (structured) instead of deriving bare strings
- Checkpoint restoration handles structured `SkippedStepEntry` objects

### Task 3: Create skill-state-machine.ts factory

- **Commit:** `e0360326`
- **File:** `src/workflow/__helpers/skill-state-machine.ts` (new)
- Functional factory wrapping XState v5 `setup()` API
- Accepts caller-supplied Zod schemas for context validation
- Returns deeply frozen `{ machine, createActor, validateContext }`
- Follows `buildPhaseDAG` factory pattern (functional closure, no classes, deepFreeze)
- Context validated via `safeParse` before actor creation

### Task 4: Update workflow barrel exports

- **Commit:** `0e1c3065`
- **File:** `src/workflow/index.ts`
- Added value exports: `SkipReasonSchema`, `SkippedStepEntrySchema`
- Added type exports: `SkipReason`, `SkippedStepEntry`
- Added function export: `createSkillStateMachine`
- Added type exports: `SkillMachineConfig`, `SkillMachineResult`

## Verification

- `bunx --bun tsc --noEmit` passes cleanly after all tasks (0 errors)

## Deviations

None. All tasks executed as planned.

## Files Modified

| File                                            | Action                                    |
| ----------------------------------------------- | ----------------------------------------- |
| `src/workflow/__schemas/workflow.schemas.ts`    | Modified (added schemas + optional field) |
| `src/workflow/__helpers/dag-executor.ts`        | Modified (structured skip entries)        |
| `src/workflow/__helpers/skill-state-machine.ts` | Created (new factory)                     |
| `src/workflow/index.ts`                         | Modified (barrel exports)                 |

## Notes

- XState v5.28.0 `setup()` API requires `any` casts for actions/guards/states parameters due to its deeply generic type signature. The caller-facing types (`SkillMachineConfig`) are correctly typed -- the casts are internal to the factory.
- Zod v4 `$ZodIssue` uses `PropertyKey[]` for `path` (includes `symbol`), which differs from Zod v3. The error formatting code handles this correctly.
- The `DAGCheckpointSchema.checkpointSchemaVersion` should be bumped to 2 when the `skippedSteps` format change is deployed, since existing checkpoints have `string[]` format. This is a forward-compatibility concern for a future plan.
