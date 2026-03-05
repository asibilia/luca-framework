/**
 * Workspace-scoping middleware for the harness verification pipeline.
 *
 * Queries git diff to identify changed files and attaches them to the
 * middleware context. Downstream consumers (parsers, observer) can use
 * this to focus on relevant file changes rather than the entire project.
 *
 * Does NOT modify the check command itself -- that would risk breaking
 * tool-specific CLI arguments. Instead, it provides scoped file lists
 * that consumers can use for filtering results.
 *
 * @returns CheckMiddleware function
 *
 * @example
 * ```typescript
 * import { createWorkspaceScopeMiddleware } from "~/harness/middleware/workspace-scope";
 *
 * const scope = createWorkspaceScopeMiddleware();
 * const result = await scope(ctx, next);
 * // ctx.scopedFiles now contains changed file paths
 * // ctx.metadata contains workspace_changed_file_count and workspace_changed_files
 * ```
 */

import type {
  CheckMiddleware,
  MiddlewareContext,
  CheckResult,
} from "~/harness/__schemas/harness.schemas";

/**
 * Get changed files from git diff (staged + unstaged).
 *
 * Uses Bun.spawn to run git diff with --name-only and --diff-filter=ACMR
 * to capture Added, Copied, Modified, and Renamed files relative to HEAD.
 *
 * @param projectDir - Project root directory
 * @returns Array of changed file paths relative to projectDir
 */
async function getChangedFiles(projectDir: string): Promise<string[]> {
  try {
    const proc = Bun.spawn(
      ["git", "diff", "--name-only", "--diff-filter=ACMR", "HEAD"],
      {
        cwd: projectDir,
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      return [];
    }

    return stdout
      .trim()
      .split("\n")
      .filter((line) => line.length > 0);
  } catch {
    return [];
  }
}

/**
 * Create a workspace-scoping middleware that attaches changed file lists.
 *
 * The middleware queries git diff before passing control to the next
 * middleware, enriching the context with scopedFiles and metadata about
 * the changed file count and paths.
 *
 * @returns A CheckMiddleware function that enriches context with workspace scope
 */
export function createWorkspaceScopeMiddleware(): CheckMiddleware {
  return async (
    ctx: MiddlewareContext,
    next: (ctx: MiddlewareContext) => Promise<CheckResult>,
  ): Promise<CheckResult> => {
    const changedFiles = await getChangedFiles(ctx.projectDir);

    // Mutate ctx directly so scope data propagates back to the runner's
    // ctxInput reference (used by buildMiddlewareResult)
    ctx.scopedFiles = changedFiles;
    ctx.metadata.workspace_changed_file_count = changedFiles.length;
    ctx.metadata.workspace_changed_files = changedFiles;

    return next(ctx);
  };
}
