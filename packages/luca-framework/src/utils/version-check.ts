import { join, dirname } from "pathe";
import { fileURLToPath } from "url";

/**
 * Check for updates and notify user (non-blocking).
 *
 * Uses update-notifier which:
 * - Runs check in background subprocess (doesn't block CLI)
 * - Caches results for 24 hours (no repeated checks)
 * - Shows notification box if update available
 *
 * Called at CLI startup. Silently fails if package.json unreadable
 * or registry unreachable.
 */
export async function checkForUpdates(): Promise<void> {
  try {
    const { default: updateNotifier } = await import("update-notifier");

    // Resolve package.json from this module's location
    // Works both in development (src/) and production (dist/)
    const currentDir = dirname(fileURLToPath(import.meta.url));

    // Try multiple possible locations
    const possiblePaths = [
      join(currentDir, "..", "..", "package.json"), // from dist/utils/
      join(currentDir, "..", "package.json"), // from src/utils/
    ];

    let pkg: { name: string; version: string } | null = null;

    for (const pkgPath of possiblePaths) {
      try {
        pkg = JSON.parse(await Bun.file(pkgPath).text());
        break;
      } catch {
        // Try next path
      }
    }

    if (!pkg) {
      // Can't find package.json, skip silently
      return;
    }

    // Initialize notifier
    const notifier = updateNotifier({
      pkg,
      updateCheckInterval: 1000 * 60 * 60 * 24, // 24 hours
    });

    // Notify if update available
    // This is non-blocking - runs in background
    notifier.notify({
      message: `New Luca CLI version available: {currentVersion} → {latestVersion}\nRun: bun install -g @alecsibilia/luca-framework@latest`,
      defer: false,
    });
  } catch {
    // Silently ignore version check errors
    // This should never block CLI operation
  }
}
