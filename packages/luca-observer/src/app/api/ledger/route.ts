import { NextResponse } from "next/server";

import { readLedgerEntries } from "~/lib/file-watcher";

export const dynamic = "force-dynamic";

/**
 * GET /api/ledger -- Read session ledger entries.
 *
 * Reads .planning/session-ledger.jsonl and returns parsed entries.
 * Supports query parameters:
 * - session_id: Filter by session ID
 * - event_type: Filter by event type
 * - tail: Read only the last N raw lines before parsing
 * - limit: Cap the number of returned entries
 *
 * Uses snake_case for API compatibility.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectDir = searchParams.get("dir") ?? undefined;

  try {
    const filters = {
      session_id: searchParams.get("session_id") ?? undefined,
      event_type: searchParams.get("event_type") ?? undefined,
      tail: searchParams.has("tail")
        ? parseInt(searchParams.get("tail")!, 10)
        : undefined,
      limit: searchParams.has("limit")
        ? parseInt(searchParams.get("limit")!, 10)
        : 100,
    };

    const entries = await readLedgerEntries(projectDir, filters);

    return NextResponse.json({
      entries,
      total_count: entries.length,
    });
  } catch {
    return NextResponse.json(
      { error: "failed_to_read_ledger" },
      { status: 500 }
    );
  }
}
