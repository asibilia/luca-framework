import { defineCommand } from "citty";
import * as p from "@clack/prompts";
import { logger } from "../utils/logger";
import { detectProjectContext } from "../utils/detect";
import {
  runWizard,
  createConfigFromArgs,
  loadConfigFromFile,
} from "../utils/wizard";
import { generateFiles, setupCleanupHandler } from "../utils/files";

import type { LucaConfig } from "../types";

/**
 * CLI command: luca vault:init
 *
 * Initializes Luca in a project repository. This command absorbs the
 * per-project initialization behavior previously in `init.ts`. It detects
 * the project context, runs the interactive wizard (or accepts CLI args /
 * config file), generates framework files, and optionally runs the
 * post-init tour.
 *
 * Supports three initialization modes:
 * 1. **Interactive** (default): Runs the wizard for guided setup
 * 2. **Quick mode** (`--quick` or explicit args): Uses defaults / provided values
 * 3. **Config file mode** (`--config <path>`): Reads config from a JSON file
 *
 * Includes a guard to prevent re-initialization if Luca is already installed.
 *
 * @example
 * ```bash
 * # Interactive mode
 * luca vault:init
 *
 * # Quick mode with defaults
 * luca vault:init --quick
 *
 * # Explicit arguments
 * luca vault:init --name MyFramework --stack react-ts --tracker github
 *
 * # Config file mode
 * luca vault:init --config ./my-config.json
 * ```
 */
export const vaultInitCommand = defineCommand({
  meta: {
    name: "vault:init",
    description: "Initialize Luca in a project repository",
  },
  args: {
    quick: {
      type: "boolean",
      description: "Skip interactive prompts, use defaults",
      default: false,
      alias: "q",
    },
    config: {
      type: "string",
      description: "Path to config file for non-interactive mode",
      alias: "c",
    },
    name: {
      type: "string",
      description: "Framework name (default: Luca)",
    },
    prefix: {
      type: "string",
      description: "Command prefix (default: lu)",
    },
    stack: {
      type: "string",
      description: "Stack template (react-ts, custom)",
    },
    tracker: {
      type: "string",
      description: "Work tracker (jira, github, none)",
    },
    harness: {
      type: "string",
      description:
        "Harness platforms, comma-separated (claude, cursor, pi). Default: claude,cursor",
    },
    preset: {
      type: "string",
      description:
        "Configuration preset (starter, standard, full). Default: standard",
      alias: "p",
    },
    "no-tour": {
      type: "boolean",
      description: "Skip the post-init interactive tour",
      default: false,
    },
  },
  async run({ args }) {
    // Setup cleanup handler for SIGINT
    setupCleanupHandler();

    // Detect project context
    const context = await detectProjectContext();

    // Check for existing installation
    if (context.hasLuca) {
      logger.error("Luca is already installed in this project.");
      logger.info("");
      logger.info("To update to the latest version:");
      logger.info("  bunx luca update");
      logger.info("");
      logger.info(
        "To reinitialize from scratch (this will overwrite existing config):",
      );
      logger.info("  rm -rf .planning/ .cursor/luca/ && bunx luca vault:init");
      process.exit(1);
    }

    let config: LucaConfig;

    // Determine mode and get config
    if (args.config) {
      // Config file mode
      logger.info(`Reading config from ${args.config}`);
      try {
        config = await loadConfigFromFile(args.config);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to read config file "${args.config}": ${reason}`);
        logger.info("");
        logger.info("Ensure the config file:");
        logger.info("  - Exists at the specified path");
        logger.info("  - Contains valid JSON");
        logger.info("  - Matches the expected schema (see docs for format)");
        logger.info("");
        logger.info(
          "Example: bunx luca vault:init --config ./luca-config.json",
        );
        process.exit(1);
      }
    } else if (
      args.quick ||
      args.name ||
      args.prefix ||
      args.stack ||
      args.tracker ||
      args.harness ||
      args.preset
    ) {
      // Quick mode or explicit args
      logger.info("Using provided arguments / defaults");
      config = createConfigFromArgs({
        name: args.name,
        prefix: args.prefix,
        stack: args.stack,
        tracker: args.tracker,
        harness: args.harness,
        preset: args.preset,
      });
    } else {
      // Interactive mode
      const wizardResult = await runWizard(context);
      if (!wizardResult) {
        process.exit(0);
      }
      config = wizardResult;
    }

    // Generate files
    const result = await generateFiles({ config });

    if (!result.success) {
      const reason = String(result.error ?? "Unknown error");
      logger.error(`Installation failed: ${reason}`);
      logger.info("");
      logger.info("To recover, try the following:");
      logger.info("  1. Check file permissions in the current directory");
      logger.info("  2. Ensure sufficient disk space is available");
      logger.info("  3. Run `bunx luca vault:init` again");
      logger.info("");
      logger.info(
        "If the problem persists, report a bug at: https://github.com/alecsibilia/luca-framework/issues",
      );
      process.exit(1);
    }

    // Success output
    p.outro(`Luca initialized in this project!`);

    const harnessNames = (config.harnesses ?? ["claude", "cursor"])
      .map((h) => {
        if (h === "claude") return ".claude/";
        if (h === "cursor") return ".cursor/";
        if (h === "pi") return ".pi/";
        return h;
      })
      .join(", ");

    logger.box(`
Next steps:

1. Review .planning/BRAIN.md and customize for your project
2. Run /${config.branding.commandPrefix} to get started
3. Use /${config.branding.commandPrefix}-help for command reference

Files created:
- .planning/config.json (workflow configuration)
- .planning/BRAIN.md (project identity)
- .planning/manifest.json (installation tracking)
- ${harnessNames} (harness-specific files)
    `);

    // Offer interactive tour (unless --quick, --no-tour, or --config)
    if (!args.quick && !args["no-tour"] && !args.config) {
      try {
        const { runTour } = await import("../utils/tour");
        await runTour(config, context, result.stats);
      } catch {
        // Tour errors are non-fatal
      }
    }
  },
});
