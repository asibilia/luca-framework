import { NextResponse } from "next/server";

import { requireApiKey } from "~/lib/auth";
import { insertEvent } from "~/lib/db";
import { broadcastEvent } from "~/lib/sse";
import { ObserverEventSchema } from "~/lib/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/events -- Ingest events from Luca hooks.
 *
 * Receives a JSON event payload from Luca hook scripts (session-start,
 * pre-commit-gate, context-check, etc.), validates it against
 * ObserverEventSchema, stores it in the in-memory event store, and
 * broadcasts it to all connected SSE clients via the SSE broadcaster.
 *
 * Request body (JSON):
 *   - event_type (string, required): Event type identifier (e.g. "session.start")
 *   - session_id (string, optional): Session identifier
 *   - timestamp (string, optional): ISO 8601 timestamp (auto-generated if omitted)
 *   - payload (object, optional): Arbitrary event data
 *   - agent_name (string, optional): Name of the invoking agent
 *   - tool_name (string, optional): Name of the tool used
 *   - file_path (string, optional): Relevant file path
 *   - duration_ms (number, optional): Operation duration in milliseconds
 *   - status (string, optional): Status string
 *   - phase_id (number, optional): Current phase number
 *   - complexity (string, optional): Complexity level
 *
 * Response (200):
 *   { id: number, received: true }
 *
 * Response (400):
 *   { error: "invalid_payload", details: [...] }
 *
 * Response (500):
 *   { error: "internal_error" }
 *
 * Uses snake_case for API compatibility.
 *
 * @example
 * ```bash
 * curl -X POST http://localhost:3456/api/events \
 *   -H "Content-Type: application/json" \
 *   -d '{"event_type":"session.start","session_id":"abc-123"}'
 * ```
 */
export async function POST(request: Request) {
  const authError = requireApiKey(request);
  if (authError) return authError;

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
