/**
 * CLI command: luca init
 *
 * Global setup orchestrator that guides users through first-time Luca installation.
 * This command handles global prerequisites (Bun runtime, ~/.luca/ directory,
 * MuninnDB binary) and then suggests running `luca vault:init` for per-project
 * initialization.
 *
 * The per-project wizard logic (detect context, run wizard, generate files) has
 * been moved to `vault-init.ts` (the `luca vault:init` command).
 *
 * Orchestration steps:
 * 1. Show intro message
 * 2. Detect runtime context (global install vs. monorepo dev)
 * 3. Check prerequisites (Bun installed and meets minimum version)
 * 4. Prompt Bun installation if prerequisites not met
 * 5. Ensure ~/.luca/ directory structure exists
 * 6. Download and start MuninnDB (unless --skip-muninndb)
 * 7. Show success and suggest vault:init
 *
 * @example
 * ```bash
 * # Full interactive setup
 * luca init
 *
 * # Skip prerequisite checks
 * luca init --skip-prerequisites
 *
 * # Skip the vault:init suggestion
 * luca init --skip-vault
 *
 * # Skip MuninnDB setup (manage it separately)
 * luca init --skip-muninndb
 * ```
 */
import { defineCommand, runMain } from "citty";
import * as p from "@clack/prompts";
import { existsSync } from "node:fs";
import { join } from "pathe";

import { logger } from "../utils/logger";
import { detectRuntimeContext } from "../utils/runtime-context";
import { checkPrerequisites, promptBunInstall } from "../utils/prerequisites";
import { ensureLucaHome } from "../utils/luca-home";
import { checkMuninndbBinary } from "../utils/muninndb-health";
import { downloadMuninndbBinary } from "../utils/muninndb-download";
import { startMuninndb } from "../utils/muninndb-service";
import { isOnPath, getPathGuidance } from "../utils/path-check";

export const initCommand = defineCommand({
  meta: {
    name: "init",
    description: "Set up Luca globally and initialize your first project",
  },
  args: {
    "skip-prerequisites": {
      type: "boolean",
      description: "Skip prerequisite checks",
      default: false,
    },
    "skip-vault": {
      type: "boolean",
      description: "Skip per-project initialization",
      default: false,
    },
    "skip-muninndb": {
      type: "boolean",
      description: "Skip MuninnDB binary download and service setup",
      default: false,
    },
  },
  async run({ args }) {
    // Step 1: Intro
    p.intro("luca init");

    // Step 2: Detect runtime context
    const ctx = detectRuntimeContext();
    const modeLabel = ctx.mode === "dev" ? "monorepo dev" : "global install";
    p.log.info(`Runtime mode: ${modeLabel}`);

    // Step 3: Check prerequisites (unless skipped)
    if (!args["skip-prerequisites"]) {
      const prereqs = checkPrerequisites();

      if (!prereqs.ok) {
        // Step 4: Prompt Bun install
        const shouldContinue = await promptBunInstall();
        if (!shouldContinue) {
          p.outro("Setup cancelled. Install Bun and run `luca init` again.");
          process.exit(1);
        }

        // Re-check after user says they installed
        const recheck = checkPrerequisites();
        if (!recheck.ok) {
          logger.error(
            "Bun still not detected. Please install Bun and try again.",
          );
          process.exit(1);
        }
      }

      p.log.success(
        `Bun ${prereqs.bun.version ?? "detected"} (${prereqs.platform.os}/${prereqs.platform.arch})`,
      );
    } else {
      p.log.info("Skipping prerequisite checks (--skip-prerequisites)");
    }

    // Step 5: Ensure ~/.luca/ directory structure
    const homePaths = await ensureLucaHome();
    p.log.success(`Luca home directory: ${homePaths.root}`);

    // Step 6: MuninnDB setup (unless skipped)
    let muninndbHealthy = false;
    if (!args["skip-muninndb"]) {
      const binaryStatus = await checkMuninndbBinary();

      if (!binaryStatus.installed) {
        p.log.info("MuninnDB not found. Downloading...");
        const installResult = await downloadMuninndbBinary();

        if (!installResult.success) {
          p.log.warn(
            `MuninnDB download failed: ${installResult.error ?? "unknown error"}`,
          );
          p.log.warn(
            "You can install MuninnDB later or run `luca init` again.",
          );
        } else {
          p.log.success(
            `MuninnDB binary installed: ${installResult.binaryPath}`,
          );
        }
      } else {
        p.log.success(
          `MuninnDB binary found: ${binaryStatus.path}${binaryStatus.version ? ` (${binaryStatus.version})` : ""}`,
        );
      }

      // Start service if binary is available
      const recheckBinary = await checkMuninndbBinary();
      if (recheckBinary.installed && recheckBinary.executable) {
        p.log.info("Starting MuninnDB service...");
        const serviceStatus = await startMuninndb();

        if (serviceStatus.healthy) {
          muninndbHealthy = true;
          p.log.success(
            `MuninnDB running on port ${serviceStatus.port}${serviceStatus.pid ? ` (PID ${serviceStatus.pid})` : ""}`,
          );
        } else {
          p.log.warn(
            "MuninnDB started but health check failed. It may need a moment to initialize.",
          );
        }
      }

      // PATH guidance
      if (!isOnPath(homePaths.bin)) {
        const guidance = getPathGuidance(homePaths.bin);
        p.note(
          [
            `${homePaths.bin} is not on your PATH.`,
            "Add it so the MuninnDB binary is available globally:",
            "",
            guidance,
          ].join("\n"),
          "PATH Setup Required",
        );
      }
    } else {
      p.log.info("Skipping MuninnDB setup (--skip-muninndb)");
    }

    // Step 7: Success message
    const statusLines = [
      "Global setup complete. The following directories are ready:",
      "",
      `  ${homePaths.root}/`,
      `  ${homePaths.bin}/`,
      `  ${homePaths.manifests}/`,
      `  ${homePaths.backups}/`,
    ];

    if (!args["skip-muninndb"]) {
      statusLines.push("");
      statusLines.push(
        muninndbHealthy
          ? "  MuninnDB: running and healthy"
          : "  MuninnDB: not running (start with `muninndb` or re-run `luca init`)",
      );
    }

    p.note(statusLines.join("\n"), "Setup Complete");

    // Step 7: Suggest vault:init (unless skipped)
    if (!args["skip-vault"]) {
      const cwd = process.cwd();
      const hasPackageJson = existsSync(join(cwd, "package.json"));

      if (hasPackageJson) {
        const runNow = await p.confirm({
          message:
            "This directory looks like a project. Run `luca vault:init` to set up Luca here?",
          initialValue: true,
        });

        if (!p.isCancel(runNow) && runNow) {
          const { vaultInitCommand } = await import("./vault-init");
          await runMain(vaultInitCommand);
          return;
        }
      }

      p.log.info("To initialize Luca in a project, run:");
      p.log.info("  luca vault:init");
    }

    p.outro("Luca is ready. Happy building!");
  },
});

/**
 * Run init command directly (used by create-luca and bin/luca.js).
 *
 * Preserves the export contract consumed by index.ts and downstream consumers.
 */
export const runInit = () => runMain(initCommand);
