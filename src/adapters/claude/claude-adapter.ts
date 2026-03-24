/**
 * Claude Code adapter — compiles Luca definitions to .claude/ directory artifacts.
 *
 * Factory function returning an Adapter that delegates compilation of agents,
 * skills, and rules to the respective emitters. Rule compilation is inlined
 * (not a separate emitter) because the logic is compact (~20 lines) and only
 * used by the Claude adapter.
 *
 * This is the default adapter and preserves 100% backward compatibility
 * with the existing Luca experience.
 *
 * @module
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

import type { Adapter, AdapterStepResult } from "../__schemas/adapter.schemas";
import type { BaseAgent } from "~/agents/__schemas/agent.schemas";
import type { BaseSkill } from "~/skills/__schemas/skill.schemas";
import type { BaseRule } from "~/rules/__schemas/rule.schemas";
import type { WorkflowStep } from "~/workflow/__schemas/workflow.schemas";
import { formatFrontmatter } from "~/shared/__helpers/utils";
import { emitAgentMarkdown } from "./agent-emitter";
import { emitSkillMarkdown } from "./skill-emitter";

/**
 * Compile a rule definition to Claude Code format markdown.
 *
 * When the rule has scoping metadata (globs or explicit alwaysApply), YAML
 * frontmatter is prepended. This is the exact logic from the original
 * compileRuleClaude() in src/compilers/__helpers/compile.ts lines 119-139.
 *
 * @param rule - The rule instance to compile
 * @returns Compiled markdown string, optionally prefixed with YAML frontmatter
 */
function emitRuleMarkdown(rule: BaseRule): string {
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

/**
 * Create the Claude Code adapter.
 *
 * Compiles agents/skills/rules to markdown artifacts in .claude/ directory.
 * Executes DAG steps by generating SKILL.md prose that Claude Code interprets
 * (executeStep is a stub until B09 wires DAG integration).
 *
 * This is the default adapter and preserves 100% backward compatibility
 * with the existing Luca experience.
 *
 * @returns A fully-configured Adapter instance for Claude Code
 *
 * @example
 * ```typescript
 * import { createClaudeAdapter } from "~/adapters/claude/claude-adapter";
 * const adapter = createClaudeAdapter();
 * const markdown = adapter.compileAgent(myAgent);
 * ```
 */
export function createClaudeAdapter(): Adapter {
  return {
    config: {
      name: "claude",
      description: "Claude Code (.claude/ directory artifacts)",
      supportedFeatures: {
        agents: true,
        skills: true,
        rules: true,
        hooks: true,
        workflows: true,
        headless: false,
      },
    },

    compileAgent: (agent: BaseAgent): string => {
      return emitAgentMarkdown(agent);
    },

    compileSkill: (skill: BaseSkill): string => {
      return emitSkillMarkdown(skill);
    },

    compileRule: (rule: BaseRule): string => {
      return emitRuleMarkdown(rule);
    },

    executeStep: async (
      _step: WorkflowStep,
      _context: Record<string, unknown>,
    ): Promise<AdapterStepResult> => {
      // Stub: DAG-to-prose compilation is future work.
      // The bridge (adapter-executor-bridge.ts) wraps this into StepResult.
      return {
        success: false,
        error:
          "Claude adapter executeStep is not yet implemented. " +
          "DAG-to-prose compilation is a future task.",
      };
    },

    emit: async (_outputDir: string) => {
      // Stub: artifact emission to .claude/ directory.
      // The current build:all pipeline handles this directly.
      // This will be wired when the build pipeline is adapter-aware.
      return { filesWritten: 0, filesPaths: [], warnings: [] };
    },

    detect: (projectRoot: string): boolean => {
      return existsSync(join(projectRoot, ".claude"));
    },
  };
}
