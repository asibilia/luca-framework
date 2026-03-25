/**
 * Rule-to-markdown emitter for the Claude Code adapter.
 *
 * Compiles a rule definition to Claude Code format markdown, optionally
 * prepending YAML frontmatter when the rule has scoping metadata (globs
 * or explicit alwaysApply).
 *
 * Extracted from claude-adapter.ts to follow the same emitter pattern
 * as agent-emitter.ts and skill-emitter.ts.
 *
 * @module
 */
import type { BaseRule } from "~/rules";
import { formatFrontmatter } from "~/shared/__helpers/utils";

/**
 * Compile a rule definition to Claude Code format markdown.
 *
 * When the rule has scoping metadata (globs or explicit alwaysApply), YAML
 * frontmatter is prepended. This is the exact logic from the original
 * compileRuleClaude() in src/compilers/__helpers/compile.ts lines 119-139.
 *
 * @param rule - The rule instance to compile
 * @returns Compiled markdown string, optionally prefixed with YAML frontmatter
 *
 * @example
 * ```typescript
 * import { emitRuleMarkdown } from "~/adapters/claude/rule-emitter";
 * const markdown = emitRuleMarkdown(myRule);
 * ```
 */
export function emitRuleMarkdown(rule: BaseRule): string {
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
