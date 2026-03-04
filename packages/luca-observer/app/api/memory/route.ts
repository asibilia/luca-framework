import { NextResponse } from "next/server";

import { readMemoryFiles } from "~/lib/file-watcher";

export const dynamic = "force-dynamic";

/**
 * GET /api/memory -- Read brain, memory, and working files.
 *
 * Returns the raw markdown content of the three cognitive memory files
 * from .planning/: BRAIN.md (project identity), MEMORY.md (long-term
 * learnings), and WORKING.md (session working memory). Returns empty
 * strings for any files that do not exist.
 *
 * Query parameters:
 *   - dir (string, optional): Project directory path (defaults to LUCA_PROJECT_DIR or cwd)
 *
 * Response (200):
 *   { brain: string, memory: string, working: string }
 *
 * Response (500):
 *   { error: "failed_to_read_memory" }
 *
 * Uses snake_case for API compatibility.
 *
 * @example
 * ```bash
 * curl http://localhost:3456/api/memory
 * curl "http://localhost:3456/api/memory?dir=/path/to/project"
 * ```
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
