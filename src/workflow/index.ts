/**
 * Public API for the workflow DAG engine domain.
 *
 * Archetype B (Core Domain), Tier T1.
 * Provides typed DAG workflow definition, validation, execution,
 * checkpoint/resume, and Mermaid visualization.
 *
 * @see docs/runtime-architecture/dag-workflow-engine.md
 */

// --- Core Schemas ------------------------------------------------------------

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

// --- Step Contracts ----------------------------------------------------------

// ─── Step Contracts ──────────────────────────────────────────────────────────

export {
  ClassifyOutputSchema,
  AppetiteSchema,
  DiscussOutputSchema,
  PlanOutputSchema,
  ExecuteOutputSchema,
  VerificationGapSchema,
  VerifyOutputSchema,
  LearnOutputSchema,
  CommitOutputSchema,
} from "./__schemas/contracts.schemas.ts";

export type {
  ClassifyOutput,
  Appetite,
  DiscussOutput,
  PlanOutput,
  ExecuteOutput,
  VerificationGap,
  VerifyOutput,
  LearnOutput,
  CommitOutput,
} from "./__schemas/contracts.schemas.ts";

// --- DAG Builder -------------------------------------------------------------
// Added by A04

// ─── DAG Sorter ──────────────────────────────────────────────────────────────

export { topologicalSort, getExecutionOrder } from "./__helpers/dag-sorter.ts";

// --- DAG Validator -----------------------------------------------------------
// Added by A06

// --- DAG Executor ------------------------------------------------------------
// Added by A07

// --- DAG Serializer ----------------------------------------------------------
// Added by A08

// --- DAG Visualizer ----------------------------------------------------------
// Added by A09

// --- Phase Pipeline ----------------------------------------------------------
// Added by A10
