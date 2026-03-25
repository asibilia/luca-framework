/**
 * GET /api/state -- Read `.planning/state.json` and return parsed JSON.
 *
 * Serves the Luca workflow state for the Studio frontend state inspector.
 * Missing state files return `{}` with 200 (not 500).
 */
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";

import { NextResponse } from "next/server";

import { resolveProjectRoot } from "~/lib/project-root";
import { safeJsonParse } from "~/lib/safe-json-parse";

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
    const parsed = safeJsonParse(raw, {});

    return NextResponse.json(parsed);
  } catch {
    // Graceful degradation -- return empty state on any unexpected error
    return NextResponse.json({});
  }
}
