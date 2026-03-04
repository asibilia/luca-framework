import { join } from "node:path";

import orderBy from "lodash/orderBy";
import type { z, ZodTypeDef } from "zod";

import type {
  WorkflowSnapshot,
  LedgerEntry,
  HarnessResultSnapshot,
  IterationRecordSnapshot,
  SessionPlanSnapshot,
  TribunalResultSnapshot,
} from "./types";
import {
  WorkflowSnapshotSchema,
  LedgerEntrySchema,
  HarnessResultSnapshotSchema,
  IterationRecordSnapshotSchema,
  SessionPlanSnapshotSchema,
  TribunalResultSnapshotSchema,
} from "./types";
import { resolveProjectDir } from "./resolve-project-dir";

/**
 * Read, parse, and validate a JSON snapshot from .planning/.
 *
 * Encapsulates the common pattern of reading a JSON file from the
 * planning directory, parsing it, and validating with a Zod schema.
 * Returns null if the file does not exist, contains invalid JSON,
 * or fails schema validation.
 *
 * @param filename - The filename relative to .planning/ (e.g. "harness-result.json")
 * @param schema - Zod schema to validate the parsed JSON
 * @param projectDir - The root project directory (defaults to cwd)
 * @returns Parsed and validated data, or null on any failure
 *
 * @example
 * ```typescript
 * const result = await readJsonSnapshot(
 *   "harness-result.json",
 *   HarnessResultSnapshotSchema,
 * );
 * ```
 */
