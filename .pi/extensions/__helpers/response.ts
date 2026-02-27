/**
 * Shared tool response helpers for Pi extensions.
 *
 * Provides factory functions to create Pi-compatible tool responses,
 * eliminating the ubiquitous `{ content: [{ type: "text", text: ... }] }`
 * boilerplate pattern that appears 88+ times across 11 extensions.
 *
 * Source: src/hooks/pi-extensions/__helpers/response.ts
 */

/**
 * Pi tool response type. Shared across all extensions.
 *
 * Matches the response shape expected by Pi's tool execution layer:
 * an array of content blocks, each with a type and text payload.
 */
export interface ToolResponse {
  content: Array<{ type: "text"; text: string }>;
}

/**
 * Create a Pi tool response wrapping a plain-text message.
 *
 * Replaces the ubiquitous pattern:
 *   return { content: [{ type: "text", text: message }] }
 *
 * @param message - The text content to return
 * @returns Pi-compatible tool response object
 *
 * @example
 * ```typescript
 * // Before:
 * return { content: [{ type: "text", text: "Harness is disabled" }] };
 *
 * // After:
 * return createTextResponse("Harness is disabled");
 * ```
 */
export function createTextResponse(message: string): ToolResponse {
  return {
    content: [{ type: "text", text: message }],
  };
}

/**
 * Create a Pi tool response wrapping a JSON-serializable object.
 *
 * Replaces the pattern:
 *   return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] }
 *
 * Serializes with 2-space indentation for readability in Pi's UI.
 *
 * @param data - JSON-serializable object to return
 * @returns Pi-compatible tool response object
 * @throws TypeError if data contains circular references
 *
 * @example
 * ```typescript
 * // Before:
 * return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
 *
 * // After:
 * return createJsonResponse(summary);
 * ```
 */
export function createJsonResponse(data: unknown): ToolResponse {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}
