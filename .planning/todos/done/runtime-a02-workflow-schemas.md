---
title: "Runtime A02: Define core workflow schemas"
area: workflow
created: 2026-03-24
source: docs/runtime-architecture/dag-workflow-engine.md
depends_on: [A01]
phase: runtime-a
estimated_files: 2
---

## Context

Define the foundational Zod schemas for the DAG engine in `workflow.schemas.ts`. These schemas are the type foundation that every other Phase A component depends on: the builder produces `WorkflowDAG`, the validator returns `ValidationResult`, the executor returns `ExecutionResult`, and the serializer persists `DAGCheckpoint`. All schemas come directly from the design doc with the `checkpointSchemaVersion` addition from the risk analysis.

## Task

### Files to Create

#### `src/workflow/__schemas/workflow.schemas.ts`

Replace the placeholder from A01 with the full schema file. Every field, type, and default is specified below. Implement this exactly.

```typescript
/**
 * Core workflow DAG schemas.
 *
 * Defines the foundational types for the DAG workflow engine:
 * - WorkflowStep: A single step in a workflow DAG
 * - WorkflowDAG: A complete workflow definition
 * - DAGCheckpoint: Serialized execution state for resume
 * - StepResult: Result of a single step execution
 * - ExecutionResult: Result of full DAG execution
 * - ValidationResult: Result of static DAG validation
 * - Adapter: Interface for step execution adapters
 *
 * @see docs/runtime-architecture/dag-workflow-engine.md — Core Schemas section
 */

import { z } from "zod";

// ─── Step Category ───────────────────────────────────────────────────────────

/**
 * Categories for workflow steps, used for visualization and debugging.
 */
export const StepCategorySchema = z.enum([
  "classify",
  "discuss",
  "plan",
  "execute",
  "verify",
  "learn",
  "commit",
  "gate",
]);

export type StepCategory = z.infer<typeof StepCategorySchema>;

// ─── Step Status ─────────────────────────────────────────────────────────────

/**
 * Possible outcomes for a single step execution.
 */
export const StepStatusSchema = z.enum([
  "completed",
  "failed",
  "skipped",
  "timeout",
]);

export type StepStatus = z.infer<typeof StepStatusSchema>;

// ─── Execution Status ────────────────────────────────────────────────────────

/**
 * Possible outcomes for a full DAG execution.
 */
export const ExecutionStatusSchema = z.enum(["completed", "failed", "partial"]);

export type ExecutionStatus = z.infer<typeof ExecutionStatusSchema>;

// ─── Backoff Strategy ────────────────────────────────────────────────────────

/**
 * Retry backoff strategies for step execution.
 */
export const BackoffStrategySchema = z.enum(["none", "linear", "exponential"]);

export type BackoffStrategy = z.infer<typeof BackoffStrategySchema>;

// ─── Retry Config ────────────────────────────────────────────────────────────

/**
 * Retry configuration for a workflow step.
 */
export const RetryConfigSchema = z.object({
  /** Maximum number of retry attempts. */
  max: z.number().int().nonnegative().default(1),

  /** Backoff strategy between retries. */
  backoff: BackoffStrategySchema.default("none"),
});

export type RetryConfig = z.infer<typeof RetryConfigSchema>;

// ─── Step Metadata ───────────────────────────────────────────────────────────

/**
 * Metadata for visualization and debugging.
 */
export const StepMetadataSchema = z.object({
  /** Human-readable description of the step. */
  description: z.string().optional(),

  /** Category for visualization color-coding and node shapes. */
  category: StepCategorySchema.optional(),

  /** Whether this step can run in parallel with sibling steps. */
  parallel: z.boolean().default(false),
});

export type StepMetadata = z.infer<typeof StepMetadataSchema>;

// ─── Workflow Step ───────────────────────────────────────────────────────────

/**
 * A single step in a workflow DAG.
 *
 * Each step declares a handler (maps to a registered step executor),
 * its dependencies, optional input/output Zod schemas for validation,
 * an optional guard condition, retry/timeout config, and metadata.
 *
 * @see docs/runtime-architecture/dag-workflow-engine.md — Core Schemas
 */
export const WorkflowStepSchema = z.object({
  /** Unique step identifier within the DAG. */
  id: z.string().min(1),

  /** Human-readable name for display. */
  name: z.string().min(1),

  /** Handler key — maps to a registered step handler in the adapter. */
  handler: z.string().min(1),

  /** IDs of steps that must complete before this step can start. */
  dependsOn: z.array(z.string()).default([]),

  /**
   * Input Zod schema — validated before step executes.
   * Stored as z.ZodTypeAny at runtime; z.any() in the schema definition
   * because Zod schemas are not themselves Zod-parseable.
   */
  inputSchema: z.any().optional(),

  /**
   * Output Zod schema — validated after step completes.
   * Same storage rationale as inputSchema.
   */
  outputSchema: z.any().optional(),

  /**
   * Guard condition — if it returns false, step is skipped.
   * Receives the accumulated execution context.
   * Exceptions in guards are caught and treated as guard-failed (step skipped).
   */
  guard: z
    .function()
    .args(z.record(z.string(), z.any()))
    .returns(z.boolean())
    .optional(),

  /** Retry configuration. */
  retry: RetryConfigSchema.optional(),

  /** Timeout in milliseconds for step execution. */
  timeout: z.number().int().positive().optional(),

  /** Metadata for visualization and debugging. */
  metadata: StepMetadataSchema.optional(),
});

export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;

// ─── Workflow DAG ────────────────────────────────────────────────────────────

/**
 * A complete workflow DAG definition.
 *
 * Contains all steps, their dependency relationships, optional parallel
 * groups for fan-out/fan-in, and a global timeout.
 *
 * @see docs/runtime-architecture/dag-workflow-engine.md — Core Schemas
 */
export const WorkflowDAGSchema = z.object({
  /** Workflow name. */
  name: z.string().min(1),

  /** Workflow version (semver). */
  version: z.string().default("1.0.0"),

  /** All steps in the workflow. */
  steps: z.array(WorkflowStepSchema),

  /** Named parallel groups (fan-out/fan-in). Maps group name to step IDs. */
  parallelGroups: z.record(z.string(), z.array(z.string())).optional(),

  /** Global timeout for the entire workflow in milliseconds. */
  timeout: z.number().int().positive().optional(),
});

export type WorkflowDAG = z.infer<typeof WorkflowDAGSchema>;

// ─── Execution Trace Entry ───────────────────────────────────────────────────

/**
 * A single wave entry in the execution trace.
 */
export const TraceEntrySchema = z.object({
  /** Wave index (0-based). */
  wave: z.number().int().nonnegative(),

  /** Step IDs executed in this wave. */
  stepIds: z.array(z.string()),

  /** ISO datetime when this wave started. */
  startedAt: z.string(),

  /** ISO datetime when this wave completed. */
  completedAt: z.string(),
});

export type TraceEntry = z.infer<typeof TraceEntrySchema>;

// ─── Step Result ─────────────────────────────────────────────────────────────

/**
 * Result of a single step execution.
 *
 * @see docs/runtime-architecture/dag-workflow-engine.md — Core Schemas
 */
export const StepResultSchema = z.object({
  /** ID of the step that was executed. */
  stepId: z.string(),

  /** Outcome of the step execution. */
  status: StepStatusSchema,

  /** Step output data (present when status is "completed"). */
  output: z.any().optional(),

  /** Error message (present when status is "failed" or "timeout"). */
  error: z.string().optional(),

  /** Execution duration in milliseconds. */
  durationMs: z.number().nonnegative(),

  /** Number of retry attempts that were made. */
  retryCount: z.number().int().nonnegative().default(0),
});

export type StepResult = z.infer<typeof StepResultSchema>;

// ─── Execution Result ────────────────────────────────────────────────────────

/**
 * Result of a full DAG execution.
 *
 * @see docs/runtime-architecture/dag-workflow-engine.md — Core Schemas
 */
export const ExecutionResultSchema = z.object({
  /** Name of the DAG that was executed. */
  dagName: z.string(),

  /** Overall execution outcome. */
  status: ExecutionStatusSchema,

  /** Per-step results keyed by step ID. */
  stepResults: z.record(z.string(), StepResultSchema),

  /** Total execution duration in milliseconds. */
  totalDurationMs: z.number().nonnegative(),

  /** Wave-by-wave execution trace for debugging/replay. */
  trace: z.array(TraceEntrySchema),
});

export type ExecutionResult = z.infer<typeof ExecutionResultSchema>;

// ─── Validation Issue ────────────────────────────────────────────────────────

/**
 * A single validation issue (error or warning).
 */
export const ValidationIssueSchema = z.object({
  /** Category of the issue (e.g., "cycle", "missing-dependency", "schema-mismatch"). */
  type: z.string(),

  /** Human-readable description of the issue. */
  message: z.string(),

  /** Step ID associated with the issue, if applicable. */
  stepId: z.string().optional(),
});

export type ValidationIssue = z.infer<typeof ValidationIssueSchema>;

// ─── Validation Result ───────────────────────────────────────────────────────

/**
 * Result of static DAG validation.
 *
 * @see docs/runtime-architecture/dag-workflow-engine.md — DAG Validator
 */
export const ValidationResultSchema = z.object({
  /** Whether the DAG passed all validation checks. */
  valid: z.boolean(),

  /** Errors that prevent the DAG from executing. */
  errors: z.array(ValidationIssueSchema),

  /** Warnings that do not prevent execution but indicate potential issues. */
  warnings: z.array(ValidationIssueSchema),
});

export type ValidationResult = z.infer<typeof ValidationResultSchema>;

// ─── Failed Step Info ────────────────────────────────────────────────────────

/**
 * Information about a failed step in a checkpoint.
 */
export const FailedStepInfoSchema = z.object({
  /** Error message from the failed execution. */
  error: z.string(),

  /** Number of retry attempts that were made. */
  retryCount: z.number().int().nonnegative(),
});

export type FailedStepInfo = z.infer<typeof FailedStepInfoSchema>;

// ─── DAG Checkpoint ──────────────────────────────────────────────────────────

/**
 * Serialized execution state for checkpoint/resume.
 *
 * Persisted as JSON to `.planning/checkpoints/{dagName}.json`.
 * Includes a schema version for forward compatibility (risk-analysis.md pitfall).
 *
 * @see docs/runtime-architecture/dag-workflow-engine.md — Checkpoint/Resume
 * @see docs/runtime-architecture/research/risk-analysis.md — Risk 11
 */
export const DAGCheckpointSchema = z.object({
  /** Name of the DAG this checkpoint belongs to. */
  dagName: z.string(),

  /** Version of the DAG definition at checkpoint time. */
  dagVersion: z.string(),

  /**
   * Schema version of the checkpoint format itself.
   * Increment when the checkpoint shape changes for forward compatibility.
   * Added per risk-analysis.md recommendation.
   */
  checkpointSchemaVersion: z.number().int().positive().default(1),

  /** ISO datetime when the DAG execution started. */
  startedAt: z.string(),

  /** Index of the current wave being executed (0-based). */
  currentWave: z.number().int().nonnegative(),

  /** Map of completed step IDs to their output data. */
  completedSteps: z.record(z.string(), z.any()),

  /** List of step IDs that were skipped (guard returned false). */
  skippedSteps: z.array(z.string()),

  /** Map of failed step IDs to their error info. */
  failedSteps: z.record(z.string(), FailedStepInfoSchema),

  /** Accumulated execution context passed to downstream steps. */
  context: z.record(z.string(), z.any()),
});

export type DAGCheckpoint = z.infer<typeof DAGCheckpointSchema>;

// ─── Adapter ─────────────────────────────────────────────────────────────────

/**
 * Interface for step execution adapters.
 *
 * Defined at T1 so that adapters at T3 (compilers tier or future adapters
 * domain) can implement it without creating tier violations.
 *
 * The adapter pattern separates DAG orchestration (this domain) from step
 * execution (adapter implementations). The DAG executor orchestrates;
 * adapters execute.
 *
 * @see docs/runtime-architecture/dag-workflow-engine.md — DAG Executor
 */
export const AdapterSchema = z.object({
  /** Unique adapter name (e.g., "claude", "api", "mock"). */
  name: z.string().min(1),

  /**
   * Execute a single workflow step.
   *
   * @param step - The step definition from the DAG
   * @param input - Validated input data from upstream steps
   * @param context - Accumulated execution context
   * @returns StepResult with output or error
   */
  executeStep: z
    .function()
    .args(
      WorkflowStepSchema,
      z.record(z.string(), z.any()),
      z.record(z.string(), z.any()),
    )
    .returns(z.promise(StepResultSchema)),
});

export type Adapter = z.infer<typeof AdapterSchema>;
```

