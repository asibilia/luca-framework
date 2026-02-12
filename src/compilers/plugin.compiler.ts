/**
 * Compiler for converting TypeScript definitions to Claude Code plugin format.
 *
 * The plugin format targets Claude Code's plugin system, where agents are
 * delivered as AGENTS.md files and skills as SKILL.md files within a plugin
 * package. Because the plugin runtime consumes the same markdown dialect as
 * Claude's native `.claude/` directory layout, the PluginCompiler reuses
 * Claude-format output for both agents and skills.
 *
 * Key behaviors:
 * - **Agents**: Identical to ClaudeCompiler -- markdown body with optional
 *   YAML frontmatter when cognition or context configuration is present.
 *   This allows lu-cognition and lu-context to parse compiled agent files
 *   at runtime without importing TypeScript modules.
 * - **Skills**: Identical to ClaudeCompiler -- plain Claude-format markdown.
 *   Plugin SKILL.md files use the same H1/H2 structure.
 * - **Rules**: Produces Claude-format markdown but notes that plugins cannot
 *   inject rules into the host project. Rule compilation is provided for
 *   completeness (e.g. bundling reference docs inside a plugin package)
 *   but the host's rule resolution ignores plugin-sourced rules.
 *
 * @example
 * ```typescript
 * import { PluginCompiler } from './plugin.compiler';
 *
 * const compiler = new PluginCompiler();
 * const agentMd = compiler.compileAgent(myAgent, 'CLAUDE');
 * const skillMd = compiler.compileSkill(mySkill, 'CLAUDE');
 * ```
 */
import { BaseCompiler } from "./base.compiler";
import type { BaseAgent } from "../agents/types/agent.types";
import type { BaseSkill } from "../skills/types/skill.types";
import type { BaseRule } from "../rules/types/rule.types";
import type { SupportedFormat } from "./base.compiler";
import { formatFrontmatter } from "../shared/utils";

export class PluginCompiler extends BaseCompiler {
  /**
   * Compile an agent definition to plugin-compatible markdown.
   *
   * Produces the same output as ClaudeCompiler: if the agent has cognition
   * or context configuration in its frontmatter, YAML frontmatter is
   * prepended to the markdown body. This enables runtime systems
   * (lu-cognition, lu-context) to extract configuration from compiled
   * `.md` files without TypeScript imports.
   *
   * @param agent - The agent instance to compile
   * @param format - Target format (must be 'CLAUDE' or 'CURSOR')
   * @returns Compiled markdown string, optionally prefixed with YAML frontmatter
   */
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

  /**
   * Compile a skill definition to plugin-compatible markdown.
   *
   * Plugin SKILL.md files use the same H1/H2 Claude markdown structure,
   * so this delegates directly to the skill's `toClaudeFormat()` method.
   *
   * @param skill - The skill instance to compile
   * @param format - Target format (must be 'CLAUDE' or 'CURSOR')
   * @returns Compiled markdown string
   */
  compileSkill(skill: BaseSkill, format: SupportedFormat): string {
    this.validateFormat(format);
    return skill.toClaudeFormat();
  }

  /**
   * Compile a rule definition to plugin-compatible markdown.
   *
   * **Note:** Claude Code plugins cannot inject rules into the host project's
   * rule resolution pipeline. The host's `.claude/rules/` directory is the
   * sole source of active rules. This method is provided for completeness --
   * plugins may bundle rule files as reference documentation or for use in
   * plugin-internal tooling, but the compiled output will NOT be loaded as
   * an active rule by the host.
   *
   * @param rule - The rule instance to compile
   * @param format - Target format (must be 'CLAUDE' or 'CURSOR')
   * @returns Compiled markdown string (informational only; not injected as a host rule)
   */
  compileRule(rule: BaseRule, format: SupportedFormat): string {
    this.validateFormat(format);
    return rule.toClaudeFormat();
  }
}
