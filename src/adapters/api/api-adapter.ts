/**
 * API adapter — headless execution of Luca workflows via Claude Agent SDK.
 *
 * Unlike IDE adapters (Claude, Cursor) which compile to markdown files, the
 * API adapter executes steps directly by making LLM API calls. It does not
 * support skills, rules, or hooks in the traditional sense -- skills become
 * system prompt content, rules become system prompt content, hooks become
 * SDK callbacks.
 *
 * @module
 */
import { z } from "zod";

import type { Adapter, AdapterStepResult } from "../__schemas/adapter.schemas";
import type { BaseAgent } from "~/agents";
import type { BaseSkill } from "~/skills";
import type { BaseRule } from "~/rules";
import type { WorkflowStep } from "~/workflow";
import { ApiExecutorConfigSchema, executeViaSDK } from "./api-executor";

import type { ApiExecutorConfig } from "./api-executor";

/**
 * Configuration schema for creating an API adapter instance.
 *
 * Wraps the executor config with adapter-level settings.
 */
export const ApiAdapterOptionsSchema = z.object({
  /** Executor configuration (model, tools, permissions) */
  executor: ApiExecutorConfigSchema.default(ApiExecutorConfigSchema.parse({})),
});

export type ApiAdapterOptions = z.infer<typeof ApiAdapterOptionsSchema>;

/**
 * Create the API (headless) adapter.
 *
 * Executes DAG steps by making direct LLM API calls via the Claude Agent SDK.
 * No IDE required. Enables CI/CD pipelines, overnight batch runs,
 * and agent evaluation.
 *
 * The API adapter does NOT support:
 * - Skills (skills are IDE-specific slash commands)
 * - Rules (rules are compiled into agent system prompts instead)
 * - Hooks (use SDK hook callbacks instead, configured via executor)
 *
 * The API adapter DOES support:
 * - Agents (compiled as structured objects for SDK system prompts)
 * - Workflows (DAG step execution via SDK query())
 * - Headless mode (no IDE required)
 *
 * @param rawOptions - Adapter configuration (optional, defaults applied via schema)
 * @returns A fully-configured Adapter instance for headless execution
 *
 * @example
 * ```typescript
 * import { createApiAdapter } from "~/adapters/api/api-adapter";
 *
 * const adapter = createApiAdapter({
 *   executor: { model: "claude-sonnet-4-20250514" },
 * });
 *
 * // Compile an agent to a structured object (for system prompt)
 * const agentObj = adapter.compileAgent(myAgent);
 *
 * // Execute a workflow step
 * const result = await adapter.executeStep(step, context);
 * ```
 */
export function createApiAdapter(
  rawOptions?: Partial<ApiAdapterOptions>,
): Adapter {
  const options = ApiAdapterOptionsSchema.parse(rawOptions ?? {});
  const executorConfig: ApiExecutorConfig = options.executor;

  return {
    config: {
      name: "api",
      description: "Direct LLM API execution via Claude Agent SDK (headless)",
      supportedFeatures: {
        agents: true,
        skills: false,
        rules: false,
        hooks: false,
        workflows: true,
        headless: true,
      },
    },

    compileAgent: (agent: BaseAgent): Record<string, unknown> => {
      // Return a structured object suitable for use as an SDK system prompt.
      // This includes the agent's compiled markdown instructions and metadata.
      return {
        name: agent.name,
        description: agent.description,
        instructions: agent.toClaudeFormat(),
        tools: agent.config.frontmatter.tools ?? [],
      };
    },

    compileSkill: (_skill: BaseSkill): Record<string, unknown> => {
      // API adapter does not support skills.
      // Skills are IDE-specific slash commands.
      return {
        error:
          "API adapter does not support skill compilation. Skills are IDE-specific.",
      };
    },

    compileRule: (_rule: BaseRule): Record<string, unknown> => {
      // API adapter does not support individual rule compilation.
      // Rules should be folded into agent system prompts instead.
      return {
        error:
          "API adapter does not support rule compilation. Rules are folded into agent system prompts.",
      };
    },

    executeStep: async (
      step: WorkflowStep,
      context: Record<string, unknown>,
    ): Promise<AdapterStepResult> => {
      // Extract prompt from the step — use typed access for name/handler,
      // cast only for the non-schema `prompt` field which may be added
      // by callers as an extension property.
      const stepName = step.name;
      const prompt =
        typeof (step as Record<string, unknown>).prompt === "string"
          ? String((step as Record<string, unknown>).prompt)
          : `Execute workflow step: ${stepName}. Handler: ${step.handler}`;

      // Build system prompt from context if an agent definition is available
      const systemPrompt =
        typeof context.systemPrompt === "string"
          ? context.systemPrompt
          : `You are executing workflow step "${stepName}". Complete the task thoroughly.`;

      // Use session ID from context for state continuity
      const sessionId =
        typeof context.sessionId === "string" ? context.sessionId : undefined;

      return executeViaSDK(prompt, systemPrompt, executorConfig, sessionId);
    },

    emit: async (_outputDir: string) => {
      // API adapter does not emit files — it executes directly.
      return { filesWritten: 0, filesPaths: [], warnings: [] };
    },

    detect: (_projectRoot: string): boolean => {
      // API adapter is selected explicitly via CLI flag or config.
      // It is never auto-detected from project structure.
      return false;
    },
  };
}
