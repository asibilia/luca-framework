import { readHarnessResult } from "~/lib/file-watcher";
import { createFileReaderRoute } from "~/lib/route-factory";

export const dynamic = "force-dynamic";

/**
 * GET /api/harness -- Read latest harness verification result.
 *
 * Reads .planning/harness-result.json and validates it with
 * HarnessResultSnapshotSchema. Returns the parsed result including
 * overall status, per-check results (test, typecheck, lint, build),
 * parsed errors with file/line details, and timing data.
 * Returns null if the file does not exist or is invalid.
 *
 * Query parameters:
 *   - dir (string, optional): Project directory path (defaults to LUCA_PROJECT_DIR or cwd)
 *
 * Response (200):
 *   { result: HarnessResultSnapshot | null, has_result: boolean }
 *
 *   Where HarnessResultSnapshot contains:
 *   { status: "passed"|"failed", checks: CheckResultSnapshot[],
 *     total_errors: number, total_warnings: number,
 *     duration: number, timestamp: string }
 *
 * Response (500):
 *   { error: "failed_to_read_harness_result" }
 *
 * Uses snake_case for API compatibility.
 *
 * @example
 * ```bash
 * curl http://localhost:3456/api/harness
 * ```
 */
export const GET = createFileReaderRoute(
  readHarnessResult,
  "failed_to_read_harness_result",
  { type: "nullable", key: "result" },
  { requireAuth: true },
);
