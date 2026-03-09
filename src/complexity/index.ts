/**
 * Public API for the complexity gating module.
 *
 * Exports types, schemas, defaults, classifications, and utility functions.
 */

// Types
export type {
  ComplexityLevel,
  ComplexityTier,
  ComplexityClassification,
  VerificationMode,
  ComplexityGate,
  ComplexityMatrix,
  ComplexityConfig,
  ModelId,
  ModelTier,
  RolePurpose,
  ReassessmentSignals,
  ReassessmentResult,
} from "./__schemas/complexity.schemas";

// Schemas
export {
  ComplexityTierSchema,
  ComplexityClassificationSchema,
  VerificationModeSchema,
  ComplexityGateSchema,
  ComplexityConfigSchema,
  ModelIdSchema,
  ModelTierSchema,
  ReassessmentSignalsSchema,
  ReassessmentResultSchema,
} from "./__schemas/complexity.schemas";

// Constants
export {
  COMPLEXITY_LEVELS,
  COMPLEXITY_ORDER,
  COMPLEXITY_TIER,
  MODEL_TIER_TO_MODEL,
  ROLE_MODEL_DEFAULTS,
  ZONE_MODEL_ADJUSTMENTS,
  meetsThreshold,
  getTier,
} from "./__schemas/complexity.schemas";

// Defaults
export {
  COMPLEXITY_CLASSIFICATIONS,
  DEFAULT_COMPLEXITY_MATRIX,
  DEFAULT_COMPLEXITY_CONFIG,
  REASSESSMENT_THRESHOLDS,
} from "./__helpers/defaults";

// Complexity gating
export {
  DEBATE_QUALIFYING_COMPLEXITIES,
  isDebateComplexity,
} from "./__helpers/complexity-gate";

// Self-tuning
export {
  assessComplexityAccuracy,
  tuneComplexityModel,
  ComplexityPredictionRecordSchema,
  ComplexityAccuracyResultSchema,
  ComplexityTuningResultSchema,
} from "./__helpers/self-tuning";

export type {
  ComplexityPredictionRecord,
  ComplexityAccuracyResult,
  ComplexityTuningResult,
} from "./__helpers/self-tuning";

// Reassessment
export {
  shouldPromoteComplexity,
  buildCalibrationEngram,
} from "./__helpers/reassessment";

export type { CalibrationEngramParams } from "./__helpers/reassessment";

// Model routing
export {
  ModelRoutingRowSchema,
  ModelRoutingTableSchema,
  MODEL_ROUTING_TABLE,
  ROUTING_PRESETS,
  DEFAULT_COMPLEXITY_TIERS,
  resolveModelForAgent,
  getRoutingRow,
} from "./__helpers/model-routing";

export type {
  ModelRoutingRow,
  ModelRoutingTable,
} from "./__helpers/model-routing";
