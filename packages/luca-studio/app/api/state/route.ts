/**
 * GET /api/state -- Read `.planning/state.json` and return parsed JSON,
 * enriched with derived fields from `luca-bridge read-status`.
 *
 * Serves the Luca workflow state for the Studio frontend state inspector.
 * Missing state files return `{}` with 200 (not 500).
 *
 * Derived fields merged into `context` when the bridge is available:
 * - `current_phase` — active phase number (null if none)
 * - `current_milestone` — active milestone label (null if none)
 */
import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { NextResponse } from "next/server";

import { resolveProjectRoot } from "~/lib/project-root";
import { safeJsonParse } from "~/lib/safe-json-parse";

const execAsync = promisify(execFile);

/**
 * Attempt to enrich parsed state with derived fields from `luca-bridge read-status`.
 *
 * Merges `current_phase` and `current_milestone` into the `context` sub-object.
 * Silently no-ops if the bridge is unavailable or returns invalid output.
 *
 * @param parsed - The raw parsed state.json object (mutated in place)
 * @param root - The project root directory, used as cwd for luca-bridge
 */
async function enrichWithBridge(
  parsed: Record<string, unknown>,
  root: string,
): Promise<void> {
  try {
    const { stdout } = await execAsync("luca-bridge", ["read-status"], {
      timeout: 5000,
      cwd: root,
    });
    const bridge = safeJsonParse(stdout.trim(), null) as Record<
      string,
      unknown
    > | null;
    if (!bridge) return;

    if (parsed.context && typeof parsed.context === "object") {
      const ctx = parsed.context as Record<string, unknown>;
      ctx.current_phase = bridge.current_phase ?? null;
      ctx.current_milestone = bridge.current_milestone ?? null;
    } else if (
      bridge.current_phase != null ||
      bridge.current_milestone != null
    ) {
      parsed.context = {
        current_phase: bridge.current_phase ?? null,
        current_milestone: bridge.current_milestone ?? null,
      };
    }
  } catch {
    // Bridge unavailable — graceful degradation, use raw state.json as-is
  }
}

export async function GET() {
  try {
    const root = await resolveProjectRoot();
    const statePath = join(root, ".planning", "state.json");
    const exists = await access(statePath).then(
      () => true,
      () => false,
    );

    if (!exists) {
      return NextResponse.json({});
    }

    const raw = await readFile(statePath, "utf-8");
    const parsed = safeJsonParse(raw, {}) as Record<string, unknown>;

    // Enrich with bridge-derived fields (current_phase, current_milestone)
    await enrichWithBridge(parsed, root);

    return NextResponse.json(parsed);
  } catch {
    // Graceful degradation -- return empty state on any unexpected error
    return NextResponse.json({});
  }
}
