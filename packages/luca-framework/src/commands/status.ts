import { defineCommand } from "citty";

import { logger } from "../utils/logger";
import { readManifest, LUCA_VERSION } from "../utils/manifest";

import type { HarnessId, LucaManifest } from "../types";

/**
 * Build file counts grouped by source (framework vs harness-specific).
 *
 * @param manifest - Parsed Luca manifest
 * @param harnesses - Active harness IDs
 * @returns Record mapping source keys to file counts
 */
function buildFileCounts(
  manifest: LucaManifest,
  harnesses: HarnessId[],
): Record<string, number> {
  const fileCounts: Record<string, number> = { framework: 0 };
  for (const harnessId of harnesses) {
    fileCounts[`harness:${harnessId}`] = 0;
  }

  for (const entry of Object.values(manifest.files)) {
    const source = entry.source ?? "framework";
    fileCounts[source] = (fileCounts[source] ?? 0) + 1;
  }

  return fileCounts;
}

/**
 * Build a human-readable status summary from the manifest.
 *
 * Groups file counts by source (framework vs harness-specific) and
 * formats version, stack, work tracker, and harness information.
 *
 * @param manifest - Parsed Luca manifest
 * @returns Formatted multi-line string for logger.box()
 */
function formatStatusSummary(manifest: LucaManifest): string {
  const harnesses: HarnessId[] = manifest.harnesses ?? ["claude"];
  const fileCounts = buildFileCounts(manifest, harnesses);
  const totalFiles = Object.keys(manifest.files).length;

  const fileLines = Object.entries(fileCounts)
    .map(([source, count]) => `  ${source}: ${count}`)
    .join("\n");

  return `Luca Project Status

Version:       ${LUCA_VERSION} (installed: ${manifest.version})
Stack:         ${manifest.stack}
Work Tracker:  ${manifest.workTracker}
Harnesses:     ${harnesses.join(", ")}
Installed:     ${manifest.installedAt}
Updated:       ${manifest.updatedAt}

Files (${totalFiles} total):
${fileLines}`;
}

/**
 * Build a JSON-serializable status object for CI consumption.
 *
 * @param manifest - Parsed Luca manifest
 * @returns Plain object with status fields
 */
function buildStatusJson(manifest: LucaManifest): Record<string, unknown> {
  const harnesses: HarnessId[] = manifest.harnesses ?? ["claude"];
  const fileCounts = buildFileCounts(manifest, harnesses);

  return {
    version: LUCA_VERSION,
    installedVersion: manifest.version,
    stack: manifest.stack,
    workTracker: manifest.workTracker,
    harnesses,
    installedAt: manifest.installedAt,
    updatedAt: manifest.updatedAt,
    totalFiles: Object.keys(manifest.files).length,
    fileCounts,
  };
}

/**
 * `bun luca status` command.
 *
 * Reads the project manifest and displays version, stack, harnesses,
 * work tracker, and file counts. Supports `--json` for CI pipelines.
 *
 * Exits with code 1 if no manifest is found (not a Luca project).
 *
 * @example
 * ```bash
 * bun luca status          # Human-readable box output
 * bun luca status --json   # JSON output for CI
 * ```
 */
export const statusCommand = defineCommand({
  meta: {
    name: "status",
    description: "Show Luca project status and configuration",
  },
  args: {
    json: {
      type: "boolean",
      description: "Output status as JSON (for CI)",
      default: false,
    },
  },
  async run({ args }) {
    const cwd = process.cwd();
    const manifest = await readManifest(cwd);

    if (!manifest) {
      if (args.json) {
        console.log(JSON.stringify({ error: "Not a Luca project" }));
      } else {
        logger.error("Not a Luca project.");
        logger.info("Run `bunx luca init` to initialize a new Luca project.");
      }
      process.exit(1);
    }

    if (args.json) {
      console.log(JSON.stringify(buildStatusJson(manifest), null, 2));
    } else {
      logger.box(formatStatusSummary(manifest));
    }
  },
});
