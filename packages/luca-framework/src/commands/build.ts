import { defineCommand } from "citty";
import { logger } from "../utils/logger";
import { detectRuntimeContext } from "../utils/runtime-context";
import path from "path";

/**
 * CLI command: luca build
 *
 * Global equivalent of `bun run build:all`. Compiles all agent, skill,
 * rule, and hook definitions from src/ into platform-specific output.
 *
 * In monorepo dev mode, this delegates directly to `scripts/build-all.ts`.
 * In a global install, it resolves the package root and runs the same
 * build pipeline from the installed location.
 *
 * Output is written to `{packageRoot}/.claude/` and `{packageRoot}/dist/plugin/`.
 *
 * @example
 * ```bash
 * # Build all outputs (equivalent to bun run build:all)
 * luca build
 *
 * # Force build even if session lock exists
 * luca build --force
 * ```
 */
export const buildCommand = defineCommand({
  meta: {
    name: "build",
    description:
      "Compile agents, skills, rules, and hooks into platform output",
  },
  args: {
    force: {
      type: "boolean",
      description: "Override session lock and build anyway",
      default: false,
    },
  },
  async run({ args }) {
    const ctx = detectRuntimeContext();
    const packageRoot = ctx.packageDir.includes("packages/luca-framework")
      ? path.resolve(ctx.packageDir, "..", "..")
      : ctx.packageDir;

    logger.info(`Building Luca artifacts (mode: ${ctx.mode})...`);
    logger.info(`Package root: ${packageRoot}`);

    const buildScript = path.join(packageRoot, "scripts", "build-all.ts");

    const buildArgs = ["bun", buildScript];
    if (args.force) {
      buildArgs.push("--force");
    }

    const proc = Bun.spawn(buildArgs, {
      cwd: packageRoot,
      stdout: "inherit",
      stderr: "inherit",
      env: {
        ...process.env,
        // Ensure resolvePackageRoot() in the child process resolves correctly
        // even if cwd differs from package root
      },
    });

    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      logger.error(`Build failed with exit code ${exitCode}`);
      process.exit(exitCode);
    }

    logger.success("Build complete.");
  },
});
