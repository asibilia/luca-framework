/**
 * Public API for the per-phase drift detection module.
 *
 * Exports the drift checker, schemas, types, and constants used by the
 * orchestrator to detect when completed work invalidates remaining phases.
 *
 * @module drift
 */

export {
  checkDrift,
  getChangedFiles,
  getDeletedOrRenamed,
  filterInfrastructureFiles,
} from "./__helpers/drift-checker";

export type {
  PhaseInfo,
  DriftReason,
  DriftReasonKind,
  AffectedPhase,
  DriftResult,
  DriftEvent,
  PhaseVerdict,
  PhaseVerdictKind,
  ReassessmentResult,
} from "./__schemas/drift.schemas";

export {
  PhaseInfoSchema,
  DriftReasonSchema,
  DriftReasonKindSchema,
  AffectedPhaseSchema,
  DriftResultSchema,
  DriftEventSchema,
  PhaseVerdictSchema,
  PhaseVerdictKindSchema,
  ReassessmentResultSchema,
  INFRASTRUCTURE_IGNORE_LIST,
  STRUCTURAL_CHANGE_PATTERNS,
} from "./__schemas/drift.schemas";
