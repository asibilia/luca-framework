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
 * - `bin`: Executable scripts (e.g., MuninnDB binary)
 */
export const LucaHomePathsSchema = z.object({
  /** Absolute path to the root ~/.luca/ directory. */
  root: z.string(),
  /** Absolute path to the ~/.luca/bin/ directory for executables. */
  bin: z.string(),
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
 */
export function getLucaHomePaths(): LucaHomePaths {
  const home = homedir();
  const root = join(home, ".luca");

  const paths: LucaHomePaths = {
    root,
    bin: join(root, "bin"),
  };

  return LucaHomePathsSchema.parse(paths);
}

/**
 * Ensure the `~/.luca/` directory structure exists, creating directories as needed.
 *
 * Creates the following directories if they do not already exist:
 * - `~/.luca/`
 * - `~/.luca/bin/`
 *
 * Uses `mkdir` with `{ recursive: true }` so intermediate directories are
 * created automatically and existing directories are not affected.
 *
 * @returns A validated `LucaHomePaths` object with all directory paths.
 */
export async function ensureLucaHome(): Promise<LucaHomePaths> {
  const paths = getLucaHomePaths();

  const dirs = [paths.root, paths.bin];

  for (const dir of dirs) {
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
  }

  return paths;
}
