/**
 * Cursor IDE adapter — compiles Luca definitions to .cursor/ directory artifacts.
 *
 * Factory function returning an Adapter that compiles rules to .mdc frontmatter
 * format, passes skills through unchanged (Cursor uses the same agentskills.io
 * SKILL.md format as Claude Code), and compiles agents to markdown (Cursor has
 * no dedicated agent format).
 *
 * CRITICAL: Rule compilation reads from `rule.config.frontmatter` and
 * `rule.config.sections` directly. It NEVER calls `rule.toClaudeFormat()`.
 *
 * @module
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

import type { Adapter, EmitResult } from "../__schemas/adapter.schemas";
import type { BaseAgent } from "~/agents";
import type { BaseSkill } from "~/skills";
import type { BaseRule } from "~/rules";
import { formatFrontmatter } from "~/shared/__helpers/utils";
import { sectionsToMarkdown } from "../__helpers/format-sections";
import { emitCompiledOutputs } from "../__helpers/adapter-emit";

/**
 * Compile a rule to Cursor .mdc format with YAML frontmatter.
 *
 * Reads from `rule.config.frontmatter` and `rule.config.sections` directly.
 * Never calls `rule.toClaudeFormat()`.
 *
 * Frontmatter mapping:
 * - `description` -> `description` (passthrough)
 * - `globs` (array) -> `globs` (joined with `, ` if array)
 * - `alwaysApply` -> `alwaysApply` (boolean, default false)
 * - If no globs and no explicit alwaysApply, sets `alwaysApply: true`
 *
 * @param rule - The rule definition to compile
 * @returns Compiled .mdc string with YAML frontmatter and markdown body
 */
function compileCursorRule(rule: BaseRule): string {
  const { description, globs, alwaysApply } = rule.config.frontmatter;

  // Build frontmatter fields object
  const fields: Record<string, unknown> = { description };

  const hasGlobs = globs !== undefined && globs.length > 0;
  if (hasGlobs) {
    fields.globs = globs.join(", ");
  }

  // Determine alwaysApply value:
  // - If explicitly set, use that value
  // - If no globs and no explicit alwaysApply, default to true
  // - Otherwise default to false
  let alwaysApplyValue: boolean;
  if (alwaysApply !== undefined) {
    alwaysApplyValue = alwaysApply;
  } else if (!hasGlobs) {
    alwaysApplyValue = true;
  } else {
    alwaysApplyValue = false;
  }
  fields.alwaysApply = alwaysApplyValue;

  const frontmatter = formatFrontmatter(fields);
  const body = sectionsToMarkdown(rule.config.sections);

  return `${frontmatter}\n\n${body}`;
}

/**
 * Compile a skill to Cursor format (passthrough).
 *
 * Cursor uses the agentskills.io SKILL.md format, identical to Claude Code.
 * Returns sections concatenated as markdown without transformation.
 *
 * @param skill - The skill definition to compile
 * @returns Skill sections as markdown
 */
function compileCursorSkill(skill: BaseSkill): string {
  return sectionsToMarkdown(skill.config.sections);
}

/**
 * Compile an agent to Cursor format (markdown, no dedicated agent format).
 *
 * Cursor has no dedicated agent directory. Agent definitions are compiled to
 * markdown using `agent.config.sections`. This output can be consumed by
 * Cursor via rules if needed.
 *
 * @param agent - The agent definition to compile
 * @returns Agent sections as markdown with H1 heading
 */
function compileCursorAgent(agent: BaseAgent): string {
  const heading = `# ${agent.config.frontmatter.name}`;
  const body = sectionsToMarkdown(agent.config.sections);
  return `${heading}\n\n${body}`;
}

/**
 * Create the Cursor IDE adapter.
 *
 * Compiles agents/skills/rules to Cursor-compatible formats:
 * - Rules: .mdc format with YAML frontmatter (description, globs, alwaysApply)
 * - Skills: Passthrough (same agentskills.io SKILL.md format as Claude Code)
 * - Agents: Markdown (Cursor has no dedicated agent format)
 * - Hooks: Supported via event name mapping (see cursor-hook-map.ts)
 *
 * @returns A fully-configured Adapter instance for Cursor IDE
 *
 * @example
 * ```typescript
 * import { createCursorAdapter } from "~/adapters/cursor";
 * const adapter = createCursorAdapter();
 * const mdcRule = adapter.compileRule(myRule);
 * ```
 */
export function createCursorAdapter(): Adapter {
  /** Internal buffer: relative path -> compiled content */
  const compiledOutputs = new Map<string, string>();

  return {
    config: {
      name: "cursor",
      description: "Cursor IDE (.cursor/ directory artifacts)",
      supportedFeatures: {
        agents: false,
        skills: true,
        rules: true,
        hooks: true,
        workflows: false,
        headless: false,
      },
    },

    compileAgent: (agent: BaseAgent): string => {
      return compileCursorAgent(agent);
    },

    compileSkill: (skill: BaseSkill): string => {
      const compiled = compileCursorSkill(skill);
      compiledOutputs.set(`skills/${skill.name}/SKILL.md`, compiled);
      return compiled;
    },

    compileRule: (rule: BaseRule): string => {
      const compiled = compileCursorRule(rule);
      compiledOutputs.set(`rules/${rule.name}.mdc`, compiled);
      return compiled;
    },

    emit: async (outputDir: string): Promise<EmitResult> => {
      return emitCompiledOutputs(compiledOutputs, outputDir);
    },

    detect: (projectRoot: string): boolean => {
      return existsSync(join(projectRoot, ".cursor"));
    },
  };
}
