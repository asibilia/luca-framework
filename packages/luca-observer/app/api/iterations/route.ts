import { NextResponse } from "next/server";

import { readIterationHistory } from "~/lib/file-watcher";

export const dynamic = "force-dynamic";

/**
 * GET /api/iterations -- Read iteration checkpoint history.
 *
 * Reads .planning/checkpoints/*.json and returns parsed iteration
 * records sorted by iteration number.
 *
 * Uses snake_case for API compatibility.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectDir = searchParams.get("dir") ?? undefined;

  try {
    const iterations = await readIterationHistory(projectDir);

    return NextResponse.json({
      iterations,
      total_count: iterations.length,
    });
  } catch {
    return NextResponse.json(
      { error: "failed_to_read_iterations" },
      { status: 500 },
    );
  }
}
