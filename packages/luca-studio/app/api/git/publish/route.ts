/**
 * POST /api/git/publish -- Batch commit all Studio-edited entity files.
 *
 * Creates a single git commit with all uncommitted Studio-tracked files,
 * prefixed with `[studio-edit]`. Before committing, checks for non-Studio
 * uncommitted changes and returns 409 if any exist.
 *
 * Studio-tracked paths: `src/agents/`, `src/skills/`, `src/rules/`, `.planning/config.json`
 *
 * @returns `{ commit_sha, message, file_count }` on success
 * @returns `{ error, file_count }` with 409 on non-Studio dirty files
 * @returns `{ message }` with 200 if no Studio changes exist
 */
import { NextResponse } from "next/server";

import { resolveProjectRoot } from "~/lib/project-root";

/** Paths considered Studio-tracked entities. */
const STUDIO_PATH_PREFIXES = [
  "src/agents/",
  "src/skills/",
  "src/rules/",
  ".planning/config.json",
];

/**
 * Check whether a file path belongs to a Studio-tracked entity.
 *
 * @param filePath - Relative file path from git status
 * @returns true if the file is a Studio-tracked path
 */
function isStudioFile(filePath: string): boolean {
  const trimmed = filePath.trim();
  return STUDIO_PATH_PREFIXES.some(
    (prefix) => trimmed === prefix || trimmed.startsWith(prefix),
  );
}

/**
 * Extract a human-readable summary of changed entity names from file paths.
 *
 * @param files - Array of Studio-tracked file paths
 * @returns Summary string for the commit message
 */
function buildCommitSummary(files: string[]): string {
  const entityNames = files.map((f) => {
    const parts = f.trim().split("/");
    // For entity files, use the filename sans extension
    const last = parts[parts.length - 1];
    return last.replace(/\.[^.]+$/, "");
  });

  const unique = [...new Set(entityNames)];
  if (unique.length <= 3) {
    return unique.join(", ");
  }
  return `${unique.slice(0, 3).join(", ")} +${unique.length - 3} more`;
}

export async function POST(request: Request) {
  try {
    // Localhost guard: restrict to local development server
    const host = request.headers.get("host") ?? "";
    if (!host.startsWith("localhost") && !host.startsWith("127.0.0.1")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const root = await resolveProjectRoot();

    // 1. Get uncommitted files via git status --porcelain
    const statusResult = await Bun.$`git -C ${root} status --porcelain`.text();
    const lines = statusResult
      .split("\n")
      .filter((line) => line.trim().length > 0);

    if (lines.length === 0) {
      return NextResponse.json({ message: "No changes to publish" });
    }

    // 2. Separate Studio files from non-Studio files
    const studioFiles: string[] = [];
    const nonStudioFiles: string[] = [];

    for (const line of lines) {
      // git status --porcelain format: XY filename (or XY original -> renamed)
      const filePath = line.substring(3).split(" -> ").pop()?.trim() ?? "";
      if (isStudioFile(filePath)) {
        studioFiles.push(filePath);
      } else {
        nonStudioFiles.push(filePath);
      }
    }

    // 3. PRE-MORTEM CONSTRAINT: Block if non-Studio dirty files exist
    if (nonStudioFiles.length > 0) {
      return NextResponse.json(
        {
          error: "Non-Studio uncommitted changes detected",
          file_count: nonStudioFiles.length,
        },
        { status: 409 },
      );
    }

    // 4. No Studio changes to commit
    if (studioFiles.length === 0) {
      return NextResponse.json({ message: "No changes to publish" });
    }

    // 5. Stage only Studio files
    for (const file of studioFiles) {
      await Bun.$`git -C ${root} add ${file}`.quiet();
    }

    // 6. Commit with [studio-edit] prefix
    const summary = buildCommitSummary(studioFiles);
    const commitMessage = `[studio-edit] ${summary}`;

    await Bun.$`git -C ${root} commit -m ${commitMessage}`.quiet();

    // 7. Get the commit SHA
    const sha = await Bun.$`git -C ${root} rev-parse --short HEAD`.text();

    return NextResponse.json({
      commit_sha: sha.trim(),
      message: commitMessage,
      file_count: studioFiles.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Git publish failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
