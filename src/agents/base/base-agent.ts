/**
 * Factory function for creating agents in the Luca Framework.
 *
 * Uses a functional pattern that aligns with the project's no-classes convention.
 */
import { toCursorFormat, toClaudeFormat } from "../../shared/format";
import { deepFreeze } from "../../shared/deep-freeze";
import { AgentConfigSchema } from "../types/agent.schemas";

import type { BaseAgent, AgentConfig } from "../types/agent.schemas";

/**
 * Create an agent instance from a validated configuration.
 *
 * @param config - Agent configuration with frontmatter and sections
 * @returns A BaseAgent-compatible object with formatting methods
 */
export function createAgent(config: AgentConfig): BaseAgent {
  // Uses parse() for fail-fast validation; use safeParse() at system boundaries
  // where graceful error handling is needed instead of thrown exceptions.
  const validated = deepFreeze(AgentConfigSchema.parse(config));
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
