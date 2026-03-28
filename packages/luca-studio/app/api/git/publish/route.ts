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
import { execFileSync } from "node:child_process";

import { NextResponse } from "next/server";

import { STUDIO_PATH_PREFIXES } from "~/lib/constants";
import { resolveProjectRoot } from "~/lib/project-root";
import { isLocalhostRequest } from "~/lib/request-guards";

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
 * The result is sanitized for safe use in git commit messages:
 * - Non-printable / non-ASCII characters are stripped
 * - Capped at 72 characters (conventional commit subject line limit)
 * - Falls back to "studio edit" if the sanitized result is empty
 *
 * @param files - Array of Studio-tracked file paths
 * @returns Sanitized summary string for the commit message
 */
function buildCommitSummary(files: string[]): string {
  const entityNames = files.map((f) => {
    const parts = f.trim().split("/");
    // For entity files, use the filename sans extension
    const last = parts.at(-1) ?? "";
    return last.replace(/\.[^.]+$/, "");
  });

  const unique = [...new Set(entityNames)];
  let raw: string;
  if (unique.length <= 3) {
    raw = unique.join(", ");
  } else {
    raw = `${unique.slice(0, 3).join(", ")} +${unique.length - 3} more`;
  }

  // Sanitize: strip non-printable / non-ASCII, cap length, provide fallback
  const sanitized = raw.replace(/[^\x20-\x7E]/g, "").slice(0, 72);
  return sanitized || "studio edit";
}

export async function POST(request: Request) {
  try {
    // Localhost guard: restrict to local development server
    if (!isLocalhostRequest(request)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const root = await resolveProjectRoot();

    // 1. Get uncommitted files via git status --porcelain
    const statusResult = execFileSync("git", ["status", "--porcelain"], {
      cwd: root,
      encoding: "utf-8",
    });
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
          non_studio_files: nonStudioFiles,
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
      execFileSync("git", ["add", "--", file], { cwd: root, encoding: "utf-8" });
    }

    // 6. Commit with [studio-edit] prefix
    const summary = buildCommitSummary(studioFiles);
    const commitMessage = `[studio-edit] ${summary}`;

    execFileSync("git", ["commit", "-m", commitMessage], {
      cwd: root,
      encoding: "utf-8",
    });

    // 7. Get the commit SHA
    const sha = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: root,
      encoding: "utf-8",
    });

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
