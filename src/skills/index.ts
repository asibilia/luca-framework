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
export { SkillEvalSchema } from "./__schemas/skill.schemas";

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
