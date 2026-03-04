import { NextResponse } from "next/server";

import { readLedgerEntries } from "~/lib/file-watcher";

export const dynamic = "force-dynamic";

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
 *   - tail (number, optional): Read only the last N raw lines before parsing/filtering
 *   - limit (number, optional): Cap the number of returned entries (default: 100)
 *
 * Response (200):
 *   { entries: LedgerEntry[], total_count: number }
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
      { status: 500 },
    );
  }
}
