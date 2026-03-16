import { defineCommand } from "citty";
import { logger } from "../utils/logger";
import { LUCA_VERSION } from "../utils/manifest";
import { detectRuntimeContext } from "../utils/runtime-context";
import { checkPlatform } from "../utils/prerequisites";

/**
 * CLI command: luca version
 *
 * Displays the current Luca CLI version, runtime mode (global install vs.
 * monorepo dev), and platform information (OS, architecture). Optionally
 * performs a synchronous update check via update-notifier.
 *
 * Output includes:
 * - Luca version (from package.json or build-time injection)
 * - Runtime mode: "global" (npm/bun global install) or "dev" (monorepo)
 * - Platform: OS and CPU architecture
 * - Update availability (if --check is enabled)
 *
 * @example
 * ```bash
 * # Show version and check for updates
 * luca version
 *
 * # Show version without update check
 * luca version --no-check
 * ```
 */
export const versionCommand = defineCommand({
  meta: {
    name: "version",
    description: "Show Luca version, platform info, and check for updates",
  },
  args: {
    check: {
      type: "boolean",
      description: "Check for updates",
      default: true,
    },
  },
  async run({ args }) {
    const ctx = detectRuntimeContext();
    const platform = checkPlatform();

    const modeLabel = ctx.mode === "dev" ? "dev (monorepo)" : "global";

    logger.box(
      [
        `Luca CLI v${LUCA_VERSION}`,
        "",
        `Runtime:  ${modeLabel}`,
        `Platform: ${platform.os} / ${platform.arch}`,
        `Home:     ${platform.homeDir}`,
      ].join("\n"),
    );

    if (args.check) {
      try {
        const { checkForUpdates } = await import("../utils/version-check");
        await checkForUpdates();
      } catch {
        // Update check failure is non-fatal
      }
    }
  },
});
