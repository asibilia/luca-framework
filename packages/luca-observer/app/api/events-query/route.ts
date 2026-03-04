import { NextResponse } from "next/server";

import { queryEvents, getEventCount } from "~/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/events-query -- Query stored events with filters.
 *
 * Returns events from the in-memory event store, with optional filtering
 * and pagination. Events are returned newest-first.
 *
 * Query parameters:
 *   - session_id (string, optional): Filter events by session ID
 *   - event_type (string, optional): Filter events by type (e.g. "session.start")
 *   - limit (number, optional): Maximum number of results (default: 50)
 *   - offset (number, optional): Pagination offset (default: 0)
 *   - since_id (number, optional): Only return events with ID greater than this value
 *
 * Response (200):
 *   { events: StoredEvent[], total_count: number, limit: number, offset: number }
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
  const { searchParams } = new URL(request.url);

  try {
    const filters = {
      session_id: searchParams.get("session_id") ?? undefined,
      event_type: searchParams.get("event_type") ?? undefined,
      limit: parseInt(searchParams.get("limit") ?? "50", 10),
      offset: parseInt(searchParams.get("offset") ?? "0", 10),
      since_id: searchParams.has("since_id")
        ? parseInt(searchParams.get("since_id")!, 10)
        : undefined,
    };

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
