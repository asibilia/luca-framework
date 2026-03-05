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
 * Optional `details` field provides structured metadata for Pi's UI.
 */
export interface ToolResponse {
  content: Array<{ type: "text"; text: string }>;
  details?: Record<string, unknown>;
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

/**
 * Create a Pi tool response with both content and structured details.
 *
 * The `details` field provides structured metadata that Pi can display
 * separately from the main content (e.g., in expandable panels or
 * side annotations).
 *
 * @param data - JSON-serializable object for content
 * @param details - Structured metadata for Pi's UI
 * @returns Pi-compatible tool response with details
 *
 * @example
 * ```typescript
 * return createJsonResponseWithDetails(summary, {
 *   checks: results.map(r => ({ name: r.name, status: r.status })),
 *   total_duration_ms: totalDuration,
 * });
 * ```
 */
export function createJsonResponseWithDetails(
  data: unknown,
  details: Record<string, unknown>,
): ToolResponse {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    details,
  };
}
