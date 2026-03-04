import { NextResponse } from "next/server";

import { readMetrics } from "~/lib/file-watcher";

export const dynamic = "force-dynamic";

/**
 * GET /api/metrics — Read metrics.json contents.
 *
 * Returns the parsed contents of .planning/metrics.json.
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
      { status: 500 }
    );
  }
}
