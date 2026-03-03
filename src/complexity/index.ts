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
  StepActivation,
  ComplexityGate,
  ComplexityMatrix,
  ComplexityConfig,
  ModelId,
  ModelTier,
  RolePurpose,
} from "./__schemas/complexity.schemas";

// Schemas
export {
  ComplexityTierSchema,
  ComplexityClassificationSchema,
  VerificationModeSchema,
  StepActivationSchema,
  ComplexityGateSchema,
  ComplexityConfigSchema,
  ModelIdSchema,
  ModelTierSchema,
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
} from "./__helpers/defaults";

// Complexity gating
export {
  DEBATE_QUALIFYING_COMPLEXITIES,
  isDebateComplexity,
} from "./__helpers/complexity-gate";
