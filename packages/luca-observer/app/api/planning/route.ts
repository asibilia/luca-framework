import { NextResponse } from "next/server";

import { readSessionPlan } from "~/lib/file-watcher";

export const dynamic = "force-dynamic";

/**
 * GET /api/planning -- Read current session plan with WSJF scores.
 *
 * Reads .planning/session-plan.json and validates it with
 * SessionPlanSnapshotSchema. Returns the plan including WSJF-scored
 * items with complexity, quality zone assignments, the big rock
 * index, session capacity, and planning rationale. Returns null
 * if the file does not exist or is invalid.
 *
 * Query parameters:
 *   - dir (string, optional): Project directory path (defaults to LUCA_PROJECT_DIR or cwd)
 *
 * Response (200):
 *   { plan: SessionPlanSnapshot | null, has_plan: boolean }
 *
 *   Where SessionPlanSnapshot contains:
 *   { generated_at: string, session_cap_minutes: number,
 *     total_effort_points: number, items: WSJFScoredItemSnapshot[],
 *     big_rock_index?: number, rationale: string }
 *
 * Response (500):
 *   { error: "failed_to_read_planning" }
 *
 * Uses snake_case for API compatibility.
 *
 * @example
 * ```bash
 * curl http://localhost:3456/api/planning
 * ```
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
