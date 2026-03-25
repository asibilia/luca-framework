/**
 * API adapter executor — direct LLM execution via Claude Agent SDK.
 *
 * Wraps the SDK's `query()` async generator with Luca-specific concerns:
 * model routing, token tracking, and result mapping to AdapterStepResult.
 *
 * The SDK provides all tools natively (Read, Write, Edit, Bash, Grep, Glob,
 * WebSearch, WebFetch, Agent) — no custom tool bridge is needed.
 *
 * Security note: The SDK's `allowedTools` does NOT restrict tools — it
 * auto-approves them. Unlisted tools fall through to `permissionMode`.
 * For security in headless mode, use `disallowedTools` to block unwanted
 * tools, or `canUseTool` for fine-grained control.
 *
 * @module
 */
import { z } from "zod";

import { query } from "@anthropic-ai/claude-agent-sdk";
import type {
  Options,
  SDKMessage,
  SDKResultSuccess,
  SDKResultError,
  SDKSystemMessage,
} from "@anthropic-ai/claude-agent-sdk";

import type { AdapterStepResult } from "../__schemas/adapter.schemas";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

/**
 * Configuration for the API executor.
 *
 * Controls model selection, tool permissions, and cost tracking.
 * Uses Zod schema-first parsing — all defaults defined in the schema.
 */
export const ApiExecutorConfigSchema = z.object({
  /** Anthropic model ID to use (e.g., "claude-sonnet-4-20250514") */
  model: z.string().default("claude-sonnet-4-20250514"),
  /** Maximum agentic turns (API round-trips) before stopping */
  maxTurns: z.number().int().positive().default(50),
  /** Permission mode for tool usage */
  permissionMode: z
    .enum(["default", "acceptEdits", "bypassPermissions", "plan", "dontAsk"])
    .default("acceptEdits"),
  /** Tools to explicitly block (security: use this instead of allowedTools for restriction) */
  disallowedTools: z.array(z.string()).default([]),
  /** Tools to auto-approve (does NOT restrict — only auto-approves listed tools) */
  allowedTools: z
    .array(z.string())
    .default(["Read", "Write", "Edit", "Bash", "Grep", "Glob"]),
  /** MCP server configurations for the SDK */
  mcpServers: z.record(z.string(), z.unknown()).default({}) as z.ZodType<
    Record<string, unknown>
  >,
  /** Whether to disable session persistence to disk */
  disableSessionPersistence: z.boolean().default(true),
});

export type ApiExecutorConfig = z.infer<typeof ApiExecutorConfigSchema>;

/**
 * Accumulated token usage from a query execution.
 *
 * Tracks input and output tokens consumed during the SDK call.
 * Values are extracted from the SDK's result message usage field.
 */
export const AdapterTokenUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative().default(0),
  outputTokens: z.number().int().nonnegative().default(0),
});

export type AdapterTokenUsage = z.infer<typeof AdapterTokenUsageSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Type guard for SDK messages with a specific type and optional subtype.
 *
 * Consolidates the repeated `typeof === "object" && !== null && "type" in message`
 * prelude shared by all SDK message type guards.
 *
 * @param message - An SDK message to check
 * @param type - The expected message type (e.g., "system", "result")
 * @param subtype - Optional expected subtype (e.g., "init", "success")
 * @returns true if the message matches the given type and subtype
 */
function isSdkMessage(
  message: SDKMessage,
  type: string,
  subtype?: string,
): boolean {
  if (typeof message !== "object" || message === null) return false;
  if (!("type" in message) || message.type !== type) return false;
  if (subtype !== undefined) {
    return "subtype" in message && message.subtype === subtype;
  }
  return true;
}

/**
 * Type guard for SDKSystemMessage (init).
 *
 * @param message - An SDK message to check
 * @returns true if this is the system init message containing session_id
 */
function isSystemInitMessage(message: SDKMessage): message is SDKSystemMessage {
  return isSdkMessage(message, "system", "init");
}

/**
 * Type guard for SDKResultSuccess.
 *
 * @param message - An SDK message to check
 * @returns true if this is a successful result message
 */
function isResultSuccess(message: SDKMessage): message is SDKResultSuccess {
  return isSdkMessage(message, "result", "success");
}

/**
 * Type guard for SDKResultError.
 *
 * @param message - An SDK message to check
 * @returns true if this is an error result message
 */
function isResultError(message: SDKMessage): message is SDKResultError {
  return (
    isSdkMessage(message, "result") &&
    "subtype" in message &&
    message.subtype !== "success" &&
    "errors" in message
  );
}

/**
 * Extract token usage from an SDK result message.
 *
 * The SDK result message includes a `usage` field with per-field token counts.
 * We extract inputTokens and outputTokens for Luca's tracking.
 *
 * @param result - SDK result message (success or error)
 * @returns Token usage with input and output counts
 */
function extractTokenUsage(
  result: SDKResultSuccess | SDKResultError,
): AdapterTokenUsage {
  const usage = result.usage;
  return {
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Executor
// ---------------------------------------------------------------------------

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
 * @param sessionId - Optional session ID for resuming a previous session
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
  let tokenUsage: AdapterTokenUsage = { inputTokens: 0, outputTokens: 0 };

  try {
    const options: Options = {
      model: config.model,
      maxTurns: config.maxTurns,
      systemPrompt,
      allowedTools: config.allowedTools,
      disallowedTools: config.disallowedTools,
      permissionMode: config.permissionMode,
      persistSession: !config.disableSessionPersistence,
    };

    // Add session resumption if provided
    if (sessionId) {
      options.resume = sessionId;
    }

    // Add MCP servers if configured
    if (Object.keys(config.mcpServers).length > 0) {
      options.mcpServers = config.mcpServers as Options["mcpServers"];
    }

    let resultText: string | undefined;
    let capturedSessionId: string | undefined;

    for await (const message of query({ prompt, options })) {
      // Capture session ID from init message
      if (isSystemInitMessage(message)) {
        capturedSessionId = message.session_id;
      }

      // Capture result from success message
      if (isResultSuccess(message)) {
        resultText = message.result;
        tokenUsage = extractTokenUsage(message);
        capturedSessionId = message.session_id;
      }

      // Handle error result
      if (isResultError(message)) {
        tokenUsage = extractTokenUsage(message);
        capturedSessionId = message.session_id;
        return {
          success: false,
          error: `SDK execution error (${message.subtype}): ${message.errors.join("; ")}`,
          tokenUsage,
        };
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
