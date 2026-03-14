import { NextResponse } from "next/server";
import { access, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { z } from "zod";

/**
 * API Response: Context window metrics from .planning/.context-metrics.json.
 *
 * Represents the current context window usage zone, percentage, and token counts
 * as written by the statusline script (real data) or context-monitor hook
 * (transcript heuristic fallback) during active sessions.
 * Uses snake_case for API-facing fields per project convention.
 */
const ContextMetricsSchema = z.object({
  zone: z.enum(["peak", "good", "degrading", "stop"]),
  usage_percent: z.number().min(0).max(100),
  checked_at: z.string(),
  // Real token data (from statusline — present when source is "statusline")
  context_window_size: z.number().int().min(0).optional(),
  total_input_tokens: z.number().int().min(0).optional(),
  total_output_tokens: z.number().int().min(0).optional(),
  cache_read_input_tokens: z.number().int().min(0).optional(),
  // Heuristic data (from transcript byte estimation — present when source is "transcript_heuristic")
  transcript_bytes: z.number().int().min(0).optional(),
  // Source discriminator: "statusline" (real) or "transcript_heuristic" (estimated)
  source: z.enum(["statusline", "transcript_heuristic"]).optional(),
  // Legacy thresholds (optional — not written by statusline, only by old heuristic)
  thresholds: z
    .object({
      warn_bytes: z.number(),
      alert_bytes: z.number(),
      critical_bytes: z.number(),
    })
    .optional(),
});

/**
 * GET /api/context-metrics
 *
 * Reads `.planning/.context-metrics.json` from the workspace root and returns
 * the parsed context window usage data. The file is written by the
 * context-monitor hook during active Claude Code / Cursor sessions.
 *
 * Returns 404 when no metrics file exists (no active session).
 * Returns 502 when the file exists but has an invalid format.
 *
 * Workspace root resolution: LUCA_PROJECT_DIR > WORKSPACE_ROOT > cwd
 */
/**
 * Walk up from startDir looking for a directory containing `.planning/`.
 * Returns the first match, or null if none found.
 */
async function findProjectRoot(startDir: string): Promise<string | null> {
  let current = resolve(startDir);
  const root = resolve("/");
  while (current !== root) {
    try {
      await access(join(current, ".planning"));
      return current;
    } catch {
      /* not found at this level, keep walking up */
    }
    current = resolve(current, "..");
  }
  return null;
}

export async function GET() {
  const rawRoot = process.env.LUCA_PROJECT_DIR || process.env.WORKSPACE_ROOT;
  const explicitRoot = rawRoot ? resolve(rawRoot) : null;
  const workspaceRoot =
    explicitRoot || (await findProjectRoot(process.cwd())) || process.cwd();
  const metricsPath = join(workspaceRoot, ".planning", ".context-metrics.json");

  try {
    const content = await readFile(metricsPath, "utf-8");
    const raw: unknown = JSON.parse(content);
    const result = ContextMetricsSchema.safeParse(raw);
    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid metrics format" },
        { status: 502 },
      );
    }
    return NextResponse.json(result.data);
  } catch {
    return NextResponse.json(
      { error: "Context metrics not available" },
      { status: 404 },
    );
  }
}
