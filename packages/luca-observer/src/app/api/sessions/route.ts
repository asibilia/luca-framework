import { NextResponse } from "next/server";

import { getSessions } from "~/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/sessions — List all sessions.
 *
 * Returns sessions from the in-memory store, newest first.
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
