/**
 * Verification domain barrel.
 *
 * Re-exports Zod schemas and inferred types for the structured
 * verification result contract. Consumed by lu-verifier (writes
 * verification-result.json) and the milestone validator (aggregates
 * results across phases).
 *
 * @module verification
 */

export {
  CriterionResultSchema,
  PhaseVerificationResultSchema,
  MilestoneVerdictSchema,
} from "./__schemas/verification.schemas";

export type {
  CriterionResult,
  PhaseVerificationResult,
  MilestoneVerdict,
} from "./__schemas/verification.schemas";
