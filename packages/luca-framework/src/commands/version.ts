/**
 * CLI command: luca version
 *
 * Displays the current Luca CLI version and platform information.
 * Always performs a passive update check via update-notifier (24h cache).
 *
 * @example
 * ```bash
 * luca version
 * ```
 */
import { defineCommand } from "citty";

import { logger } from "../utils/logger";
import { LUCA_VERSION } from "../utils/manifest";
import { checkPlatform } from "../utils/prerequisites";
import { checkForUpdates } from "../utils/version-check";

export const versionCommand = defineCommand({
  meta: {
    name: "version",
    description: "Show Luca version and platform info",
  },
  async run() {
    const platform = checkPlatform();

    logger.box(
      [
        `Luca CLI v${LUCA_VERSION}`,
        "",
        `Platform: ${platform.os} / ${platform.arch}`,
        `Home:     ${platform.homeDir}`,
      ].join("\n"),
    );

    await checkForUpdates();
  },
});
