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
  WorkflowAdapterSchema,
} from "./__schemas/workflow.schemas";

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
  WorkflowAdapter,
} from "./__schemas/workflow.schemas";

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
} from "./__schemas/contracts.schemas";

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
} from "./__schemas/contracts.schemas";

// ─── DAG Builder ─────────────────────────────────────────────────────────────

export { buildPhaseDAG } from "./__helpers/dag-builder";
export type { StepConfig, DAGBuilder } from "./__helpers/dag-builder";

// ─── DAG Adjacency ───────────────────────────────────────────────────────────

export { buildSuccessorsMap } from "./__helpers/dag-adjacency";

// ─── DAG Sorter ──────────────────────────────────────────────────────────────

export { topologicalSort, getExecutionOrder } from "./__helpers/dag-sorter";

// ─── DAG Validator ───────────────────────────────────────────────────────────

export { validateDAG } from "./__helpers/dag-validator";

// ─── DAG Executor ────────────────────────────────────────────────────────────

export { executeDAG } from "./__helpers/dag-executor";
export type { ExecuteDAGOptions } from "./__helpers/dag-executor";

// ─── DAG Serializer ──────────────────────────────────────────────────────────

export {
  saveCheckpoint,
  loadCheckpoint,
  clearCheckpoint,
} from "./__helpers/dag-serializer";

// ─── DAG Visualizer ──────────────────────────────────────────────────────────

export { dagToTopology } from "./__helpers/dag-visualizer";

// ─── Phase Pipeline ──────────────────────────────────────────────────────────

export { PHASE_PIPELINE } from "./__helpers/phase-pipeline";
