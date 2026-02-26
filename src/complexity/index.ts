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
} from "./complexity.schemas";

// Schemas
export {
  ComplexityTierSchema,
  ComplexityClassificationSchema,
  VerificationModeSchema,
  StepActivationSchema,
  ComplexityGateSchema,
  ComplexityConfigSchema,
} from "./complexity.schemas";

// Constants
export {
  COMPLEXITY_LEVELS,
  COMPLEXITY_ORDER,
  COMPLEXITY_TIER,
  meetsThreshold,
  getTier,
} from "./complexity.schemas";

// Defaults
export {
  COMPLEXITY_CLASSIFICATIONS,
  DEFAULT_COMPLEXITY_MATRIX,
  DEFAULT_COMPLEXITY_CONFIG,
} from "./defaults";
