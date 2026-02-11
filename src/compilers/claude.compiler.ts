/**
 * Compiler for converting TypeScript definitions to Claude format.
 *
 * When an agent has cognition or context configuration in its frontmatter,
 * the compiler prepends YAML frontmatter with name, cognition, and/or
 * context fields to the compiled markdown output. This enables lu-cognition
 * and lu-context to parse compiled .md files and extract config at runtime
 * without importing TypeScript modules.
 */
import { BaseCompiler } from "./base.compiler";
import type { BaseAgent } from "../agents/types/agent.types";
import type { BaseSkill } from "../skills/types/skill.types";
import type { BaseRule } from "../rules/types/rule.types";
import type { SupportedFormat } from "./base.compiler";
import { formatFrontmatter } from "../shared/utils";

export class ClaudeCompiler extends BaseCompiler {
  compileAgent(agent: BaseAgent, format: SupportedFormat): string {
    this.validateFormat(format);
    const markdown = agent.toClaudeFormat();

    const cognition = agent.config.frontmatter.cognition;
    const context = agent.config.frontmatter.context;

    // Emit YAML frontmatter if cognition OR context config is present
    if (cognition || context) {
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

      const yamlBlock = formatFrontmatter(frontmatterData);
      return `${yamlBlock}\n\n${markdown}`;
    }

    return markdown;
  }

  compileSkill(skill: BaseSkill, format: SupportedFormat): string {
    this.validateFormat(format);
    return skill.toClaudeFormat();
  }

  compileRule(rule: BaseRule, format: SupportedFormat): string {
    this.validateFormat(format);
    return rule.toClaudeFormat();
  }
}
