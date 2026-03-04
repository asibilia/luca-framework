import { readWorkflowState } from "~/lib/file-watcher";
import { createFileReaderRoute } from "~/lib/route-factory";

export const dynamic = "force-dynamic";

/**
 * GET /api/state -- Read current workflow state.
 *
 * Reads .planning/STATE.md from the target project's filesystem and
 * parses it into a structured WorkflowSnapshot. Extracts key-value
 * fields (workflow_state, current_phase, complexity, branch, etc.)
 * from the markdown format. Returns schema defaults if the file is
 * missing or unreadable.
 *
 * Query parameters:
 *   - dir (string, optional): Project directory path (defaults to LUCA_PROJECT_DIR or cwd)
 *
 * Response (200):
 *   { workflow_state: string, current_phase: number, current_plan: string,
 *     complexity: string, oversight: string, ticket_id: string,
 *     branch: string, session_id: string, errors: string[] }
 *
 * Response (500):
 *   { error: "failed_to_read_state" }
 *
 * Uses snake_case for API compatibility.
 *
 * @example
 * ```bash
 * curl http://localhost:3456/api/state
 * curl "http://localhost:3456/api/state?dir=/path/to/project"
 * ```
 */
export const GET = createFileReaderRoute(
  readWorkflowState,
  "failed_to_read_state",
  { type: "direct" },
  { requireAuth: true },
);
