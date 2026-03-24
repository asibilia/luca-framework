---
title: "Runtime B06: API adapter executor — direct LLM execution via Claude Agent SDK"
area: adapters
created: 2026-03-24
source: docs/runtime-architecture/adapter-architecture.md
depends_on: [B01]
phase: runtime-b
estimated_files: 1
---

## Context

The API adapter enables headless execution of Luca workflows without an IDE. It uses the Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) to make direct LLM calls. This task creates the executor module that wraps the SDK's `query()` function with Luca-specific concerns: model routing, token tracking, and result mapping.

The SDK provides all tools natively (Read, Write, Edit, Bash, Grep, Glob, WebSearch, WebFetch, Agent) — no custom tool bridge is needed.

**Security note from research:** The SDK's `allowedTools` does NOT restrict tools — it auto-approves them. Unlisted tools fall through to `permissionMode`. For security in headless mode, use `disallowedTools` to block unwanted tools, or `canUseTool` for fine-grained control.

## Task

### Step 0: Install SDK Dependency

Before creating the file, the SDK must be added as a dependency:

```bash
bun add @anthropic-ai/claude-agent-sdk
```

This is a runtime dependency, not a dev dependency.

### File: `src/adapters/api/api-executor.ts`

Create the directory and file:

```
src/adapters/
  api/
    api-executor.ts
```

### Types to Define

**`ApiExecutorConfig`** — configuration for an executor instance:

```typescript
import { z } from "zod";

/**
 * Configuration for the API executor.
 *
 * Controls model selection, tool permissions, and cost tracking.
 */
export const ApiExecutorConfigSchema = z.object({
  /** Anthropic model ID to use (e.g., "claude-sonnet-4-20250514") */
  model: z.string().default("claude-sonnet-4-20250514"),
  /** Maximum tokens the model can generate per step */
  maxTokens: z.number().int().positive().default(16384),
  /** Permission mode for tool usage */
  permissionMode: z
    .enum(["default", "acceptEdits", "bypassPermissions"])
    .default("acceptEdits"),
  /** Tools to explicitly block (security: use this instead of allowedTools for restriction) */
  disallowedTools: z.array(z.string()).default([]),
  /** Tools to auto-approve (does NOT restrict — only auto-approves listed tools) */
  allowedTools: z
    .array(z.string())
    .default(["Read", "Write", "Edit", "Bash", "Grep", "Glob"]),
  /** MCP server configurations for the SDK */
  mcpServers: z.record(z.string(), z.unknown()).default({}),
  /** Whether to load project settings from .claude/ directory */
  useProjectSettings: z.boolean().default(false),
});

export type ApiExecutorConfig = z.infer<typeof ApiExecutorConfigSchema>;
```

**`TokenUsage`** — accumulated token usage:

```typescript
export const TokenUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative().default(0),
  outputTokens: z.number().int().nonnegative().default(0),
});

export type TokenUsage = z.infer<typeof TokenUsageSchema>;
```

### Functions to Implement

**`executeViaSDK`** — execute a prompt through the Claude Agent SDK:

````typescript
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { AdapterStepResult } from "../__schemas/adapter.schemas";

/**
 * Execute a prompt via the Claude Agent SDK's query() function.
 *
 * Streams the SDK response, collects the result message, and tracks
 * token usage. Returns an AdapterStepResult.
 *
 * The SDK provides Read, Write, Edit, Bash, Grep, Glob, WebSearch,
 * WebFetch, and Agent tools natively. No custom tool bridge is needed.
 *
 * @param prompt - The prompt to send to the model
 * @param systemPrompt - System prompt (compiled agent instructions)
 * @param config - Executor configuration (model, tools, permissions)
 * @param sessionId - Optional session ID for state continuity across steps
 * @returns The step execution result with token usage
 *
 * @example
 * ```typescript
 * const result = await executeViaSDK(
 *   "Analyze the code in src/adapters/",
 *   "You are a code reviewer. Be thorough.",
 *   ApiExecutorConfigSchema.parse({}),
 * );
 * if (result.success) {
 *   console.log("Result:", result.output);
 *   console.log("Tokens:", result.tokenUsage);
 * }
 * ```
 */
