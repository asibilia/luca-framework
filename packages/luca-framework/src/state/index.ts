/**
 * Public API for the luca-state package.
 *
 * Standalone XState v5 state machine for the Luca agentic workflow.
 * Zero framework dependencies — all utilities are self-contained.
 */

// ─── Machine ─────────────────────────────────────────────────────────────────

export { workflowMachine, getAllowedEvents } from "./machine";
export type { WorkflowMachineInput } from "./machine";

// ─── Child Actors ────────────────────────────────────────────────────────────

export { phaseActorMachine } from "./actors";

// ─── Types ───────────────────────────────────────────────────────────────────

export type {
  Result,
  WorkflowContext,
  WorkflowEvent,
  WorkflowState,
  OversightLevel,
  PhaseResult,
  HarnessResultRef,
  BudgetStateRef,
  PhaseContext,
  PhaseEvent,
  PhaseInput,
  WaveResult,
  TransitionRecord,
  PhaseActorState,
} from "./types";
export {
  workflowContextSchema,
  workflowEventSchema,
  WORKFLOW_STATES,
  OVERSIGHT_LEVELS,
  complexityLevelSchema,
  phaseResultSchema,
  harnessResultRefSchema,
  budgetStateRefSchema,
  initializeContext,
  oversightLevelSchema,
  phaseContextSchema,
  phaseEventSchema,
  phaseInputSchema,
  waveResultSchema,
  transitionRecordSchema,
  PHASE_EVENTS,
  PHASE_ACTOR_STATES,
} from "./types";

// ─── Guards ──────────────────────────────────────────────────────────────────

export { workflowGuards, guardNames } from "./guards";

// ─── Actions ─────────────────────────────────────────────────────────────────

export { actionNames } from "./actions";
export type { ActionName } from "./actions";

// ─── Events ──────────────────────────────────────────────────────────────────

export {
  buildTransitionRecord,
  extractContextSummary,
  isSignificantTransition,
  describeTransition,
} from "./events";

// ─── Defaults ────────────────────────────────────────────────────────────────

export { DEFAULT_COMPLEXITY_MATRIX } from "./defaults";
export type { ComplexityGate, ComplexityMatrix } from "./defaults";

// ─── Utilities ───────────────────────────────────────────────────────────────

export {
  meetsThreshold,
  COMPLEXITY_LEVELS,
  COMPLEXITY_ORDER,
  MODEL_TIER_TO_MODEL,
} from "./utils/complexity-utils";
export type {
  ComplexityLevel,
  StepActivation,
  VerificationMode,
  ModelId,
  ModelTier,
} from "./utils/complexity-utils";

// ─── Pipeline Position ────────────────────────────────────────────────────

export { computePipelinePosition } from "./__helpers/pipeline-position";
export type { PipelinePosition } from "./__helpers/pipeline-position";

// ─── State Value Normalization ───────────────────────────────────────────────

export {
  resolveStateValue,
  resolveStatePath,
} from "./__helpers/resolve-state-value";

// ─── Persistence ────────────────────────────────────────────────────────────

export {
  persistActor,
  loadPersistedActor,
  createFreshActor,
  clearPersistedState,
  stateExists,
  STATE_FILE_PATH,
} from "./persistence";

// ─── Bridge ─────────────────────────────────────────────────────────────────

export {
  handleReadComplexity,
  handleReadPhase,
  handleReadStatus,
  handleReadField,
  handleSetField,
  handleTransition,
  handleEnsureInit,
  handleGateCheck,
  handleSuspend,
  handleInitVault,
  handleLockAcquire,
  handleLockUpdate,
  handleLockRelease,
  handleLockStatus,
  handleRecover,
  handleMilestoneReset,
  SETTABLE_FIELDS,
} from "./bridge";

// ─── Milestone Reset ──────────────────────────────────────────────────────

export {
  validateMilestoneReadiness,
  resetForNextMilestone,
  incrementMilestoneCount,
} from "./__helpers/milestone-reset";

