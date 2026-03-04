import { NextResponse } from "next/server";

import { readHarnessResult } from "~/lib/file-watcher";

export const dynamic = "force-dynamic";

/**
 * GET /api/harness -- Read latest harness verification result.
 *
 * Reads .planning/harness-result.json and returns the parsed snapshot.
 * Returns null fields if no harness result exists yet.
 *
 * Uses snake_case for API compatibility.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectDir = searchParams.get("dir") ?? undefined;

  try {
    const result = await readHarnessResult(projectDir);

    return NextResponse.json({
      result,
      has_result: result !== null,
    });
  } catch {
    return NextResponse.json(
      { error: "failed_to_read_harness_result" },
      { status: 500 }
    );
  }
}
