/**
 * Skill registry for the Luca Framework
 *
 * Pure barrel file — re-exports only. All logic lives in __helpers/.
 */

// Registry
export { skillRegistry } from "./__helpers/build-skill-registry";

// Factory function
export { createSkill } from "./__helpers/create-skill";

// Types
export type {
  BaseSkill,
  SkillConfig,
  SkillFrontmatter,
  SkillSection,
} from "./__schemas/skill.schemas";
