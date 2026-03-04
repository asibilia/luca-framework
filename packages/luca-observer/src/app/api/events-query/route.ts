import { NextResponse } from "next/server";

import { queryEvents, getEventCount } from "~/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/events-query — Query stored events with filters.
 *
 * Supports query parameters:
 * - session_id: Filter by session
 * - event_type: Filter by event type
 * - limit: Max results (default 50)
 * - offset: Pagination offset
 * - since_id: Only events after this ID
 *
 * Uses snake_case for API compatibility.
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
      { status: 500 }
    );
  }
}
