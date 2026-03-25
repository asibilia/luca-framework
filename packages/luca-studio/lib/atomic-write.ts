/**
 * Crash-safe atomic file write utility.
 *
 * Writes content to a temporary sibling file (`<target>.tmp`) first, then
 * renames it into place. On POSIX systems `rename()` is atomic within the
 * same filesystem, so the target file is never left in a partially-written
 * state — even if the process crashes mid-write.
 *
 * @param filePath - Absolute path to the target file.
 * @param content  - The string content to write.
 * @returns Resolves when the file has been atomically replaced.
 *
 * @example
 * ```typescript
 * import { atomicWrite } from "~/lib/atomic-write";
 *
 * await atomicWrite("/project/.planning/config.json", JSON.stringify(cfg, null, 2));
 * ```
 */
import { rename, writeFile } from "node:fs/promises";

export async function atomicWrite(
  filePath: string,
  content: string,
): Promise<void> {
  const tmpPath = `${filePath}.tmp`;
  await writeFile(tmpPath, content, "utf-8");
  await rename(tmpPath, filePath);
}
