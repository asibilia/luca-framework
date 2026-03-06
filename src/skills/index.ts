/**
 * Skill registry for the Luca Framework
 *
 * Pure barrel file — re-exports only. All logic lives in __helpers/.
 */

// Registry
export { skillRegistry } from "./__helpers/build-skill-registry";

// Factory function
export { createSkill } from "./__helpers/create-skill";

// Schemas
export { SkillConfigSchema, SkillEvalSchema } from "./__schemas/skill.schemas";

// Types
export type {
  BaseSkill,
  SkillConfig,
  SkillEval,
  SkillFrontmatter,
  SkillSection,
} from "./__schemas/skill.schemas";

// PR verdict debate schemas
export {
  VERDICT_SEVERITIES,
  verdictSeveritySchema,
  validatorVerdictSchema,
  verdictSplitSchema,
  VERDICT_REBUTTAL_RESOLUTIONS,
  verdictRebuttalResolutionSchema,
  verdictRebuttalSchema,
  SPLIT_VERDICT_RECOMMENDATIONS,
  splitVerdictRecommendationSchema,
  splitVerdictResultSchema,
} from "./__schemas/pr-verdict-debate.schemas";

export type {
  VerdictSeverity,
  ValidatorVerdict,
  VerdictSplit,
  VerdictRebuttalResolution,
  VerdictRebuttal,
  SplitVerdictRecommendation,
  SplitVerdictResult,
} from "./__schemas/pr-verdict-debate.schemas";

// PR verdict debate helpers
export {
  detectVerdictSplits,
  buildDissenterPrompt,
  buildMajorityResponsePrompt,
  buildSplitVerdictResult,
  formatSplitVerdictForPR,
} from "./__helpers/pr-verdict-debate";

// Milestone debate schemas
export {
  milestoneDebateConfigSchema,
  milestoneDebateResultSchema,
} from "./__schemas/milestone-debate.schemas";

export type {
  MilestoneDebateConfig,
  MilestoneDebateResult,
} from "./__schemas/milestone-debate.schemas";

// Milestone debate helpers
export {
  shouldRunMilestoneDebate,
  buildMilestoneRebuttalContext,
  buildMilestoneDebateResult,
} from "./__helpers/milestone-debate";

// Skill scaffolding
export {
  classifySkill,
  scaffoldSkillSet,
  skillClassificationSchema,
  skillProfileSchema,
  scaffoldResultSchema,
} from "./__helpers/scaffolding";

export type {
  SkillClassification,
  SkillProfile,
  ScaffoldResult,
} from "./__helpers/scaffolding";

// Plugin marketplace
export {
  PluginRegistryEntrySchema,
  PluginRegistrySchema,
  searchRegistry,
  validatePlugin,
} from "./__helpers/marketplace";

export type {
  PluginRegistryEntry,
  PluginRegistry,
} from "./__helpers/marketplace";

// Skill dependency graph
export {
  SkillDependencySchema,
  SkillDependencyMapSchema,
} from "./__schemas/skill-dependencies";

export type {
  SkillDependency,
  SkillDependencyMap,
} from "./__schemas/skill-dependencies";

export {
  buildDependencyOrder,
  detectConflicts,
  groupParallelBatches,
} from "./__helpers/dependency-graph";
