/**
 * Public API for the complexity gating module.
 *
 * Exports types, defaults, classifications, and utility functions.
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
} from './types';

// Constants
export {
  COMPLEXITY_LEVELS,
  COMPLEXITY_ORDER,
  COMPLEXITY_TIER,
  meetsThreshold,
  getTier,
} from './types';

// Defaults
export {
  COMPLEXITY_CLASSIFICATIONS,
  DEFAULT_COMPLEXITY_MATRIX,
  DEFAULT_COMPLEXITY_CONFIG,
} from './defaults';
