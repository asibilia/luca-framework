/**
 * Claude adapter skill emitter — compiles BaseSkill to Claude Code format markdown.
 *
 * Extracted from `src/compilers/__helpers/compile.ts` (compileSkillClaude +
 * compileSkillPlugin). This module produces byte-identical output to the
 * original compiler functions.
 *
 * Two exports:
 * - `emitSkillMarkdown`: Standard Claude format (no frontmatter)
 * - `emitSkillPluginMarkdown`: Plugin format (adds description frontmatter)
 *
 * @module
 */
import type { BaseSkill } from "~/skills/__schemas/skill.schemas";
import { formatFrontmatter } from "~/shared/__helpers/utils";

/**
 * Compile a skill definition to Claude Code format markdown.
 *
 * Calls skill.toClaudeFormat() to generate the markdown body.
 * No frontmatter is added for the standard Claude format — Claude Code
 * discovers skills by directory structure, not by frontmatter.
 *
 * This function produces byte-identical output to the original
 * compileSkillClaude() in src/compilers/__helpers/compile.ts.
 *
 * @param skill - The skill instance to compile
 * @returns Compiled markdown string
 */
export function emitSkillMarkdown(skill: BaseSkill): string {
  return skill.toClaudeFormat();
}

/**
 * Compile a skill definition to Claude Code plugin format markdown.
 *
 * Plugin skills require YAML frontmatter with at least a `description` field
 * for discoverability in the plugin marketplace. The markdown body is the
 * same as the standard Claude format.
 *
 * This function produces byte-identical output to the original
 * compileSkillPlugin() in src/compilers/__helpers/compile.ts.
 *
 * @param skill - The skill instance to compile
 * @returns Compiled markdown string with description frontmatter
 */
export function emitSkillPluginMarkdown(skill: BaseSkill): string {
  const markdown = skill.toClaudeFormat();
  const frontmatter = formatFrontmatter({ description: skill.description });
  return `${frontmatter}\n\n${markdown}`;
}