async function readJsonSnapshot<T>(
  filename: string,
  schema: z.ZodType<T, ZodTypeDef, unknown>,
  projectDir?: string,
): Promise<T | null> {
  const dir = resolveProjectDir(projectDir);
  const filePath = join(dir, ".planning", filename);
  try {
    const content = await Bun.file(filePath).text();
    const parsed = schema.safeParse(JSON.parse(content));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Read workflow state from .planning/STATE.md.
 *
 * Parses the markdown format used by Luca's state bridge to extract
 * key workflow fields. Falls back to defaults for missing fields.
 *
 * @param projectDir - The root project directory (defaults to cwd)
 * @returns Parsed workflow snapshot
 */
export async function readWorkflowState(
  projectDir?: string,
): Promise<WorkflowSnapshot> {
  const dir = resolveProjectDir(projectDir);
  const statePath = join(dir, ".planning", "STATE.md");

  try {
    const content = await Bun.file(statePath).text();
    return parseStateMd(content);
  } catch {
    return WorkflowSnapshotSchema.parse({});
  }
}

/**
 * Read memory files from .planning/.
 *
 * @param projectDir - The root project directory
 * @returns Object with brain, memory, and working content strings
 */
export async function readMemoryFiles(projectDir?: string): Promise<{
  brain: string;
  memory: string;
  working: string;
}> {
  const dir = resolveProjectDir(projectDir);
  const planningDir = join(dir, ".planning");

  const [brain, memory, working] = await Promise.all([
    Bun.file(join(planningDir, "BRAIN.md"))
      .text()
      .catch(() => ""),
    Bun.file(join(planningDir, "MEMORY.md"))
      .text()
      .catch(() => ""),
    Bun.file(join(planningDir, "WORKING.md"))
      .text()
      .catch(() => ""),
  ]);

  return { brain, memory, working };
}

/**
 * Read metrics.json from .planning/.
 *
 * @param projectDir - The root project directory
 * @returns Parsed metrics JSON or empty object
 */
export async function readMetrics(
  projectDir?: string,
): Promise<Record<string, unknown>> {
  const dir = resolveProjectDir(projectDir);
  const metricsPath = join(dir, ".planning", "metrics.json");

  try {
    const content = await Bun.file(metricsPath).text();
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Read and parse entries from .planning/session-ledger.jsonl.
 *
 * Reads the JSONL file, validates each line with safeParse (skipping
 * corrupted entries), and applies optional filters.
 *
 * @param projectDir - The root project directory (defaults to cwd)
 * @param filters - Optional filter criteria
 * @returns Array of validated LedgerEntry objects
 *
 * @example
 * ```typescript
 * // Read all entries
 * const all = await readLedgerEntries();
 *
 * // Read last 10 entries for a specific session
 * const recent = await readLedgerEntries(undefined, {
 *   tail: 10,
 *   session_id: "abc-123",
 * });
 * ```
 */
export async function readLedgerEntries(
  projectDir?: string,
  filters?: {
    session_id?: string;
    event_type?: string;
    tail?: number;
    limit?: number;
  },
): Promise<LedgerEntry[]> {
  const dir = resolveProjectDir(projectDir);
  const ledgerPath = join(dir, ".planning", "session-ledger.jsonl");

  try {
    const content = await Bun.file(ledgerPath).text();
    let lines = content.trim().split("\n").filter(Boolean);

    if (filters?.tail && filters.tail > 0) {
      lines = lines.slice(-filters.tail);
    }

    const entries: LedgerEntry[] = [];
    for (const line of lines) {
      try {
        const parsed = LedgerEntrySchema.safeParse(JSON.parse(line));
        if (parsed.success) {
          entries.push(parsed.data);
        }
      } catch {
        // Skip malformed JSON lines
      }
    }

    let filtered = entries;

    if (filters?.session_id) {
      filtered = filtered.filter((e) => e.session_id === filters.session_id);
    }
    if (filters?.event_type) {
      filtered = filtered.filter((e) => e.event_type === filters.event_type);
    }
    if (filters?.limit && filters.limit > 0) {
      filtered = filtered.slice(0, filters.limit);
    }

    return filtered;
  } catch {
    return [];
  }
}

/**
 * Read the latest harness result from .planning/harness-result.json.
 *
 * Validates the file contents with safeParse and returns null if
 * the file does not exist, is empty, or contains invalid JSON.
 *
 * @param projectDir - The root project directory (defaults to cwd)
 * @returns Parsed HarnessResultSnapshot or null if file does not exist
 *
 * @example
 * ```typescript
 * const result = await readHarnessResult();
 * if (result) {
 *   console.log(`Harness ${result.status}: ${result.total_errors} errors`);
 * }
 * ```
 */
export async function readHarnessResult(
  projectDir?: string,
): Promise<HarnessResultSnapshot | null> {
  return readJsonSnapshot(
    "harness-result.json",
    HarnessResultSnapshotSchema,
    projectDir,
  );
}

/**
 * Read iteration checkpoint files from .planning/checkpoints/.
 *
 * Reads all JSON files in the checkpoints directory, validates each
 * with safeParse, and returns them sorted by iteration number.
 *
 * @param projectDir - The root project directory (defaults to cwd)
 * @returns Array of validated IterationRecordSnapshot objects
 *
 * @example
 * ```typescript
 * const history = await readIterationHistory();
 * console.log(`${history.length} iteration checkpoints found`);
 * ```
 */
export async function readIterationHistory(
  projectDir?: string,
): Promise<IterationRecordSnapshot[]> {
  const dir = resolveProjectDir(projectDir);
  const checkpointsDir = join(dir, ".planning", "checkpoints");

  try {
    const glob = new Bun.Glob("*.json");
    const records: IterationRecordSnapshot[] = [];

    for await (const file of glob.scan({ cwd: checkpointsDir })) {
      try {
        const content = await Bun.file(join(checkpointsDir, file)).text();
        const parsed = IterationRecordSnapshotSchema.safeParse(
          JSON.parse(content),
        );
        if (parsed.success) {
          records.push(parsed.data);
        }
      } catch {
        // Skip malformed checkpoint files
      }
    }

    // Sort by iteration number ascending
    return orderBy(records, "iteration", "asc");
  } catch {
    return [];
  }
}

/**
 * Read the current session plan from .planning/session-plan.json.
 *
 * @param projectDir - The root project directory (defaults to cwd)
 * @returns Parsed SessionPlanSnapshot or null if file does not exist
 *
 * @example
 * ```typescript
 * const plan = await readSessionPlan();
 * if (plan) {
 *   console.log(`Plan has ${plan.items.length} items`);
 * }
 * ```
 */
export async function readSessionPlan(
  projectDir?: string,
): Promise<SessionPlanSnapshot | null> {
  return readJsonSnapshot(
    "session-plan.json",
    SessionPlanSnapshotSchema,
    projectDir,
  );
}

/**
 * Read the latest tribunal result from .planning/tribunal-result.json.
 *
 * @param projectDir - The root project directory (defaults to cwd)
 * @returns Parsed TribunalResultSnapshot or null if file does not exist
 *
 * @example
 * ```typescript
 * const result = await readTribunalResult();
 * if (result) {
 *   console.log(`Tribunal: ${result.total_findings} findings`);
 * }
 * ```
 */
export async function readTribunalResult(
  projectDir?: string,
): Promise<TribunalResultSnapshot | null> {
  return readJsonSnapshot(
    "tribunal-result.json",
    TribunalResultSnapshotSchema,
    projectDir,
  );
}

/**
 * Parse STATE.md content into a WorkflowSnapshot.
 *
 * Extracts values from markdown key-value lines like:
 * `**Workflow State:** executing`
 */
function parseStateMd(content: string): WorkflowSnapshot {
  const extract = (key: string): string => {
    const regex = new RegExp(`\\*\\*${key}:\\*\\*\\s*(.+)`, "i");
    const match = content.match(regex);
    return match?.[1]?.trim() ?? "";
  };

  const extractNumber = (key: string): number => {
    const val = extract(key);
    const num = parseInt(val, 10);
    return isNaN(num) ? 0 : num;
  };

  return WorkflowSnapshotSchema.parse({
    workflow_state: extract("Workflow State") || "idle",
    current_phase: extractNumber("Current Phase"),
    current_plan: extract("Current Plan"),
    complexity: extract("Task Complexity") || "MODERATE",
    oversight: extract("Oversight Level") || "milestone",
    ticket_id: extract("Ticket"),
    branch: extract("Branch"),
    session_id: extract("Session ID"),
  });
}
