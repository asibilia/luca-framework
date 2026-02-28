/**
 * Factory function for creating agents in the Luca Framework.
 *
 * Uses a functional pattern that aligns with the project's no-classes convention.
 */
import {
  toCursorFormat,
  toClaudeFormat,
  toPiFormat,
} from "~/shared/__helpers/format";
import { deepFreeze } from "~/shared/__helpers/deep-freeze";
import { AgentConfigSchema } from "~/agents/__schemas/agent.schemas";

import type { BaseAgent, AgentConfig } from "~/agents/__schemas/agent.schemas";

/**
 * Build Pi-specific frontmatter for an agent.
 *
 * Includes name, description, tools (if defined), and model
 * (from model_routing.default_model if present).
 */
function buildPiAgentFrontmatter(
  frontmatter: AgentConfig["frontmatter"],
): Record<string, unknown> {
  const piFm: Record<string, unknown> = {
    name: frontmatter.name,
    description: frontmatter.description,
  };

  if (frontmatter.tools && frontmatter.tools.length > 0) {
    piFm.tools = frontmatter.tools;
  }

  if (frontmatter.model_routing?.default_model) {
    piFm.model = frontmatter.model_routing.default_model;
  }

  if (frontmatter.model_tier) {
    piFm.model_tier = frontmatter.model_tier;
  }

  if (frontmatter.background_spawnable != null) {
    piFm.background_spawnable = frontmatter.background_spawnable;
  }
  if (frontmatter.purpose) {
    piFm.purpose = frontmatter.purpose;
  }
  if (frontmatter.allowed_contexts && frontmatter.allowed_contexts.length > 0) {
    piFm.allowed_contexts = frontmatter.allowed_contexts;
  }

  return piFm;
}

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
    toPiFormat() {
      const piFm = buildPiAgentFrontmatter(validated.frontmatter);
      return toPiFormat(
        piFm,
        `# ${validated.frontmatter.name}\n\n${validated.frontmatter.description}`,
        validated.sections,
      );
    },
  };
}
