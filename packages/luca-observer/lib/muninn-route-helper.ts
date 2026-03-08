/**
 * Shared helper for MuninnDB proxy route handlers.
 *
 * Extracts common boilerplate: client acquisition, error handling (502),
 * response validation, and query parameter parsing with Zod.
 */
import { NextResponse } from "next/server";
import type { z } from "zod";

import { getMuninnClient } from "~/lib/muninn-config";
import type { MuninnClient } from "~/lib/muninn-config";

/**
 * Wraps a MuninnDB client call with automatic error handling and optional
 * response validation.
 *
 * @param handler - Async function that receives the MuninnDB client and returns data.
 * @param errorMessage - Human-readable message returned as the 502 error body.
 * @param responseSchema - Optional Zod schema for lightweight response shape checking.
 *   Validation failures are logged but do NOT block the response (the raw data is
 *   still returned) to avoid breaking the UI when MuninnDB adds new fields.
 *
 * @example
 * ```typescript
 * export async function GET() {
 *   return muninnProxyHandler(
 *     (client) => client.stats("default"),
 *     "Failed to fetch stats",
 *     StatsResponseSchema,
 *   );
 * }
 * ```
 */
export async function muninnProxyHandler(
  handler: (client: MuninnClient) => Promise<unknown>,
  errorMessage: string,
  responseSchema?: z.ZodType,
): Promise<NextResponse> {
  const client = getMuninnClient();
  try {
    const data = await handler(client);
    if (responseSchema) {
      const parsed = responseSchema.safeParse(data);
      if (!parsed.success) {
        console.error(
          "[muninn-proxy] Response validation failed:",
          parsed.error.message,
        );
      }
    }
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: errorMessage }, { status: 502 });
  }
}

/**
 * Parses URL query parameters through a Zod schema, returning either
 * validated data or a 400 NextResponse with human-readable error messages.
 *
 * @param searchParams - URLSearchParams from the incoming request.
 * @param schema - Zod schema to validate/coerce query parameters.
 *
 * @example
 * ```typescript
 * const result = parseQueryParams(searchParams, EngramsQuerySchema);
 * if (!result.success) return result.response;
 * const { vault, limit, offset } = result.data;
 * ```
 */
export function parseQueryParams<T extends z.ZodType>(
  searchParams: URLSearchParams,
  schema: T,
):
  | { success: true; data: z.output<T> }
  | { success: false; response: NextResponse } {
  const raw = Object.fromEntries(searchParams.entries());
  const result = schema.safeParse(raw);
  if (!result.success) {
    return {
      success: false,
      response: NextResponse.json(
        { error: result.error.issues.map((i) => i.message).join("; ") },
        { status: 400 },
      ),
    };
  }
  return { success: true, data: result.data };
}