export {
  milestoneResetResultSchema,
  milestoneReadinessSchema,
  MAX_MILESTONES_PER_SESSION,
} from "./__schemas/milestone-reset.schemas";

export type {
  MilestoneResetResult,
  MilestoneReadiness,
} from "./__schemas/milestone-reset.schemas";

// ─── Pipeline Lock ─────────────────────────────────────────────────────────

export {
  acquireLock,
  updateLock,
  releaseLock,
  readLock,
  checkLockStatus,
} from "./__helpers/pipeline-lock";

export {
  pipelineLockSchema,
  PIPELINE_LOCK_PATH,
} from "./__schemas/pipeline-lock.schemas";

export type { PipelineLock } from "./__schemas/pipeline-lock.schemas";

// ─── Suspend Checkpoint ─────────────────────────────────────────────────────

export {
  createSuspendCheckpoint,
  loadSuspendCheckpoint,
  clearSuspendCheckpoint,
  suspendCheckpointSchema,
} from "./suspend-checkpoint";
export type { SuspendCheckpoint } from "./suspend-checkpoint";

// ─── Ledger ─────────────────────────────────────────────────────────────────

export {
  appendLedgerEntry,
  readLedger,
  ledgerEntrySchema,
  LEDGER_PATH,
  _resetSequenceCounter,
} from "./ledger";
export type { LedgerEntry, LedgerFilters } from "./ledger";

// ─── Audit Findings ────────────────────────────────────────────────────────

export {
  persistFinding,
  markFindingResolved,
  markFindingDismissed,
  queryPendingFindings,
  queryFindingsForFile,
  getFindingsSummary,
} from "./__helpers/audit-findings";

export {
  auditFindingSchema,
  persistFindingParamsSchema,
  findingFiltersSchema,
  findingsSummarySchema,
  FINDING_SEVERITIES,
  FINDING_STATUSES,
} from "./__schemas/audit-findings.schemas";

export type {
  AuditFinding,
  PersistFindingParams,
  FindingFilters,
  FindingsSummary,
} from "./__schemas/audit-findings.schemas";

// ─── Oversight Gate Matrix ────────────────────────────────────────────────

export {
  evaluateOversightGate,
  OVERSIGHT_GATE_MATRIX,
} from "./__helpers/oversight-gate";

export {
  OVERSIGHT_MODES,
  oversightModeSchema,
  DECISION_POINTS,
  decisionPointSchema,
  TOKEN_PROFILES,
  tokenProfileSchema,
  GATE_ACTIONS,
  gateActionSchema,
  oversightGateResultSchema,
  oversightGateInputSchema,
} from "./__schemas/oversight-gate.schemas";

export type {
  OversightMode,
  DecisionPoint,
  TokenProfile,
  GateAction,
  OversightGateResult,
  OversightGateInput,
} from "./__schemas/oversight-gate.schemas";

// ─── Budget Matrix ────────────────────────────────────────────────────────

export {
  resolveBudgetMatrix,
  resolveConvergenceOverride,
  BASE_BUDGET_MATRIX,
  PROFILE_MULTIPLIERS,
} from "./__helpers/budget-matrix";

export {
  BUDGET_COMPLEXITY_LEVELS,
  budgetComplexitySchema,
  BUDGET_PROFILES,
  budgetProfileSchema,
  baseBudgetLimitsSchema,
  resolvedBudgetSchema,
  BUDGET_STATUS_VALUES,
  budgetStatusValueSchema,
  CONVERGENCE_SIGNALS,
  convergenceSignalSchema,
  convergenceOverrideResultSchema,
  budgetMatrixInputSchema,
} from "./__schemas/budget-matrix.schemas";

export type {
  BudgetComplexity,
  BudgetProfile,
  BaseBudgetLimits,
  ResolvedBudget,
  ConvergenceOverrideResult,
  BudgetMatrixInput,
} from "./__schemas/budget-matrix.schemas";
