import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { NextResponse } from "next/server";

import { ZoneHistoryResponseSchema } from "~/lib/muninn-schemas";

/**
 * GET /api/muninn/zone-history
 *
 * Reads .planning/.context-metrics.json for zone transition data.
 * This is NOT a MuninnDB proxy — it reads a local file written by
 * the context-monitor hook.
 *
 * The context-metrics file is a single snapshot (overwritten each check).
 * Returns the current entry as a single-element array for the timeline view.
 *
 * Returns 200 with empty entries array when file is missing.
 */
export async function GET() {
  const emptyResponse = { entries: [], total: 0 };

  try {
    const filePath = join(
      process.cwd(),
      ".planning",
      ".context-metrics.json",
    );
    const raw = await readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    // The file is a single snapshot object, not an array
    const entry = {
      zone: parsed.zone as string | undefined,
      usage_percent: parsed.usage_percent as number | undefined,
      checked_at: parsed.checked_at as string | undefined,
    };

    // Only include entry if it has meaningful data
    if (!entry.zone && entry.usage_percent === undefined) {
      return NextResponse.json(emptyResponse);
    }

    const response = {
      entries: [entry],
      total: 1,
    };

    const result = ZoneHistoryResponseSchema.safeParse(response);
    if (!result.success) {
      console.error(
        "[zone-history] Response validation failed:",
        result.error.message,
      );
      return NextResponse.json(emptyResponse);
    }

    return NextResponse.json(result.data);
  } catch {
    // File missing or unreadable — return empty entries
    return NextResponse.json(emptyResponse);
  }
}