### Files to Modify

#### `src/workflow/index.ts`

Replace the `// Added by A02` placeholder comment under `Core Schemas` with actual exports:

```typescript
// ─── Core Schemas ────────────────────────────────────────────────────────────

export {
  StepCategorySchema,
  StepStatusSchema,
  ExecutionStatusSchema,
  BackoffStrategySchema,
  RetryConfigSchema,
  StepMetadataSchema,
  WorkflowStepSchema,
  WorkflowDAGSchema,
  TraceEntrySchema,
  StepResultSchema,
  ExecutionResultSchema,
  ValidationIssueSchema,
  ValidationResultSchema,
  FailedStepInfoSchema,
  DAGCheckpointSchema,
  AdapterSchema,
} from "./__schemas/workflow.schemas.ts";

export type {
  StepCategory,
  StepStatus,
  ExecutionStatus,
  BackoffStrategy,
  RetryConfig,
  StepMetadata,
  WorkflowStep,
  WorkflowDAG,
  TraceEntry,
  StepResult,
  ExecutionResult,
  ValidationIssue,
  ValidationResult,
  FailedStepInfo,
  DAGCheckpoint,
  Adapter,
} from "./__schemas/workflow.schemas.ts";
```

## Verification

- [ ] `bunx --bun tsc --noEmit` passes
- [ ] All 7 schema constants are exported: `WorkflowStepSchema`, `WorkflowDAGSchema`, `DAGCheckpointSchema`, `StepResultSchema`, `ExecutionResultSchema`, `ValidationResultSchema`, `AdapterSchema`
- [ ] All 7 inferred types are exported: `WorkflowStep`, `WorkflowDAG`, `DAGCheckpoint`, `StepResult`, `ExecutionResult`, `ValidationResult`, `Adapter`
- [ ] Supporting schemas are exported: `StepCategorySchema`, `StepStatusSchema`, `ExecutionStatusSchema`, `BackoffStrategySchema`, `RetryConfigSchema`, `StepMetadataSchema`, `TraceEntrySchema`, `ValidationIssueSchema`, `FailedStepInfoSchema`
- [ ] `DAGCheckpointSchema` includes `checkpointSchemaVersion` field (risk-analysis.md recommendation)
- [ ] Barrel index only contains re-export statements

## Notes

- Depends on: A01
- The `guard` field uses `z.function()` — Zod supports function schemas but they are only type-checked, not runtime-validated. This is intentional: guards are runtime closures that cannot be serialized.
- The `inputSchema` and `outputSchema` fields use `z.any().optional()` because Zod schemas themselves are not Zod-parseable. At runtime, these hold `z.ZodTypeAny` instances that the validator and executor use for `safeParse()` calls.
- The `AdapterSchema` uses `z.function()` for `executeStep` — same rationale as `guard`. The adapter is a runtime object, not a serialized config.
