import { readIterationHistory } from "~/lib/file-watcher";
import { createFileReaderRoute } from "~/lib/route-factory";

export const dynamic = "force-dynamic";

/**
 * GET /api/iterations -- Read iteration checkpoint history.
 *
 * Reads all JSON files from .planning/checkpoints/, validates each
 * with IterationRecordSnapshotSchema (skipping invalid files), and
 * returns them sorted by iteration number ascending. Each record
 * contains error counts, convergence status, error classification
 * breakdown, and timing data.
 *
 * Query parameters:
 *   - dir (string, optional): Project directory path (defaults to LUCA_PROJECT_DIR or cwd)
 *
 * Response (200):
 *   { iterations: IterationRecordSnapshot[], total_count: number }
 *
 *   Where each IterationRecordSnapshot contains:
 *   { tag: string, phase: number, loop: "harness"|"verify",
 *     iteration: number, error_count: number, error_delta: number,
 *     convergence_status: "improved"|"stalled"|"regressed",
 *     permanent_errors: string[], correctable_errors: string[],
 *     transient_errors: string[], duration_ms: number, timestamp: string }
 *
 * Response (500):
 *   { error: "failed_to_read_iterations" }
 *
 * Uses snake_case for API compatibility.
 *
 * @example
 * ```bash
 * curl http://localhost:3456/api/iterations
 * ```
 */
export const GET = createFileReaderRoute(
  readIterationHistory,
  "failed_to_read_iterations",
  { type: "array", key: "iterations" },
);
