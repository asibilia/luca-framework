/**
 * POST /api/git/revert -- Revert a specific file to a specific commit SHA.
 *
 * Checks out the file from the given commit and stages it for the next
 * publish operation. Does NOT auto-commit the revert.
 *
 * Request body: `{ file_path: string, commit_sha: string }`
 *
 * @returns `{ reverted: true, file_path }` on success
 * @returns `{ error }` with 400/500 on failure
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveProjectRoot } from "~/lib/project-root";

/**
 * Request body schema for the revert endpoint.
 * Uses snake_case per API conventions.
 */
const RevertBodySchema = z.object({
  file_path: z.string().min(1, "file_path is required"),
  commit_sha: z.string().min(4, "commit_sha must be at least 4 characters"),
});

export async function POST(request: Request) {
  try {
    // 1. Parse and validate body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parseResult = RevertBodySchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0].message },
        { status: 400 },
      );
    }

    const { file_path, commit_sha } = parseResult.data;

    const root = await resolveProjectRoot();

    // 2. Checkout the file from the given commit
    await Bun.$`git -C ${root} checkout ${commit_sha} -- ${file_path}`.quiet();

    // 3. File is automatically staged by git checkout -- no extra add needed

    return NextResponse.json({
      reverted: true,
      file_path,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Revert failed";
    return NextResponse.json(
      { error: `Revert failed: ${message}` },
      { status: 500 },
    );
  }
}
