/**
 * Iteration module for the Luca verification loop system.
 *
 * Provides decision-support utilities for externally-controlled iteration
 * loops (Ralph Wiggum pattern). The phase-execute skill IS the loop
 * controller; this module provides the intelligence for decisions.
 *
 * Sub-modules:
 * - types: Zod schemas and TypeScript types
 * - convergence: Multi-signal convergence detection (added in Plan 17-02)
 * - classifier: Rule-based error classification (added in Plan 17-02)
 * - checkpoint: Git tag + JSON checkpoint management (added in Plan 17-03)
 * - budget: Iteration cost tracking (added in Plan 17-03)
 */

// Types and schemas
export {
  // Error classification
  ERROR_CLASSES,
  errorClassSchema,
  errorFingerprintSchema,
  classifiedErrorSchema,
  // Convergence
  convergenceSignalsSchema,
  CONVERGENCE_STATUSES,
  convergenceStatusSchema,
  convergenceResultSchema,
  // Loop types
  LOOP_TYPES,
  loopTypeSchema,
  // Iteration records
  iterationRecordSchema,
  iterationHistorySchema,
  // Budget
  BUDGET_STATUSES,
  budgetStatusSchema,
  budgetStateSchema,
  // HITL
  HITL_DECISIONS,
  hitlDecisionSchema,
  ITERATION_MODES,
  iterationModeSchema,
  // Configuration
  loopConfigSchema,
  iterationConfigSchema,
  // Results
  LOOP_OUTCOMES,
  loopOutcomeSchema,
  loopResultSchema,
} from "./__schemas/iteration.schemas";

export type {
  ErrorFingerprint,
  ErrorClass,
  ClassifiedError,
  ConvergenceSignals,
  ConvergenceStatus,
  ConvergenceResult,
  LoopType,
  IterationRecord,
  IterationHistory,
  BudgetStatus,
  BudgetState,
  HITLDecision,
  IterationMode,
  LoopConfig,
  IterationConfig,
  LoopOutcome,
  LoopResult,
} from "./__schemas/iteration.schemas";

// Convergence detection
export {
  createFingerprint,
  computeFingerprintOverlap,
  computeSemanticOverlap,
  computeConvergenceSignals,
  assessConvergence,
} from "./__helpers/convergence";

export type { ConvergenceDebateOptions } from "./__helpers/convergence";

// Stall debate schemas
export {
  STALL_DEBATE_STRATEGIES,
  stallDebateStrategySchema,
  stallDebateInputSchema,
  stallDebateOutputSchema,
} from "./__schemas/stall-debate.schemas";

export type {
  StallDebateStrategy,
  StallDebateInput,
  StallDebateOutput,
} from "./__schemas/stall-debate.schemas";

// Stall debate evaluator
export {
  shouldAttemptDebate,
  evaluateStallDebate,
} from "./__helpers/stall-debate";

// Error classification
export {
  classifySingleError,
  classifyErrors,
  partitionByClass,
} from "./__helpers/classifier";

// Checkpoint management
export {
  sanitizeTagName,
  buildTagName,
  metadataPath,
  createCheckpoint,
  readCheckpointMetadata,
  rollbackToCheckpoint,
  getCurrentCommitHash,
  getArtifactDelta,
  prunePhaseCheckpoints,
} from "./__helpers/checkpoint";

// Budget tracking
export {
  createBudgetState,
  assessBudget,
  advanceBudget,
  shouldStartIteration,
  assessBudgetWithTokens,
} from "./__helpers/budget";

export type { TokenBudgetAssessment } from "./__helpers/budget";

// Metrics schemas
export {
  iterationMetricsSchema,
  planQualityMetricsSchema,
  reviewMetricsSchema,
  convergenceMetricsSchema,
  metricsFileSchema,
} from "./__schemas/metrics.schemas";

export type {
  IterationMetrics,
  PlanQualityMetrics,
  ReviewMetrics,
  ConvergenceMetrics,
  MetricsFile,
} from "./__schemas/metrics.schemas";

// Metrics collection
export {
  buildIterationMetrics,
  buildPlanQualityMetrics,
  buildReviewMetrics,
  buildConvergenceMetrics,
  appendMetrics,
} from "./__helpers/metrics-collector";
