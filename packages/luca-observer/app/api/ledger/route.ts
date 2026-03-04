import { NextResponse } from "next/server";

import { z } from "zod";

import { requireApiKey } from "~/lib/auth";
import { readLedgerEntries } from "~/lib/file-watcher";

export const dynamic = "force-dynamic";

/**
 * API Query: Ledger query parameters.
 *
 * Validates and coerces query string parameters for ledger filtering.
 * Uses snake_case for API compatibility.
 *
 * `event_type` accepts dot-separated lowercase alphanumeric words
 * (e.g. "session.start", "tool.use", "commit.pre") with a max length
 * of 100. This prevents injection while remaining open to arbitrary
 * user-defined event types from hook scripts.
 *
 * @example
 * ```typescript
 * const params = LedgerQueryParamsSchema.parse({
 *   tail: "20",
 *   session_id: "abc-123",
 *   event_type: "session.start",
 * });
 * // { tail: 20, session_id: "abc-123", event_type: "session.start", limit: 100 }
 * ```
 */
const LedgerQueryParamsSchema = z.object({
  dir: z.string().optional(),
  session_id: z.string().optional(),
  event_type: z
    .string()
    .regex(/^[a-z0-9_]+(?:\.[a-z0-9_]+)*$/)
    .max(100)
    .optional(),
  tail: z.coerce.number().int().min(1).max(10000).optional(),
  limit: z.coerce.number().int().min(1).max(10000).default(100),
});

/**
 * GET /api/ledger -- Read session ledger entries.
 *
 * Reads .planning/session-ledger.jsonl line by line, validates each
 * entry with LedgerEntrySchema (skipping malformed lines), and returns
 * the parsed entries with optional filtering.
 *
 * Query parameters:
 *   - dir (string, optional): Project directory path (defaults to LUCA_PROJECT_DIR or cwd)
 *   - session_id (string, optional): Filter entries by session ID
 *   - event_type (string, optional): Filter entries by event type
 *   - tail (number, optional): Read only the last N raw lines before parsing/filtering (max: 10000)
 *   - limit (number, optional): Cap the number of returned entries (default: 100, max: 10000)
 *
 * Response (200):
 *   { entries: LedgerEntry[], total_count: number }
 *
 * Response (400):
 *   { error: "invalid_query_params", details: [...] }
 *
 * Response (500):
 *   { error: "failed_to_read_ledger" }
 *
 * Uses snake_case for API compatibility.
 *
 * @example
 * ```bash
 * curl http://localhost:3456/api/ledger
 * curl "http://localhost:3456/api/ledger?tail=20&session_id=abc-123"
 * ```
 */
export async function GET(request: Request) {
  const authError = requireApiKey(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);

  const raw: Record<string, string | undefined> = {
    dir: searchParams.get("dir") ?? undefined,
    session_id: searchParams.get("session_id") ?? undefined,
    event_type: searchParams.get("event_type") ?? undefined,
  };

  // Only include numeric params if they are present in the query string
  if (searchParams.has("tail")) raw.tail = searchParams.get("tail")!;
  if (searchParams.has("limit")) raw.limit = searchParams.get("limit")!;

  const parseResult = LedgerQueryParamsSchema.safeParse(raw);

  if (!parseResult.success) {
    return NextResponse.json(
      {
        error: "invalid_query_params",
        details: parseResult.error.issues,
      },
      { status: 400 },
    );
  }

  try {
    const { dir, ...filters } = parseResult.data;
    const entries = await readLedgerEntries(dir, filters);

    return NextResponse.json({
      entries,
      total_count: entries.length,
    });
  } catch {
    return NextResponse.json(
      { error: "failed_to_read_ledger" },
      { status: 500 },
    );
  }
}
