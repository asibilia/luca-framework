import { access, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { NextResponse } from "next/server";
import { z } from "zod";

import { ZoneHistoryResponseSchema } from "~/lib/muninn-schemas";

/**
 * Minimal schema for the context-metrics snapshot file.
 * Validates the raw JSON before field access to prevent type confusion.
 */
const ContextMetricsSchema = z.object({
  zone: z.string().optional(),
  usage_percent: z.number().optional(),
  checked_at: z.string().optional(),
});

/**
 * Walk up from startDir looking for a directory containing `.planning/`.
 * Returns the first match, or null if none found.
 */
async function findProjectRoot(startDir: string): Promise<string | null> {
  let current = resolve(startDir);
  const root = resolve("/");
  while (current !== root) {
    try {
      await access(join(current, ".planning"));
      return current;
    } catch {
      /* not found at this level, keep walking up */
    }
    current = resolve(current, "..");
  }
  return null;
}

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
 *
 * Workspace root resolution: LUCA_PROJECT_DIR > WORKSPACE_ROOT > findProjectRoot(cwd)
 */
export async function GET() {
  const emptyResponse = { entries: [], total: 0 };

  try {
    const rawRoot = process.env.LUCA_PROJECT_DIR || process.env.WORKSPACE_ROOT;
    const explicitRoot = rawRoot ? resolve(rawRoot) : null;
    const workspaceRoot =
      explicitRoot || (await findProjectRoot(process.cwd())) || process.cwd();
    const filePath = join(workspaceRoot, ".planning", ".context-metrics.json");

    const raw = await readFile(filePath, "utf-8");
    const rawParsed = JSON.parse(raw);

    // Validate the raw metrics with Zod before field access
    const metricsResult = ContextMetricsSchema.safeParse(rawParsed);
    if (!metricsResult.success) {
      console.error(
        "[zone-history] Metrics validation failed:",
        metricsResult.error.message,
      );
      return NextResponse.json(emptyResponse);
    }

    // The file is a single snapshot object, not an array
    const entry = {
      zone: metricsResult.data.zone,
      usage_percent: metricsResult.data.usage_percent,
      checked_at: metricsResult.data.checked_at,
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
