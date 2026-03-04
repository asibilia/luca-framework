import { NextResponse } from "next/server";

import { readTribunalResult } from "~/lib/file-watcher";

export const dynamic = "force-dynamic";

/**
 * GET /api/tribunal -- Read latest tribunal/debate result.
 *
 * Reads .planning/tribunal-result.json and returns the parsed result.
 * Returns null fields if no tribunal result exists yet.
 *
 * Uses snake_case for API compatibility.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectDir = searchParams.get("dir") ?? undefined;

  try {
    const result = await readTribunalResult(projectDir);

    return NextResponse.json({
      result,
      has_result: result !== null,
    });
  } catch {
    return NextResponse.json(
      { error: "failed_to_read_tribunal" },
      { status: 500 },
    );
  }
}
