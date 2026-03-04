import { NextResponse } from "next/server";

import { insertEvent } from "~/lib/db";
import { broadcastEvent } from "~/lib/sse";
import { ObserverEventSchema } from "~/lib/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/events — Ingest events from Luca hooks.
 *
 * Validates the incoming payload with Zod, stores in the event store,
 * and broadcasts to all connected SSE clients.
 *
 * Uses snake_case for API compatibility.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parseResult = ObserverEventSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: "invalid_payload",
          details: parseResult.error.issues,
        },
        { status: 400 },
      );
    }

    const stored = insertEvent(parseResult.data);
    broadcastEvent(stored);

    return NextResponse.json({
      id: stored.id,
      received: true,
    });
  } catch {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
