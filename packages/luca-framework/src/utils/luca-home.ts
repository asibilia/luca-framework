import { z } from "zod";
import { chmodSync, existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "pathe";
import { homedir } from "node:os";

/**
 * Zod schema for the Luca home directory paths.
 *
 * Defines the standard directory structure under `~/.luca/` plus the
 * user-level Claude Code configuration directory at `~/.claude/`:
 * - `root`: The top-level `~/.luca/` directory
 * - `bin`: Executable scripts and CLI symlinks
 * - `manifests`: Stored manifest snapshots for installed projects
 * - `backups`: Backup copies of configuration before updates
 * - `claudeGlobal`: The user-level `~/.claude/` directory (global deploy target)
 */
export const LucaHomePathsSchema = z.object({
  /** Absolute path to the root ~/.luca/ directory. */
  root: z.string(),
  /** Absolute path to the ~/.luca/bin/ directory for executables. */
  bin: z.string(),
  /** Absolute path to the ~/.luca/manifests/ directory for stored manifests. */
  manifests: z.string(),
  /** Absolute path to the ~/.luca/backups/ directory for pre-update backups. */
  backups: z.string(),
  /** Absolute path to the ~/.claude/ directory (global Claude Code config). */
  claudeGlobal: z.string(),
});

/** Luca home directory paths inferred from the Zod schema. */
export type LucaHomePaths = z.infer<typeof LucaHomePathsSchema>;

/**
 * Get the paths for the `~/.luca/` directory structure without creating them.
 *
 * This is a synchronous, read-only function that resolves path strings.
 * It does not touch the filesystem. Use `ensureLucaHome()` to create
 * the directories if they do not exist.
 *
 * @returns A validated `LucaHomePaths` object with all directory paths.
 *
 * @example
 * ```typescript
 * const paths = getLucaHomePaths();
 * console.log(paths.root);         // /Users/you/.luca
 * console.log(paths.bin);          // /Users/you/.luca/bin
 * console.log(paths.manifests);    // /Users/you/.luca/manifests
 * console.log(paths.backups);      // /Users/you/.luca/backups
 * console.log(paths.claudeGlobal); // /Users/you/.claude
 * ```
 */
export function getLucaHomePaths(): LucaHomePaths {
  const home = homedir();
  const root = join(home, ".luca");

  const paths: LucaHomePaths = {
    root,
    bin: join(root, "bin"),
    manifests: join(root, "manifests"),
    backups: join(root, "backups"),
    claudeGlobal: join(home, ".claude"),
  };

  return LucaHomePathsSchema.parse(paths);
}

/**
 * Directories that should have restrictive permissions (0700 -- owner only).
 *
 * These directories may contain sensitive data such as backup settings files
 * or deployment manifests. Only the owner should be able to list and read
 * their contents.
 */
const RESTRICTED_DIRS = new Set(["backups", "manifests"]);

/**
 * Ensure the `~/.luca/` directory structure exists, creating directories as needed.
 *
 * Creates the following directories if they do not already exist:
 * - `~/.luca/`
 * - `~/.luca/bin/`
 * - `~/.luca/manifests/` (permissions: 0700)
 * - `~/.luca/backups/` (permissions: 0700)
 *
 * The `manifests/` and `backups/` directories are set to `0700` (owner-only
 * access) because they may contain sensitive deployment data and settings
 * backups (SEC-002).
 *
 * Uses `mkdir` with `{ recursive: true }` so intermediate directories are
 * created automatically and existing directories are not affected.
 *
 * @returns A validated `LucaHomePaths` object with all directory paths.
 *
 * @example
 * ```typescript
 * const paths = await ensureLucaHome();
 * // All directories now exist on disk
 * console.log(paths.root); // /Users/you/.luca
 * ```
 */
export async function ensureLucaHome(): Promise<LucaHomePaths> {
  const paths = getLucaHomePaths();

  const dirs = [paths.root, paths.bin, paths.manifests, paths.backups];

  for (const dir of dirs) {
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
  }

  // Set restrictive permissions on sensitive directories (SEC-002)
  for (const dir of dirs) {
    const dirName = dir.split("/").pop() ?? "";
    if (RESTRICTED_DIRS.has(dirName)) {
      chmodSync(dir, 0o700);
    }
  }

  return paths;
}
