/**
 * CLI command: luca run
 *
 * Launches the luca-mastracode harness (custom Mastra Code distribution).
 * Detects whether running in monorepo dev mode or as a global/workspace install,
 * resolves the harness binary accordingly, and spawns it with passthrough args.
 *
 * Shows a passive update notification (24h cache) before launch.
 *
 * @example
 * ```bash
 * luca run                     # Launch harness with defaults
 * luca run --dry-run           # Show what would be launched without running
 * ```
 */
import { defineCommand } from "citty";
import { existsSync } from "node:fs";
import { join } from "pathe";

import { detectRuntimeContext, resolveMonorepoRoot } from "../utils/runtime-context";
import { checkForUpdates } from "../utils/version-check";
import { logger } from "../utils/logger";

/**
 * Resolve the path to the luca-mastracode entry point.
 *
 * In monorepo dev mode, resolves to `packages/luca-mastracode/src/index.ts`.
 * In global/workspace mode, resolves to the `luca` bin in `node_modules/.bin/`.
 */
function resolveHarnessPath(): { command: string; args: string[] } | null {
  const ctx = detectRuntimeContext();

  if (ctx.mode === "dev") {
    const monorepoRoot = resolveMonorepoRoot(ctx.packageDir);
    const devEntry = join(monorepoRoot, "packages/luca-mastracode/src/index.ts");

    if (existsSync(devEntry)) {
      return { command: "bun", args: ["run", devEntry] };
    }
  }

  // Workspace/global: resolve the luca-mastracode harness entry point.
  const binPaths = [
    join(process.cwd(), "node_modules/@alecsibilia/luca-mastracode/src/index.ts"),
    join(process.cwd(), "node_modules/@alecsibilia/luca-mastracode/dist/index.mjs"),
  ];

  for (const binPath of binPaths) {
    if (existsSync(binPath)) {
      return { command: "bun", args: ["run", binPath] };
    }
  }

  return null;
}

export const runCommand = defineCommand({
  meta: {
    name: "run",
    description: "Launch the Luca Mastra Code harness",
  },
  args: {
    "dry-run": {
      type: "boolean",
      default: false,
      description: "Show the resolved harness command without launching it",
    },
  },
  async run({ args }) {
    // Passive update notification — fire-and-forget so harness launch is never delayed
    void checkForUpdates().catch(() => {});

    const resolved = resolveHarnessPath();

    if (!resolved) {
      logger.error(
        "Could not locate luca-mastracode harness.\n" +
          "  • In monorepo dev mode: ensure packages/luca-mastracode/ exists\n" +
          '  • As installed package: ensure the `luca` package is in your dependencies\n' +
          "    (npm install luca / bun add luca)",
      );
      process.exit(1);
    }

    const fullArgs = [...resolved.args];

    if (args["dry-run"]) {
      logger.info(`Would run: ${resolved.command} ${fullArgs.join(" ")}`);
      return;
    }

    logger.info("Launching Luca Mastra Code harness...");

    const proc = Bun.spawn([resolved.command, ...fullArgs], {
      stdio: ["inherit", "inherit", "inherit"],
      env: { ...process.env },
    });

    const exitCode = await proc.exited;
    process.exit(exitCode);
  },
});
