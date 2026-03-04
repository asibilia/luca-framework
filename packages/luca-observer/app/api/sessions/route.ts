import { NextResponse } from "next/server";

import { getSessions } from "~/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/sessions -- List all tracked sessions.
 *
 * Returns all sessions from the in-memory store, sorted newest first.
 * Sessions are created automatically when a "session.start" event is
 * ingested and updated when "session.end" events arrive. Each session
 * record includes the session ID, start/end timestamps, status,
 * complexity level, and total event count.
 *
 * Response (200):
 *   { sessions: SessionRecord[] }
 *
 *   Where each SessionRecord contains:
 *   { id: string, started_at: string, ended_at?: string,
 *     ticket_id?: string, branch?: string, complexity?: string,
 *     status: string, total_events: number, metadata: object }
 *
 * Response (500):
 *   { error: "failed_to_read_sessions" }
 *
 * Uses snake_case for API compatibility.
 *
 * @example
 * ```bash
 * curl http://localhost:3456/api/sessions
 * ```
 */
export async function GET() {
  try {
    const sessions = getSessions();
    return NextResponse.json({ sessions });
  } catch {
    return NextResponse.json(
      { error: "failed_to_read_sessions" },
      { status: 500 },
    );
  }
}
