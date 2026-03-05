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

// ─── Persistence ────────────────────────────────────────────────────────────

export {
  persistActor,
  loadPersistedActor,
  createFreshActor,
  clearPersistedState,
  stateExists,
  STATE_FILE_PATH,
} from "./persistence";

// ─── Snapshot ───────────────────────────────────────────────────────────────

export {
  extractSection,
  extractPreservableSections,
  generateSnapshot,
} from "./snapshot";
export type { SnapshotInput } from "./snapshot";

// ─── Bridge ─────────────────────────────────────────────────────────────────

export {
  handleReadComplexity,
  handleReadOversight,
  handleReadPhase,
  handleReadStatus,
  handleReadField,
  handleSetField,
  handleTransition,
  handleSnapshot,
  handleEnsureInit,
  handleGateCheck,
  handleSuspend,
  handleResumePhase,
  SETTABLE_FIELDS,
} from "./bridge";

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

// ─── Observer Emitter (SpacetimeDB) ────────────────────────────────────────

export {
  emitObserverEvent,
  callReducer,
  isLocalhostUrl,
  logToolCall,
  logTokenUsage,
  updateCost,
  snapshotContext,
  logDecision,
} from "./__helpers/observer-emitter";

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
