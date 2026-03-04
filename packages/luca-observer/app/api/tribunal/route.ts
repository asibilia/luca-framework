import { NextResponse } from "next/server";

import { readTribunalResult } from "~/lib/file-watcher";

export const dynamic = "force-dynamic";

/**
 * GET /api/tribunal -- Read latest tribunal/debate result.
 *
 * Reads .planning/tribunal-result.json and validates it with
 * TribunalResultSnapshotSchema. Returns the Design Tribunal result
 * including total findings, disagreement counts, rebuttal outcomes,
 * modification/withdrawal counts, and token cost data. Returns null
 * if the file does not exist or is invalid.
 *
 * Query parameters:
 *   - dir (string, optional): Project directory path (defaults to LUCA_PROJECT_DIR or cwd)
 *
 * Response (200):
 *   { result: TribunalResultSnapshot | null, has_result: boolean }
 *
 *   Where TribunalResultSnapshot contains:
 *   { phase: number, total_findings: number,
 *     disagreements_detected: number, rebuttals_conducted: number,
 *     findings_withdrawn: number, findings_modified: number,
 *     debate_token_cost: number, timestamp: string }
 *
 * Response (500):
 *   { error: "failed_to_read_tribunal" }
 *
 * Uses snake_case for API compatibility.
 *
 * @example
 * ```bash
 * curl http://localhost:3456/api/tribunal
 * ```
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectDir = searchParams.get("dir") ?? undefined;

  try {
    const result = await readTribunalResult(projectDir);

    return NextResponse.json({
      result,
      has_result: result !== null,
    });
  } catch {
    return NextResponse.json(
      { error: "failed_to_read_tribunal" },
      { status: 500 },
    );
  }
}
