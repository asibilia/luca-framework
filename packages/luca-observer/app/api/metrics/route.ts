import { NextResponse } from "next/server";

import { readMetrics } from "~/lib/file-watcher";

export const dynamic = "force-dynamic";

/**
 * GET /api/metrics -- Read aggregated session metrics.
 *
 * Returns the parsed contents of .planning/metrics.json. The metrics
 * file contains aggregated session data such as token usage, duration,
 * iteration counts, and other workflow telemetry. Returns an empty
 * object if the file does not exist or is invalid.
 *
 * Query parameters:
 *   - dir (string, optional): Project directory path (defaults to LUCA_PROJECT_DIR or cwd)
 *
 * Response (200):
 *   Record<string, unknown> (structure depends on metrics content)
 *
 * Response (500):
 *   { error: "failed_to_read_metrics" }
 *
 * Uses snake_case for API compatibility.
 *
 * @example
 * ```bash
 * curl http://localhost:3456/api/metrics
 * ```
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectDir = searchParams.get("dir") ?? undefined;

  try {
    const metrics = await readMetrics(projectDir);
    return NextResponse.json(metrics);
  } catch {
    return NextResponse.json(
      { error: "failed_to_read_metrics" },
      { status: 500 },
    );
  }
}
