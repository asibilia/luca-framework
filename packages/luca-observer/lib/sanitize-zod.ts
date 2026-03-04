import type { ZodIssue } from "zod";

/**
 * Sanitize Zod validation issues for client consumption.
 *
 * Strips internal Zod metadata (`code`, `unionErrors`, `validation`,
 * `inclusive`, etc.) from 400 validation error responses. Clients only
 * need a human-readable message and the field path — not raw schema
 * internals that could leak implementation details.
 *
 * @param issues - Raw Zod issue array from `parseResult.error.issues`
 * @returns Sanitized array of `{ field, message }` objects
 *
 * @example
 * ```typescript
 * const parseResult = MySchema.safeParse(body);
 * if (!parseResult.success) {
 *   return NextResponse.json(
 *     { error: "invalid_payload", details: sanitizeZodIssues(parseResult.error.issues) },
 *     { status: 400 },
 *   );
 * }
 * ```
 */
export function sanitizeZodIssues(
  issues: ZodIssue[],
): { field: string; message: string }[] {
  return issues.map((issue) => ({
    field: issue.path.join(".") || "root",
    message: issue.message,
  }));
}
