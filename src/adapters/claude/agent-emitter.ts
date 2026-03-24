/**
 * Claude adapter agent emitter — compiles BaseAgent to Claude Code format markdown.
 *
 * Extracted from `src/compilers/__helpers/compile.ts` (compileAgentClaude +
 * buildAgentFrontmatter). This module produces byte-identical output to the
 * original compiler function.
 *
 * The emitter naming convention distinguishes adapter-domain functions from
 * compiler-domain functions: `emitAgentMarkdown` (adapter) vs
 * `compileAgentClaude` (compiler). Both produce the same output.
 *
 * @module
 */
import type { BaseAgent } from "~/agents/__schemas/agent.schemas";
import { formatFrontmatter } from "~/shared/__helpers/utils";

/**
 * Build YAML frontmatter for agents with cognition and/or context config.
 *
 * Returns a YAML frontmatter block string. The frontmatter always includes
 * name and description. Cognition and context blocks are included only when
 * the agent defines them.
 *
 * @param agent - The agent whose frontmatter config to process
 * @returns YAML frontmatter string (always present, includes at minimum name + description)
 */
function buildAgentFrontmatter(agent: BaseAgent): string {
  const cognition = agent.config.frontmatter.cognition;
  const context = agent.config.frontmatter.context;

  const frontmatterData: Record<string, unknown> = {
    name: agent.name,
    description: agent.description,
  };

  if (cognition) {
    frontmatterData.cognition = {
      default_tier: cognition.default_tier,
      promotable_to: cognition.promotable_to,
      memory_tags: cognition.memory_tags,
    };
  }

  if (context) {
    frontmatterData.context = {
      default_tier: context.default_tier,
      promotable_to: context.promotable_to,
      isolation: context.isolation,
    };
  }

  return formatFrontmatter(frontmatterData);
}

/**
 * Compile an agent definition to Claude Code format markdown.
 *
 * Calls agent.toClaudeFormat() for the markdown body, then prepends
 * YAML frontmatter with name, description, and optional cognition/context config.
 *
 * This function produces byte-identical output to the original
 * compileAgentClaude() in src/compilers/__helpers/compile.ts.
 *
 * @param agent - The agent instance to compile
 * @returns Compiled markdown string with YAML frontmatter prefix
 *
 * @example
 * ```typescript
 * import { emitAgentMarkdown } from "~/adapters/claude/agent-emitter";
 * const markdown = emitAgentMarkdown(myAgent);
 * // Returns: "---\nname: my-agent\ndescription: ...\n---\n\n# my-agent ..."
 * ```
 */
export function emitAgentMarkdown(agent: BaseAgent): string {
  const markdown = agent.toClaudeFormat();
  const frontmatter = buildAgentFrontmatter(agent);
  return `${frontmatter}\n\n${markdown}`;
}
