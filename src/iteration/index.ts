/**
 * Iteration module for the Luca verification loop system.
 *
 * Provides decision-support utilities for externally-controlled iteration
 * loops (Ralph Wiggum pattern). The lu-execute-phase skill IS the loop
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
} from "./types";

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
} from "./types";

// Convergence detection
export {
  createFingerprint,
  computeFingerprintOverlap,
  computeConvergenceSignals,
  assessConvergence,
} from "./convergence";

// Error classification
export {
  classifySingleError,
  classifyErrors,
  partitionByClass,
} from "./classifier";

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
} from "./checkpoint";

// Budget tracking
export {
  createBudgetState,
  assessBudget,
  advanceBudget,
  shouldStartIteration,
} from "./budget";
