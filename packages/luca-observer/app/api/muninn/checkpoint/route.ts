import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { NextResponse } from "next/server";

import { CheckpointResponseSchema } from "~/lib/muninn-schemas";

/**
 * GET /api/muninn/checkpoint
 *
 * Reads .planning/.context-checkpoint.json from the filesystem.
 * This is NOT a MuninnDB proxy — it reads a local file written by
 * the context-monitor hook.
 *
 * Returns 200 always — file missing means no checkpoint yet (not an error).
 */
export async function GET() {
  const defaultResponse = {
    zone: null,
    usage_percent: null,
    checked_at: null,
    observation_count: 0,
    checkpoint_age_seconds: null,
  };

  try {
    const filePath = join(
      process.cwd(),
      ".planning",
      ".context-checkpoint.json",
    );
    const raw = await readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    const result = CheckpointResponseSchema.safeParse(parsed);
    if (!result.success) {
      console.error(
        "[checkpoint] Response validation failed:",
        result.error.message,
      );
      return NextResponse.json(defaultResponse);
    }

    // Compute checkpoint_age_seconds from checked_at
    const data = result.data;
    let checkpointAge: number | null = null;
    if (data.checked_at) {
      const checkedMs = new Date(data.checked_at).getTime();
      if (!isNaN(checkedMs)) {
        checkpointAge = Math.floor((Date.now() - checkedMs) / 1000);
      }
    }

    return NextResponse.json({
      ...data,
      checkpoint_age_seconds: checkpointAge,
    });
  } catch {
    // File missing or unreadable — return safe defaults
    return NextResponse.json(defaultResponse);
  }
}
