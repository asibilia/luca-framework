import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import type { WorkflowSnapshot } from "./types";
import { WorkflowSnapshotSchema } from "./types";

/**
 * Resolve and validate a project directory parameter.
 *
 * Prevents path traversal by ensuring the resolved path starts
 * with the current working directory. Returns cwd if no dir provided.
 *
 * @param projectDir - User-supplied directory parameter
 * @returns Validated absolute directory path
 * @throws Error if the resolved path is outside cwd
 */
function resolveProjectDir(projectDir?: string): string {
  const base = process.cwd();
  if (!projectDir) return base;

  const resolved = resolve(base, projectDir);
  if (!resolved.startsWith(base)) {
    throw new Error("Directory outside project boundary");
  }
  return resolved;
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
    const content = await readFile(statePath, "utf-8");
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
    readFile(join(planningDir, "BRAIN.md"), "utf-8").catch(() => ""),
    readFile(join(planningDir, "MEMORY.md"), "utf-8").catch(() => ""),
    readFile(join(planningDir, "WORKING.md"), "utf-8").catch(() => ""),
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
    const content = await readFile(metricsPath, "utf-8");
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return {};
  }
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
