import { z } from "zod";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "pathe";
import { homedir } from "node:os";

/**
 * Zod schema for the Luca home directory paths.
 *
 * Defines the standard directory structure under `~/.luca/`:
 * - `root`: The top-level `~/.luca/` directory
 * - `bin`: Executable scripts and CLI symlinks
 * - `manifests`: Stored manifest snapshots for installed projects
 * - `backups`: Backup copies of configuration before updates
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
 * console.log(paths.root);      // /Users/you/.luca
 * console.log(paths.bin);       // /Users/you/.luca/bin
 * console.log(paths.manifests); // /Users/you/.luca/manifests
 * console.log(paths.backups);   // /Users/you/.luca/backups
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
  };

  return LucaHomePathsSchema.parse(paths);
}

/**
 * Ensure the `~/.luca/` directory structure exists, creating directories as needed.
 *
 * Creates the following directories if they do not already exist:
 * - `~/.luca/`
 * - `~/.luca/bin/`
 * - `~/.luca/manifests/`
 * - `~/.luca/backups/`
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

  return paths;
}