export async function executeViaSDK(
  prompt: string,
  systemPrompt: string,
  config: ApiExecutorConfig,
  sessionId?: string,
): Promise<AdapterStepResult> {
  const tokenUsage: TokenUsage = { inputTokens: 0, outputTokens: 0 };

  try {
    const options: Record<string, unknown> = {
      model: config.model,
      maxTurns: 50,
      systemPrompt,
      allowedTools: config.allowedTools,
      disallowedTools: config.disallowedTools,
      permissionMode: config.permissionMode,
    };

    // Add session resumption if provided
    if (sessionId) {
      options.resume = sessionId;
    }

    // Add MCP servers if configured
    if (Object.keys(config.mcpServers).length > 0) {
      options.mcpServers = config.mcpServers;
    }

    // Add project settings source if enabled
    if (config.useProjectSettings) {
      options.settingSources = ["project"];
    }

    let resultText: string | undefined;
    let capturedSessionId: string | undefined;

    for await (const message of query({ prompt, options })) {
      // Capture session ID from init message
      if (
        message &&
        typeof message === "object" &&
        "type" in message &&
        message.type === "system" &&
        "subtype" in message &&
        message.subtype === "init" &&
        "session_id" in message
      ) {
        capturedSessionId = message.session_id as string;
      }

      // Track token usage from usage messages
      if (
        message &&
        typeof message === "object" &&
        "type" in message &&
        message.type === "usage"
      ) {
        const usage = message as Record<string, unknown>;
        if (typeof usage.input_tokens === "number") {
          tokenUsage.inputTokens += usage.input_tokens;
        }
        if (typeof usage.output_tokens === "number") {
          tokenUsage.outputTokens += usage.output_tokens;
        }
      }

      // Capture result text
      if (message && typeof message === "object" && "result" in message) {
        resultText = String((message as Record<string, unknown>).result);
      }
    }

    return {
      success: true,
      output: {
        result: resultText,
        sessionId: capturedSessionId,
      },
      tokenUsage,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `SDK execution failed: ${errorMessage}`,
      tokenUsage,
    };
  }
}
````

### Imports

```typescript
import { z } from "zod";
import { query } from "@anthropic-ai/claude-agent-sdk";

import type { AdapterStepResult } from "../__schemas/adapter.schemas";
```

### Exports

```typescript
export { ApiExecutorConfigSchema, TokenUsageSchema, executeViaSDK };
export type { ApiExecutorConfig, TokenUsage };
```

## Verification

```bash
bunx --bun tsc --noEmit
```

- File `src/adapters/api/api-executor.ts` exists
- `@anthropic-ai/claude-agent-sdk` is in `package.json` dependencies
- Exports `ApiExecutorConfigSchema`, `TokenUsageSchema`, `executeViaSDK`
- Exports types `ApiExecutorConfig`, `TokenUsage`
- `executeViaSDK` signature: `(prompt: string, systemPrompt: string, config: ApiExecutorConfig, sessionId?: string) => Promise<AdapterStepResult>`
- Uses `disallowedTools` for security restriction (NOT `allowedTools`)
- No TypeScript errors
- No classes used
- File uses kebab-case naming

## Notes

- The SDK's `query()` return type and message shapes may differ from what is sketched here. The implementing agent must verify the actual SDK types from `@anthropic-ai/claude-agent-sdk` and adjust the message handling accordingly. The message property checks use runtime type narrowing (`typeof message === "object" && "type" in message`) to handle any SDK message shape safely.
- Token tracking relies on SDK "usage" messages. If the SDK does not emit these messages, token tracking will silently return zeros. This is acceptable for v1.
- The `options` parameter to `query()` is typed as `Record<string, unknown>` because the SDK's exact options type may not be exported. If the SDK exports a typed options interface, use that instead.
- The `maxTurns: 50` default prevents runaway agent loops. This is configurable via the config schema in future iterations.
