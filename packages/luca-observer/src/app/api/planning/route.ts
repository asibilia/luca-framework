import { NextResponse } from "next/server";

import { readSessionPlan } from "~/lib/file-watcher";

export const dynamic = "force-dynamic";

/**
 * GET /api/planning -- Read current session plan with WSJF scores.
 *
 * Reads .planning/session-plan.json and returns the parsed plan.
 * Returns null fields if no session plan exists yet.
 *
 * Uses snake_case for API compatibility.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectDir = searchParams.get("dir") ?? undefined;

  try {
    const plan = await readSessionPlan(projectDir);

    return NextResponse.json({
      plan,
      has_plan: plan !== null,
    });
  } catch {
    return NextResponse.json(
      { error: "failed_to_read_planning" },
      { status: 500 },
    );
  }
}
