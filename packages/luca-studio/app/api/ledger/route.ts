/**
 * GET /api/ledger -- Read `.planning/session-ledger.jsonl` and return entries.
 *
 * Serves session ledger entries for the Studio frontend session views.
 * Missing ledger files return `[]` with 200 (not 500).
 *
 * Query parameters:
 * - `limit` (number, 1-500, default 50): Maximum entries to return.
 *
 * Returns the **last N** entries in most-recent-first order.
 */
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";

import filter from "lodash/filter";
import { NextResponse } from "next/server";
import { z } from "zod";

import { parseQueryParams } from "~/lib/muninn-route-helper";
import { resolveProjectRoot } from "~/lib/project-root";
import { safeJsonParse } from "~/lib/safe-json-parse";

/**
 * GET /api/ledger -- query parameters.
 *
 * Uses z.coerce for URLSearchParams string coercion.
 */
const LedgerQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(50),
});

/**
 * Parse a JSONL string into an array of objects.
 *
 * Splits by newline, filters blank lines, and JSON.parse each remaining line.
 * Unparseable lines are silently dropped.
 *
 * @param raw - Raw JSONL file contents.
 * @returns Array of parsed JSON objects.
 */
function parseJsonl(raw: string): unknown[] {
  const lines = raw.split("\n");
  const nonEmpty = filter(lines, (line: string) => line.trim().length > 0);
  const parsed: unknown[] = [];

  for (const line of nonEmpty) {
    const entry = safeJsonParse<unknown>(line, null);
    if (entry !== null) {
      parsed.push(entry);
    }
  }

  return parsed;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const result = parseQueryParams(searchParams, LedgerQuerySchema);
  if (!result.success) return result.response;

  const { limit } = result.data;

  try {
    const root = await resolveProjectRoot();
    const ledgerPath = join(root, ".planning", "session-ledger.jsonl");
    const exists = await access(ledgerPath).then(
      () => true,
      () => false,
    );

    if (!exists) {
      return NextResponse.json([]);
    }

    const raw = await readFile(ledgerPath, "utf-8");
    const allEntries = parseJsonl(raw);

    // Take the last N entries, then reverse for most-recent-first order
    const tail = allEntries.slice(-limit);
    tail.reverse();

    return NextResponse.json(tail);
  } catch {
    // Graceful degradation -- return empty array on any unexpected error
    return NextResponse.json([]);
  }
}
