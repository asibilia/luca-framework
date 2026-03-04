import { NextResponse } from "next/server";

import { z } from "zod";

import { requireApiKey } from "~/lib/auth";
import { queryEvents, getEventCount } from "~/lib/db";
import { sanitizeZodIssues } from "~/lib/sanitize-zod";

export const dynamic = "force-dynamic";

/**
 * API Query: Event query parameters.
 *
 * Validates and coerces query string parameters for event filtering.
 * Uses snake_case for API compatibility.
 *
 * `event_type` accepts dot-separated lowercase alphanumeric words
 * (e.g. "session.start", "tool.use", "commit.pre") with a max length
 * of 100. This prevents injection while remaining open to arbitrary
 * user-defined event types from hook scripts.
 *
 * @example
 * ```typescript
 * const params = EventQueryParamsSchema.parse({
 *   limit: "10",
 *   event_type: "session.start",
 * });
 * // { limit: 10, offset: 0, event_type: "session.start" }
 * ```
 */
const EventQueryParamsSchema = z.object({
  session_id: z.string().optional(),
  event_type: z
    .string()
    .regex(/^[a-z0-9_]+(?:\.[a-z0-9_]+)*$/)
    .max(100)
    .optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(50),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
  since_id: z.coerce.number().int().min(0).optional(),
});

/**
 * GET /api/events-query -- Query stored events with filters.
 *
 * Returns events from the in-memory event store, with optional filtering
 * and pagination. Events are returned newest-first.
 *
 * Query parameters:
 *   - session_id (string, optional): Filter events by session ID
 *   - event_type (string, optional): Filter events by type (e.g. "session.start")
 *   - limit (number, optional): Maximum number of results (default: 50, max: 1000)
 *   - offset (number, optional): Pagination offset (default: 0, max: 100000)
 *   - since_id (number, optional): Only return events with ID greater than this value
 *
 * Response (200):
 *   { events: StoredEvent[], total_count: number, limit: number, offset: number }
 *
 * Response (400):
 *   { error: "invalid_query_params", details: [...] }
 *
 * Response (500):
 *   { error: "failed_to_query_events" }
 *
 * Uses snake_case for API compatibility.
 *
 * @example
 * ```bash
 * curl "http://localhost:3456/api/events-query?limit=10&event_type=session.start"
 * ```
 */
export async function GET(request: Request) {
  const authError = requireApiKey(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);

  const raw: Record<string, string | undefined> = {
    session_id: searchParams.get("session_id") ?? undefined,
    event_type: searchParams.get("event_type") ?? undefined,
  };

  // Only include numeric params if they are present in the query string
  if (searchParams.has("limit")) raw.limit = searchParams.get("limit")!;
  if (searchParams.has("offset")) raw.offset = searchParams.get("offset")!;
  if (searchParams.has("since_id"))
    raw.since_id = searchParams.get("since_id")!;

  const parseResult = EventQueryParamsSchema.safeParse(raw);

  if (!parseResult.success) {
    return NextResponse.json(
      {
        error: "invalid_query_params",
        details: sanitizeZodIssues(parseResult.error.issues),
      },
      { status: 400 },
    );
  }

  try {
    const filters = parseResult.data;
    const events = queryEvents(filters);
    const total_count = getEventCount();

    return NextResponse.json({
      events,
      total_count,
      limit: filters.limit,
      offset: filters.offset,
    });
  } catch {
    return NextResponse.json(
      { error: "failed_to_query_events" },
      { status: 500 },
    );
  }
}
