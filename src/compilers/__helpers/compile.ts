/**
 * Functional compiler module for converting TypeScript entity definitions
 * to target format markdown.
 *
 * This module is a thin delegation layer. The real compilation logic lives
 * in src/adapters/claude/ (agent-emitter.ts, skill-emitter.ts, claude-adapter.ts).
 * This file preserves all existing exports for backward compatibility.
 *
 * @module
 */
import type { BaseAgent } from "~/agents";
import type { BaseSkill } from "~/skills";
import type { BaseRule } from "~/rules";
import {
  createClaudeAdapter,
  emitAgentMarkdown,
  emitSkillMarkdown,
  emitSkillPluginMarkdown,
} from "~/adapters/claude";

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

// Lazily-created Claude adapter instance for rule compilation
let _claudeAdapter: ReturnType<typeof createClaudeAdapter> | null = null;
function getClaudeAdapter() {
  if (!_claudeAdapter) {
    _claudeAdapter = createClaudeAdapter();
  }
  return _claudeAdapter;
}

// ---------------------------------------------------------------------------
// Claude format — delegates to adapter emitters
// ---------------------------------------------------------------------------

/**
 * Compile an agent definition to Claude-format markdown.
 *
 * Delegates to emitAgentMarkdown from src/adapters/claude/agent-emitter.ts.
 * Output is byte-identical to the previous inline implementation.
 *
 * @param agent - The agent instance to compile
 * @returns Compiled markdown string, prefixed with YAML frontmatter
 */
export function compileAgentClaude(agent: BaseAgent): string {
  return emitAgentMarkdown(agent);
}

/**
 * Compile a skill definition to Claude-format markdown.
 *
 * Delegates to emitSkillMarkdown from src/adapters/claude/skill-emitter.ts.
 *
 * @param skill - The skill instance to compile
 * @returns Compiled markdown string
 */
export function compileSkillClaude(skill: BaseSkill): string {
  return emitSkillMarkdown(skill);
}

/**
 * Compile a rule definition to Claude-format markdown.
 *
 * Delegates to the Claude adapter's compileRule method.
 *
 * @param rule - The rule instance to compile
 * @returns Compiled markdown string, optionally prefixed with YAML frontmatter
 */
export function compileRuleClaude(rule: BaseRule): string {
  return getClaudeAdapter().compileRule!(rule) as string;
}

// ---------------------------------------------------------------------------
// Plugin format — delegates to adapter emitters
// ---------------------------------------------------------------------------

/**
 * Compile an agent definition to plugin-compatible markdown.
 *
 * Plugin agents use the same format as Claude agents.
 *
 * @param agent - The agent instance to compile
 * @returns Compiled markdown string, optionally prefixed with YAML frontmatter
 */
export function compileAgentPlugin(agent: BaseAgent): string {
  return emitAgentMarkdown(agent);
}

/**
 * Compile a skill definition to plugin-compatible markdown.
 *
 * Plugin skills add YAML frontmatter with a description field.
 *
 * @param skill - The skill instance to compile
 * @returns Compiled markdown string with description frontmatter
 */
export function compileSkillPlugin(skill: BaseSkill): string {
  return emitSkillPluginMarkdown(skill);
}

/**
 * Compile a rule definition to plugin-compatible markdown.
 *
 * Plugin rules use the same format as Claude rules.
 *
 * @param rule - The rule instance to compile
 * @returns Compiled markdown string
 */
export function compileRulePlugin(rule: BaseRule): string {
  return getClaudeAdapter().compileRule!(rule) as string;
}

// ---------------------------------------------------------------------------
// Format-dispatching functions (unchanged signatures)
// ---------------------------------------------------------------------------

/**
 * Compile an agent definition to the specified format.
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
