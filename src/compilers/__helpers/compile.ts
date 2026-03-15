/**
 * Functional compiler module for converting TypeScript entity definitions
 * to target format markdown.
 *
 * Uses composable pure functions for compilation.
 *
 * Each entity type (agent, skill, rule) has:
 * - Per-format functions: compileAgentClaude(), compileAgentPlugin()
 * - A format-dispatching function: compileAgent(entity, format)
 *
 * The internal buildAgentFrontmatter() helper consolidates shared
 * YAML frontmatter logic.
 *
 * @module
 */
import type { BaseAgent } from "~/agents/__schemas/agent.schemas";
import type { BaseSkill } from "~/skills/__schemas/skill.schemas";
import type { BaseRule } from "~/rules/__schemas/rule.schemas";
import { formatFrontmatter } from "~/shared/__helpers/utils";

/**
 * Supported compilation output formats.
 *
 * - CLAUDE: Claude Code native format (.claude/ directory)
 * - PLUGIN: Claude Code plugin format (dist/plugin/ directory)
 */
export type SupportedFormat = "CLAUDE" | "PLUGIN";

/**
 * Validate that a format string is one of the supported formats.
 *
 * @param format - The format string to validate
 * @throws Error if the format is not "CLAUDE" or "PLUGIN"
 */
export function validateFormat(format: SupportedFormat): void {
  if (format !== "CLAUDE" && format !== "PLUGIN") {
    throw new Error(`Unsupported format: ${format}`);
  }
}

/**
 * Build YAML frontmatter for agents with cognition and/or context config.
 *
 * Returns null if the agent has neither cognition nor context configuration.
 *
 * @param agent - The agent whose frontmatter config to process
 * @returns YAML frontmatter string or null if no cognition/context config
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

// ---------------------------------------------------------------------------
// Claude format
// ---------------------------------------------------------------------------

/**
 * Compile an agent definition to Claude-format markdown.
 *
 * When the agent has cognition or context configuration, YAML frontmatter
 * is prepended to the markdown body. This enables lu-cognition and lu-context
 * to parse compiled .md files and extract config at runtime without importing
 * TypeScript modules.
 *
 * @param agent - The agent instance to compile
 * @returns Compiled markdown string, optionally prefixed with YAML frontmatter
 */
export function compileAgentClaude(agent: BaseAgent): string {
  const markdown = agent.toClaudeFormat();
  const frontmatter = buildAgentFrontmatter(agent);
  return `${frontmatter}\n\n${markdown}`;
}

/**
 * Compile a skill definition to Claude-format markdown.
 *
 * @param skill - The skill instance to compile
 * @returns Compiled markdown string
 */
export function compileSkillClaude(skill: BaseSkill): string {
  return skill.toClaudeFormat();
}

/**
 * Compile a rule definition to Claude-format markdown.
 *
 * When the rule has scoping metadata (globs or explicit alwaysApply), YAML
 * frontmatter is prepended. Claude Code `.claude/rules/*.md` files support
 * YAML frontmatter with `---` delimiters for description, globs, and
 * alwaysApply fields, enabling context-aware rule loading.
 *
 * @param rule - The rule instance to compile
 * @returns Compiled markdown string, optionally prefixed with YAML frontmatter
 */
export function compileRuleClaude(rule: BaseRule): string {
  const markdown = rule.toClaudeFormat();
  const { description, globs, alwaysApply } = rule.config.frontmatter;

  const hasScoping =
    (globs !== undefined && globs.length > 0) || alwaysApply !== undefined;

  if (hasScoping) {
    const frontmatterData: Record<string, unknown> = { description };
    if (globs !== undefined && globs.length > 0) {
      frontmatterData.globs = globs;
    }
    if (alwaysApply !== undefined) {
      frontmatterData.alwaysApply = alwaysApply;
    }
    const frontmatter = formatFrontmatter(frontmatterData);
    return `${frontmatter}\n\n${markdown}`;
  }

  return markdown;
}

// ---------------------------------------------------------------------------
// Plugin format
// ---------------------------------------------------------------------------

/**
 * Compile an agent definition to plugin-compatible markdown.
 *
 * Produces the same output as compileAgentClaude: if the agent has cognition
 * or context configuration in its frontmatter, YAML frontmatter is prepended
 * to the markdown body. This enables runtime systems (lu-cognition, lu-context)
 * to extract configuration from compiled .md files without TypeScript imports.
 *
 * @param agent - The agent instance to compile
 * @returns Compiled markdown string, optionally prefixed with YAML frontmatter
 */
export function compileAgentPlugin(agent: BaseAgent): string {
  return compileAgentClaude(agent);
}

/**
 * Compile a skill definition to plugin-compatible markdown.
 *
 * Plugin SKILL.md files use Claude-format H1/H2 markdown body, but per
 * the official Claude Code plugin spec they also require YAML frontmatter
 * with at least a `description` field for discoverability.
 *
 * @param skill - The skill instance to compile
 * @returns Compiled markdown string with description frontmatter
 */
export function compileSkillPlugin(skill: BaseSkill): string {
  const markdown = skill.toClaudeFormat();
  const frontmatter = formatFrontmatter({ description: skill.description });
  return `${frontmatter}\n\n${markdown}`;
}

/**
 * Compile a rule definition to plugin-compatible markdown.
 *
 * Note: Claude Code plugins cannot inject rules into the host project's
 * rule resolution pipeline. This method is provided for completeness --
 * plugins may bundle rule files as reference documentation.
 *
 * @param rule - The rule instance to compile
 * @returns Compiled markdown string (informational only; not injected as a host rule)
 */
export function compileRulePlugin(rule: BaseRule): string {
  return compileRuleClaude(rule);
}

// ---------------------------------------------------------------------------
// Format-dispatching functions
// ---------------------------------------------------------------------------

/**
 * Compile an agent definition to the specified format.
 *
 * Dispatches to the appropriate per-format function based on the format parameter.
 *
 * @param agent - The agent instance to compile
 * @param format - Target format: "CLAUDE" or "PLUGIN"
 * @returns Compiled markdown string
 * @throws Error if format is not supported
 */
export function compileAgent(
  agent: BaseAgent,
  format: SupportedFormat,
): string {
  validateFormat(format);
  switch (format) {
    case "CLAUDE":
      return compileAgentClaude(agent);
    case "PLUGIN":
      return compileAgentPlugin(agent);
  }
}

/**
 * Compile a skill definition to the specified format.
 *
 * Dispatches to the appropriate per-format function based on the format parameter.
 *
 * @param skill - The skill instance to compile
 * @param format - Target format: "CLAUDE" or "PLUGIN"
 * @returns Compiled markdown string
 * @throws Error if format is not supported
 */
export function compileSkill(
  skill: BaseSkill,
  format: SupportedFormat,
): string {
  validateFormat(format);
  switch (format) {
    case "CLAUDE":
      return compileSkillClaude(skill);
    case "PLUGIN":
      return compileSkillPlugin(skill);
  }
}

/**
 * Compile a rule definition to the specified format.
 *
 * Dispatches to the appropriate per-format function based on the format parameter.
 *
 * @param rule - The rule instance to compile
 * @param format - Target format: "CLAUDE" or "PLUGIN"
 * @returns Compiled markdown string
 * @throws Error if format is not supported
 */
export function compileRule(rule: BaseRule, format: SupportedFormat): string {
  validateFormat(format);
  switch (format) {
    case "CLAUDE":
      return compileRuleClaude(rule);
    case "PLUGIN":
      return compileRulePlugin(rule);
  }
}
