import { NextResponse } from "next/server";

import { readMemoryFiles } from "~/lib/file-watcher";

export const dynamic = "force-dynamic";

/**
 * GET /api/memory — Read brain + memory + working files.
 *
 * Returns the raw content of BRAIN.md, MEMORY.md, and WORKING.md
 * from the .planning/ directory.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectDir = searchParams.get("dir") ?? undefined;

  try {
    const files = await readMemoryFiles(projectDir);
    return NextResponse.json(files);
  } catch {
    return NextResponse.json(
      { error: "failed_to_read_memory" },
      { status: 500 },
    );
  }
}
