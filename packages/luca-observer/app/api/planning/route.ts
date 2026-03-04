import { readSessionPlan } from "~/lib/file-watcher";
import { createFileReaderRoute } from "~/lib/route-factory";

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
export const GET = createFileReaderRoute(
  readSessionPlan,
  "failed_to_read_planning",
  { type: "nullable", key: "plan" },
);
