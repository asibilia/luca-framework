/**
 * Functional compiler module for converting TypeScript entity definitions
 * to target format markdown.
 *
 * Replaces the BaseCompiler class hierarchy (BaseCompiler, ClaudeCompiler,
 * CursorCompiler, PluginCompiler) with composable pure functions.
 *
 * Each entity type (agent, skill, rule) has:
 * - Per-format functions: compileAgentClaude(), compileAgentCursor(), compileAgentPlugin()
 * - A format-dispatching function: compileAgent(entity, format)
 *
 * The internal buildAgentFrontmatter() helper consolidates the duplicated
 * YAML frontmatter logic that was previously copy-pasted between
 * ClaudeCompiler and PluginCompiler.
 *
 * @module
 */
import type { BaseAgent } from "../agents/types/agent.types";
import type { BaseSkill } from "../skills/types/skill.types";
import type { BaseRule } from "../rules/types/rule.types";
import { formatFrontmatter } from "../shared/utils";

/**
 * Supported compilation output formats.
 *
 * - CLAUDE: Claude Code native format (.claude/ directory)
 * - CURSOR: Cursor IDE format (.cursor/ directory)
 * - PLUGIN: Claude Code plugin format (dist/plugin/ directory)
 */
export type SupportedFormat = "CURSOR" | "CLAUDE" | "PLUGIN";

/**
 * Validate that a format string is one of the supported formats.
 *
 * @param format - The format string to validate
 * @throws Error if the format is not "CURSOR", "CLAUDE", or "PLUGIN"
 */
export function validateFormat(format: SupportedFormat): void {
  if (format !== "CURSOR" && format !== "CLAUDE" && format !== "PLUGIN") {
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
function buildAgentFrontmatter(agent: BaseAgent): string | null {
  const cognition = agent.config.frontmatter.cognition;
  const context = agent.config.frontmatter.context;

  if (!cognition && !context) return null;

  const frontmatterData: Record<string, unknown> = {
    name: agent.name,
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
  if (frontmatter) {
    return `${frontmatter}\n\n${markdown}`;
  }
  return markdown;
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
 * @param rule - The rule instance to compile
 * @returns Compiled markdown string
 */
export function compileRuleClaude(rule: BaseRule): string {
  return rule.toClaudeFormat();
}

// ---------------------------------------------------------------------------
// Cursor format
// ---------------------------------------------------------------------------

/**
 * Compile an agent definition to Cursor-format markdown.
 *
 * @param agent - The agent instance to compile
 * @returns Compiled markdown string with YAML frontmatter
 */
export function compileAgentCursor(agent: BaseAgent): string {
  return agent.toCursorFormat();
}

/**
 * Compile a skill definition to Cursor-format markdown.
 *
 * @param skill - The skill instance to compile
 * @returns Compiled markdown string with YAML frontmatter
 */
export function compileSkillCursor(skill: BaseSkill): string {
  return skill.toCursorFormat();
}

/**
 * Compile a rule definition to Cursor-format markdown.
 *
 * @param rule - The rule instance to compile
 * @returns Compiled markdown string with YAML frontmatter
 */
export function compileRuleCursor(rule: BaseRule): string {
  return rule.toCursorFormat();
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
 * @param format - Target format: "CLAUDE", "CURSOR", or "PLUGIN"
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
    case "CURSOR":
      return compileAgentCursor(agent);
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
 * @param format - Target format: "CLAUDE", "CURSOR", or "PLUGIN"
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
    case "CURSOR":
      return compileSkillCursor(skill);
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
 * @param format - Target format: "CLAUDE", "CURSOR", or "PLUGIN"
 * @returns Compiled markdown string
 * @throws Error if format is not supported
 */
export function compileRule(rule: BaseRule, format: SupportedFormat): string {
  validateFormat(format);
  switch (format) {
    case "CLAUDE":
      return compileRuleClaude(rule);
    case "CURSOR":
      return compileRuleCursor(rule);
    case "PLUGIN":
      return compileRulePlugin(rule);
  }
}
