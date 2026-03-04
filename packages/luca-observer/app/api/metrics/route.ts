import { readMetrics } from "~/lib/file-watcher";
import { createFileReaderRoute } from "~/lib/route-factory";

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
export const GET = createFileReaderRoute(
  readMetrics,
  "failed_to_read_metrics",
  { type: "direct" },
);
