/**
 * Factory function for creating rules in the Luca Framework.
 *
 * Uses a functional pattern that aligns with the project's no-classes convention.
 */
import { toCursorFormat, toClaudeFormat } from "../../shared/format";
import { deepFreeze } from "../../shared/deep-freeze";
import { RuleConfigSchema } from "../types/rule.schemas";

import type { BaseRule, RuleConfig } from "../types/rule.schemas";

/**
 * Create a rule instance from a validated configuration.
 *
 * @param config - Rule configuration with frontmatter and sections
 * @returns A BaseRule-compatible object with formatting methods
 */
export function createRule(config: RuleConfig): BaseRule {
  // Uses parse() for fail-fast validation; use safeParse() at system boundaries
  // where graceful error handling is needed instead of thrown exceptions.
  const validated = deepFreeze(RuleConfigSchema.parse(config));
  return {
    get config() {
      return validated;
    },
    get name() {
      return (
        validated.frontmatter.description
          .substring(0, 30)
          .replace(/\s+/g, "-") || "rule"
      );
    },
    get description() {
      return validated.frontmatter.description;
    },
    toCursorFormat() {
      return toCursorFormat(validated.frontmatter, validated.sections);
    },
    toClaudeFormat() {
      return toClaudeFormat(
        `# ${validated.frontmatter.description}`,
        validated.sections,
      );
    },
  };
}
