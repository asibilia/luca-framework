/**
 * Factory function for creating skills in the Luca Framework.
 *
 * Uses a functional pattern that aligns with the project's no-classes convention.
 */
import { toCursorFormat, toClaudeFormat } from "../../shared/format";
import { deepFreeze } from "../../shared/deep-freeze";
import { SkillConfigSchema } from "../types/skill.schemas";

import type { BaseSkill, SkillConfig } from "../types/skill.schemas";

/**
 * Create a skill instance from a validated configuration.
 *
 * @param config - Skill configuration with frontmatter and sections
 * @returns A BaseSkill-compatible object with formatting methods
 */
export function createSkill(config: SkillConfig): BaseSkill {
  // Uses parse() for fail-fast validation; use safeParse() at system boundaries
  // where graceful error handling is needed instead of thrown exceptions.
  const validated = deepFreeze(SkillConfigSchema.parse(config));
  return {
    get config() {
      return validated;
    },
    get name() {
      return validated.frontmatter.name;
    },
    get description() {
      return validated.frontmatter.description;
    },
    toCursorFormat() {
      return toCursorFormat(validated.frontmatter, validated.sections);
    },
    toClaudeFormat() {
      return toClaudeFormat(
        `# ${validated.frontmatter.name}\n\n${validated.frontmatter.description}`,
        validated.sections,
      );
    },
  };
}
