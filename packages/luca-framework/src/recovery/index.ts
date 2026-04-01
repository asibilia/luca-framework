/**
 * Public API for the luca-recovery module.
 *
 * Deterministic crash recovery: reads lock file, state.json, and
 * convergence state to produce a RecoveryAction JSON that tells
 * the orchestrator exactly where to resume.
 */

// ─── Schemas ──────────────────────────────────────────────────────────────────

export {
  recoveryActionSchema,
  convergenceStateSchema,
  errorLedgerEntrySchema,
  RECOVERY_ACTIONS,
  CONVERGENCE_STATE_PATH,
} from "./__schemas/recovery.schemas";

export type {
  RecoveryAction,
  ConvergenceState,
  ErrorLedgerEntry,
} from "./__schemas/recovery.schemas";

// ─── Recovery Algorithm ───────────────────────────────────────────────────────

export { determineRecoveryAction } from "./__helpers/recover";

// ─── Convergence State Persistence ────────────────────────────────────────────

export {
  writeConvergenceState,
  readConvergenceState,
  clearConvergenceState,
} from "./__helpers/convergence-state";
