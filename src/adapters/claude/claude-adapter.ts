/**
 * Claude Code adapter — compiles Luca definitions to .claude/ directory artifacts.
 *
 * Factory function returning an Adapter that delegates compilation of agents,
 * skills, and rules to the respective emitters (agent-emitter, skill-emitter,
 * rule-emitter).
 *
 * This is the default adapter and preserves 100% backward compatibility
 * with the existing Luca experience.
 *
 * @module
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

import type { Adapter, AdapterStepResult } from "../__schemas/adapter.schemas";
import type { BaseAgent } from "~/agents";
import type { BaseSkill } from "~/skills";
import type { BaseRule } from "~/rules";
import type { WorkflowStep } from "~/workflow";
import { emitAgentMarkdown } from "./agent-emitter";
import { emitSkillMarkdown } from "./skill-emitter";
import { emitRuleMarkdown } from "./rule-emitter";

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
