/**
 * GET /api/git/history -- Return Studio-specific commit history.
 *
 * Fetches commits matching `[studio-edit]` from git log and returns
 * them as structured JSON. Supports `?limit=N` query param (default 20).
 *
 * @returns `{ commits: Array<{ sha, message, date, author, files }> }`
 */
import { NextResponse } from "next/server";

import { resolveProjectRoot } from "~/lib/project-root";
import { isLocalhostRequest } from "~/lib/request-guards";

/** Schema for a single commit entry in the history response. */
type HistoryCommit = {
  sha: string;
  message: string;
  date: string;
  author: string;
  files: string[];
};

export async function GET(request: Request) {
  try {
    // Localhost guard: restrict to local development server
    if (!isLocalhostRequest(request)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") ?? "20", 10) || 20, 1),
      100,
    );

    const root = await resolveProjectRoot();

    // Get studio-edit commits with a delimiter-separated format
    // Using ASCII Unit Separator (0x1F) as field delimiter
    const SEP = "\x1f";
    const format = `${SEP}%H${SEP}%s${SEP}%aI${SEP}%an`;

    const logResult =
      await Bun.$`git -C ${root} log --fixed-strings --grep=[studio-edit] --format=${format} -n ${limit}`.text();

    if (!logResult.trim()) {
      return NextResponse.json({ commits: [] });
    }

    // Parse each commit entry
    const entries = logResult.split(SEP).filter((s) => s.trim().length > 0);

    const commits: HistoryCommit[] = [];

    // Entries come in groups of 4 (sha, message, date, author) after split
    for (let i = 0; i + 3 < entries.length; i += 4) {
      const sha = entries[i].trim();
      const message = entries[i + 1].trim();
      const date = entries[i + 2].trim();
      const author = entries[i + 3].trim();

      if (!sha) continue;

      // Validate SHA is a well-formed full hex SHA before calling git
      if (!/^[0-9a-f]{40}$/i.test(sha)) continue;

      // Get files changed in this commit
      let files: string[] = [];
      try {
        const diffResult =
          await Bun.$`git -C ${root} diff-tree --no-commit-id --name-only -r ${sha}`.text();
        files = diffResult
          .split("\n")
          .map((f) => f.trim())
          .filter(Boolean);
      } catch {
        // If diff-tree fails, continue with empty files list
      }

      commits.push({
        sha,
        message: message.replace("[studio-edit] ", ""),
        date,
        author,
        files,
      });
    }

    return NextResponse.json({ commits });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to fetch git history";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
