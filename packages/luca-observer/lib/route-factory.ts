import { NextResponse } from "next/server";

/**
 * Response shape configuration for createFileReaderRoute.
 *
 * Three shapes are supported:
 * - "direct": Returns the reader result directly as JSON
 * - "nullable": Wraps result as { [key]: result, has_[key]: boolean }
 * - "array": Wraps result as { [key]: result, total_count: result.length }
 *
 * Uses snake_case for API compatibility.
 */
type ResponseShape =
  | { type: "direct" }
  | { type: "nullable"; key: string }
  | { type: "array"; key: string };

/**
 * Factory that generates Next.js GET route handlers for file-based readers.
 *
 * Encapsulates the common pattern shared by 7+ API routes:
 * 1. Extract ?dir= query parameter
 * 2. Call an async reader function with the project directory
 * 3. Shape the response according to the route's convention
 * 4. Return 500 with a descriptive error key on failure
 *
 * @param reader - Async function that reads data from the filesystem
 * @param errorKey - snake_case error identifier for 500 responses
 * @param shape - Response shape configuration (direct, nullable, or array)
 * @returns A Next.js-compatible GET route handler
 *
 * @example
 * ```typescript
 * // Direct shape: returns reader result as-is
 * export const GET = createFileReaderRoute(
 *   readWorkflowState,
 *   "failed_to_read_state",
 *   { type: "direct" },
 * );
 *
 * // Nullable shape: wraps in { result, has_result }
 * export const GET = createFileReaderRoute(
 *   readHarnessResult,
 *   "failed_to_read_harness_result",
 *   { type: "nullable", key: "result" },
 * );
 *
 * // Array shape: wraps in { iterations, total_count }
 * export const GET = createFileReaderRoute(
 *   readIterationHistory,
 *   "failed_to_read_iterations",
 *   { type: "array", key: "iterations" },
 * );
 * ```
 */
export function createFileReaderRoute(
  reader: (projectDir?: string) => Promise<unknown>,
  errorKey: string,
  shape: ResponseShape,
): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    const { searchParams } = new URL(request.url);
    const projectDir = searchParams.get("dir") ?? undefined;

    try {
      const result = await reader(projectDir);

      if (shape.type === "direct") {
        return NextResponse.json(result);
      }
      if (shape.type === "nullable") {
        return NextResponse.json({
          [shape.key]: result,
          [`has_${shape.key}`]: result !== null,
        });
      }
      if (shape.type === "array") {
        const arr = Array.isArray(result) ? result : [];
        return NextResponse.json({
          [shape.key]: arr,
          total_count: arr.length,
        });
      }
      return NextResponse.json(result);
    } catch {
      return NextResponse.json({ error: errorKey }, { status: 500 });
    }
  };
}
