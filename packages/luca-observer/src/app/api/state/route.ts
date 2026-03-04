import { NextResponse } from "next/server";

import { readWorkflowState } from "~/lib/file-watcher";

export const dynamic = "force-dynamic";

/**
 * GET /api/state — Read current workflow state.
 *
 * Reads .planning/STATE.md from the filesystem and parses it
 * into a structured WorkflowSnapshot.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectDir = searchParams.get("dir") ?? undefined;

  try {
    const state = await readWorkflowState(projectDir);
    return NextResponse.json(state);
  } catch {
    return NextResponse.json(
      { error: "failed_to_read_state" },
      { status: 500 }
    );
  }
}
