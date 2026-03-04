import { realpathSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Resolve and validate a project directory parameter.
 *
 * Prevents path traversal (including symlink-based traversal) by:
 * 1. Resolving the path with node:path/resolve (handles .. components)
 * 2. Resolving symlinks with realpathSync (follows symlinks to real path)
 * 3. Checking that the real path starts with the real base path
 *
 * Falls back to resolve-only check if the path does not exist yet.
 *
 * @param projectDir - User-supplied directory parameter
 * @returns Validated absolute directory path
 * @throws Error if the resolved path is outside cwd
 */
export function resolveProjectDir(projectDir?: string): string {
  const base = process.env.LUCA_PROJECT_DIR || process.cwd();
  if (!projectDir) return base;

  const resolved = resolve(base, projectDir);

  if (!resolved.startsWith(base)) {
    throw new Error("Directory outside project boundary");
  }

  try {
    const realBase = realpathSync(base);
    const realResolved = realpathSync(resolved);
    if (!realResolved.startsWith(realBase)) {
      throw new Error("Directory outside project boundary (symlink traversal)");
    }
    return realResolved;
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      "code" in err &&
      (err as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return resolved;
    }
    if (
      err instanceof Error &&
      err.message.includes("outside project boundary")
    ) {
      throw err;
    }
    throw new Error("Directory outside project boundary");
  }
}
