/**
 * Factory function for creating agents in the Luca Framework.
 *
 * Replaces the former BaseAgentImpl abstract class with a functional pattern
 * that aligns with the project's no-classes convention.
 */
import type { BaseAgent, AgentConfig } from "../types/agent.types";
import { toCursorFormat, toClaudeFormat } from "../../shared/format";
import { agentConfigSchema } from "../types/agent.schemas";

/**
 * Create an agent instance from a validated configuration.
 *
 * @param config - Agent configuration with frontmatter and sections
 * @returns A BaseAgent-compatible object with formatting methods
 */
export function createAgent(config: AgentConfig): BaseAgent {
  // Uses parse() for fail-fast validation; use safeParse() at system boundaries
  // where graceful error handling is needed instead of thrown exceptions.
  const validated = Object.freeze(agentConfigSchema.parse(config));
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
