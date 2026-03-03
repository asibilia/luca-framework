/**
 * Tribunal schemas — re-exported from shared (T0).
 *
 * The canonical definitions live in ~/shared/__schemas/tribunal.schemas.ts.
 * This file preserves the agents barrel's public API so existing consumers
 * (including tests under __tests__/src/agents/) continue to work unchanged.
 */

export {
  reviewFindingSchema,
  CONFLICT_TYPES,
  conflictTypeSchema,
  disagreementSchema,
  REBUTTAL_RESOLUTIONS,
  rebuttalResolutionSchema,
  rebuttalSchema,
  unifiedRecommendationSchema,
  tribunalResultSchema,
} from "~/shared/__schemas/tribunal.schemas";

export type {
  ReviewFinding,
  ConflictType,
  Disagreement,
  RebuttalResolution,
  Rebuttal,
  UnifiedRecommendation,
  TribunalResult,
} from "~/shared/__schemas/tribunal.schemas";
