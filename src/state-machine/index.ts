/**
 * Public API for the Luca workflow state machine.
 *
 * The state machine models the full workflow lifecycle using XState v5.
 * It replaces markdown-based state management with deterministic,
 * validated state transitions.
 */

// Machine
export { workflowMachine, getAllowedEvents } from "./machine";
export type { WorkflowMachineInput } from "./machine";

// Child Actors
export { phaseActorMachine } from "./actors";

// Types
export type {
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

// Guards
export { workflowGuards, guardNames } from "./guards";

// Actions
export { actionNames } from "./actions";
export type { ActionName } from "./actions";

// Events
export {
  buildTransitionRecord,
  extractContextSummary,
  isSignificantTransition,
  describeTransition,
} from "./events";

// Persistence
export {
  persistActor,
  loadPersistedActor,
  createFreshActor,
  clearPersistedState,
  stateExists,
  STATE_FILE_PATH,
} from "./persistence";

// Snapshot
export {
  generateSnapshot,
  extractSection,
  extractPreservableSections,
} from "./snapshot";
export type { SnapshotInput } from "./snapshot";

// Bridge (programmatic API)
export {
  handleReadComplexity,
  handleReadOversight,
  handleReadPhase,
  handleReadField,
  handleTransition,
  handleSnapshot,
  handleEnsureInit,
  handleGateCheck,
} from "./bridge";
