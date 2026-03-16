/**
 * Backup manager for Luca settings files.
 *
 * Provides timestamped backup creation, rotation, and listing for
 * `~/.claude/settings.json` before deploy operations modify it.
 * Backups are stored in `~/.luca/backups/` (from LucaHomePathsSchema).
 *
 * Uses `Bun.file()` and `Bun.write()` for file I/O, consistent with
 * the `manifest.ts` patterns. Directory creation uses `node:fs` mkdir
 * since Bun does not provide a directory creation API.
 *
 * @see packages/luca-framework/src/utils/luca-home.ts for backup directory paths
 * @see .planning/phases/175-settings-merge-artifact-deployment/175-CONTEXT.md Gray Area 5
 */

import { mkdir } from "node:fs/promises";
import { existsSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "pathe";
import orderBy from "lodash/orderBy";
import filter from "lodash/filter";

// ─── Backup creation ────────────────────────────────────────────────────────

/**
 * Create a timestamped backup of a settings file.
 *
 * If the settings file exists, reads its content and writes a copy to
 * `{backupsDir}/settings-{timestamp}.json` where the timestamp is ISO
 * format with colons and periods replaced by dashes for filesystem safety.
 *
 * Creates the backups directory if it does not exist.
 *
 * @param settingsPath - Absolute path to the settings file to back up
 * @param backupsDir - Absolute path to the backups directory (e.g., `~/.luca/backups/`)
 * @returns Absolute path to the created backup file, or null if the settings file did not exist
 *
 * @example
 * ```typescript
 * import { getLucaHomePaths } from "./luca-home";
 * import { backupSettings } from "./backup-manager";
 *
 * const paths = getLucaHomePaths();
 * const backupPath = await backupSettings(
 *   join(homedir(), ".claude", "settings.json"),
 *   paths.backups,
 * );
 * // backupPath: "/Users/you/.luca/backups/settings-2026-03-16T12-00-00-000Z.json"
 * ```
 */
export async function backupSettings(
  settingsPath: string,
  backupsDir: string,
): Promise<string | null> {
  const file = Bun.file(settingsPath);
  const exists = await file.exists();

  if (!exists) {
    return null;
  }

  // Ensure backups directory exists
  if (!existsSync(backupsDir)) {
    await mkdir(backupsDir, { recursive: true });
  }

  const content = await file.text();
  const timestamp = new Date()
    .toISOString()
    .replace(/:/g, "-")
    .replace(/\./g, "-");
  const backupFileName = `settings-${timestamp}.json`;
  const backupPath = join(backupsDir, backupFileName);

  await Bun.write(backupPath, content);

  return backupPath;
}

// ─── Backup rotation ────────────────────────────────────────────────────────

/**
 * Rotate old backups, keeping only the most recent `maxKeep` files.
 *
 * Reads the backups directory, filters for files matching `settings-*.json`,
 * sorts by filename lexically (ISO timestamps sort correctly), and deletes
 * the oldest files exceeding the retention limit.
 *
 * Deletion errors are swallowed on a per-file basis to ensure best-effort
 * cleanup without failing the overall deploy operation.
 *
 * @param backupsDir - Absolute path to the backups directory
 * @param maxKeep - Maximum number of backup files to retain (default: 5)
 *
 * @example
 * ```typescript
 * import { getLucaHomePaths } from "./luca-home";
 * import { rotateBackups } from "./backup-manager";
 *
 * const paths = getLucaHomePaths();
 * rotateBackups(paths.backups, 5);
 * // Keeps only the 5 most recent settings-*.json files
 * ```
 */
export function rotateBackups(backupsDir: string, maxKeep: number = 5): void {
  if (!existsSync(backupsDir)) {
    return;
  }

  let entries: string[];
  try {
    entries = readdirSync(backupsDir);
  } catch {
    return;
  }

  const backupFiles = filter(entries, (name: string) =>
    /^settings-.*\.json$/.test(name),
  );

  // Sort ascending (oldest first) -- ISO timestamps sort lexically
  const sorted = orderBy(backupFiles, (name: string) => name, "asc");

  if (sorted.length <= maxKeep) {
    return;
  }

  // Delete oldest files exceeding maxKeep
  const toDelete = sorted.slice(0, sorted.length - maxKeep);

  for (const fileName of toDelete) {
    try {
      unlinkSync(join(backupsDir, fileName));
    } catch {
      // Best-effort cleanup: swallow individual deletion errors
    }
  }
}

// ─── Backup listing ─────────────────────────────────────────────────────────

/**
 * List all backup files in the backups directory, newest first.
 *
 * Returns absolute paths sorted by filename descending (newest first),
 * useful for `luca reinit` and status display.
 *
 * @param backupsDir - Absolute path to the backups directory
 * @returns Array of absolute backup file paths, sorted newest first
 *
 * @example
 * ```typescript
 * import { getLucaHomePaths } from "./luca-home";
 * import { listBackups } from "./backup-manager";
 *
 * const paths = getLucaHomePaths();
 * const backups = listBackups(paths.backups);
 * // ["/Users/you/.luca/backups/settings-2026-03-16T12-00-00-000Z.json", ...]
 * ```
 */
export function listBackups(backupsDir: string): string[] {
  if (!existsSync(backupsDir)) {
    return [];
  }

  let entries: string[];
  try {
    entries = readdirSync(backupsDir);
  } catch {
    return [];
  }

  const backupFiles = filter(entries, (name: string) =>
    /^settings-.*\.json$/.test(name),
  );

  // Sort descending (newest first)
  const sorted = orderBy(backupFiles, (name: string) => name, "desc");

  return sorted.map((name) => join(backupsDir, name));
}
