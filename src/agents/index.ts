/**
 * Agent registry for the Luca Framework
 *
 * Pure barrel file — re-exports only. All logic lives in __helpers/.
 */

// Registry
export { agentRegistry } from "./__helpers/build-agent-registry";

// Factory function
export { createAgent } from "./__helpers/create-agent";

// Model resolution
export {
  resolveModel,
  resolveModelWithZone,
  resolveModelWithDecision,
} from "./__helpers/resolve-model";

export type { ModelRoutingDecision } from "./__helpers/resolve-model";

// Types
export type {
  BaseAgent,
  AgentConfig,
  AgentFrontmatter,
  AgentSection,
  ModelRoutingConfig,
} from "./__schemas/agent.schemas";

// Tribunal schemas
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
} from "./__schemas/tribunal.schemas";

export type {
  ReviewFinding,
  ConflictType,
  Disagreement,
  RebuttalResolution,
  Rebuttal,
  UnifiedRecommendation,
  TribunalResult,
} from "./__schemas/tribunal.schemas";

// Tribunal detection
export {
  normalizeFindings,
  detectDisagreements,
  shouldRunTribunal,
} from "./__helpers/tribunal-detector";

// Tribunal rebuttals
export {
  buildRebuttalPrompts,
  resolveRebuttals,
  buildTribunalResult,
} from "./__helpers/tribunal-rebuttals";

export type { RebuttalPromptPair } from "./__helpers/tribunal-rebuttals";
