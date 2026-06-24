---
title: "Runtime B07: API adapter main — wire executor into Adapter interface"
area: adapters
created: 2026-03-24
source: docs/runtime-architecture/adapter-architecture.md
depends_on: [B01, B06]
phase: runtime-b
estimated_files: 2
---

## Context

The API adapter enables headless execution of Luca workflows via the Claude Agent SDK. Unlike the Claude adapter which compiles to markdown files, the API adapter executes steps directly by making LLM API calls. It does not support skills, rules, or hooks in the traditional sense — skills become system prompt content, rules become system prompt content, hooks become SDK callbacks.

## Task

### File 1: `src/adapters/api/api-adapter.ts`

Create the API adapter factory function.

````typescript
import { z } from "zod";

import type { Adapter, AdapterStepResult } from "../__schemas/adapter.schemas";
import type { BaseAgent } from "~/agents/__schemas/agent.schemas";
import type { BaseSkill } from "~/skills/__schemas/skill.schemas";
import type { BaseRule } from "~/rules/__schemas/rule.schemas";
import { ApiExecutorConfigSchema, executeViaSDK } from "./api-executor";
import type { ApiExecutorConfig } from "./api-executor";

/**
 * Configuration schema for creating an API adapter instance.
 *
 * Wraps the executor config with adapter-level settings.
 */
export const ApiAdapterOptionsSchema = z.object({
  /** Executor configuration (model, tools, permissions) */
  executor: ApiExecutorConfigSchema.default({}),
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
      step: unknown,
      context: Record<string, unknown>,
    ): Promise<AdapterStepResult> => {
      // Extract prompt and system prompt from the step.
      // The step is typed as unknown until B09 wires the concrete WorkflowStep type.
      // For now, expect step to have at minimum { id, name, handler } and
      // a prompt derived from context.
      const stepObj = step as Record<string, unknown>;
      const stepName = String(stepObj.name ?? stepObj.id ?? "unknown-step");
      const prompt =
        typeof stepObj.prompt === "string"
          ? stepObj.prompt
          : `Execute workflow step: ${stepName}`;

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
````

### File 2: `src/adapters/api/index.ts`

Create a barrel for the API adapter subdirectory:

```typescript
/**
 * API adapter — headless execution via Claude Agent SDK.
 */
export { createApiAdapter, ApiAdapterOptionsSchema } from "./api-adapter";
export type { ApiAdapterOptions } from "./api-adapter";
export {
  ApiExecutorConfigSchema,
  TokenUsageSchema,
  executeViaSDK,
} from "./api-executor";
export type { ApiExecutorConfig, TokenUsage } from "./api-executor";
```

### Imports for `api-adapter.ts`

```typescript
import { z } from "zod";

import type { Adapter, AdapterStepResult } from "../__schemas/adapter.schemas";
import type { BaseAgent } from "~/agents/__schemas/agent.schemas";
import type { BaseSkill } from "~/skills/__schemas/skill.schemas";
import type { BaseRule } from "~/rules/__schemas/rule.schemas";
import { ApiExecutorConfigSchema, executeViaSDK } from "./api-executor";
import type { ApiExecutorConfig } from "./api-executor";
```

### Exports from `api-adapter.ts`

```typescript
export { createApiAdapter, ApiAdapterOptionsSchema };
export type { ApiAdapterOptions };
```

## Verification

```bash
bunx --bun tsc --noEmit
```

- File `src/adapters/api/api-adapter.ts` exists and exports `createApiAdapter`
- File `src/adapters/api/index.ts` exists and re-exports all public API
- `createApiAdapter()` returns an object satisfying the `Adapter` type from B01
- `createApiAdapter` accepts an optional `Partial<ApiAdapterOptions>` parameter
- `compileAgent` returns a `Record<string, unknown>` (structured object, not string)
- `compileSkill` returns an error object (not supported)
- `compileRule` returns an error object (not supported)
- `executeStep` delegates to `executeViaSDK` with extracted prompt/systemPrompt
- `emit` returns empty result (API adapter does not emit files)
- `detect` returns `false` (API adapter is never auto-detected)
- No TypeScript errors
- No classes used
- All files use kebab-case naming

## Notes

- The `executeStep` implementation uses type narrowing (`step as Record<string, unknown>`) because the concrete `WorkflowStep` type from Phase A is not yet available. B09 will replace this with proper typed access.
- The `compileAgent` method returns a structured object (not markdown string) because the API adapter uses agent definitions as system prompts for the SDK, not as files on disk.
- `detect` always returns `false` because the API adapter is selected explicitly (via `--adapter=api` CLI flag or config), never by environment detection.
- Cost tracking is handled at the executor level (`executeViaSDK` returns `tokenUsage`). Aggregation across steps happens in the DAG executor (B09).
