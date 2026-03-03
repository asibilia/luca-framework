import type { z } from "zod";

/**
 * Parse a value with a Zod schema, throwing a descriptive error on failure.
 *
 * Replaces the repeated safeParse -> check -> throw pattern with a single
 * call that either returns validated data or throws with a labeled message.
 *
 * @param schema - Zod schema to parse against
 * @param value - Value to parse
 * @param label - Human-readable label for error messages
 * @returns The parsed and validated value
 * @throws Error with descriptive message if parsing fails
 *
 * @example
 * ```typescript
 * const entry = safeParseOrThrow(
 *   iterationMetricsSchema,
 *   rawEntry,
 *   "[metrics-collector] Invalid iteration_metrics entry",
 * );
 * ```
 */
export function safeParseOrThrow<T>(
  schema: z.ZodType<T>,
  value: unknown,
  label: string,
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`${label}: ${parsed.error.message}`);
  }
  return parsed.data;
}
