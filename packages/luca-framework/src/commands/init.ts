/**
 * CLI command: luca init
 *
 * Global setup orchestrator that guides users through first-time Luca installation.
 * This command handles global prerequisites (Bun runtime, ~/.luca/ directory) and
 * then suggests running `luca vault:init` for per-project initialization.
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
 * 6. Show success and suggest vault:init
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

    // Step 6: Success message
    p.note(
      [
        "Global setup complete. The following directories are ready:",
        "",
        `  ${homePaths.root}/`,
        `  ${homePaths.bin}/`,
        `  ${homePaths.manifests}/`,
        `  ${homePaths.backups}/`,
      ].join("\n"),
      "Setup Complete",
    );

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
