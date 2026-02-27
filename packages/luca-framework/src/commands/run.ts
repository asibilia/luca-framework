import { existsSync } from "node:fs";
import { defineCommand } from "citty";
import { resolve, dirname } from "pathe";
import { fileURLToPath } from "node:url";

/**
 * Resolve path to the dist/plugin directory within the installed package.
 *
 * When running from source (src/commands/run.ts) or from dist (dist/commands/run.mjs),
 * navigates up to the package root, then into dist/plugin/.
 *
 * @returns Absolute path to the plugin directory
 */
function resolvePluginDir(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  // From src/commands/ or dist/commands/, go up to package root, then to dist/plugin
  return resolve(currentDir, "..", "..", "dist", "plugin");
}

/**
 * CLI command: luca run:claude
 *
 * Launches Claude Code with the Luca framework plugin loaded via --plugin-dir.
 * Supports --dry-run to preview the command without executing it.
 */
export const runClaudeCommand = defineCommand({
  meta: {
    name: "run:claude",
    description: "Launch Claude Code with the Luca framework plugin loaded",
  },
  args: {
    "dry-run": {
      type: "boolean",
      description: "Print the command without executing it",
      default: false,
    },
  },
  async run({ args }) {
    const pluginDir = resolvePluginDir();

    if (!existsSync(pluginDir)) {
      console.error(`Plugin directory not found: ${pluginDir}`);
      console.error(
        "Run 'luca build && luca build:plugin' to generate the plugin directory.",
      );
      process.exit(1);
    }

    const command = `claude --plugin-dir "${pluginDir}"`;

    if (args["dry-run"]) {
      console.log(`Would run: ${command}`);
      return;
    }

    console.log("Launching Claude Code with Luca plugin...");
    console.log(`Plugin directory: ${pluginDir}`);

    const proc = Bun.spawn(["claude", "--plugin-dir", pluginDir], {
      stdio: ["inherit", "inherit", "inherit"],
    });

    const exitCode = await proc.exited;
    process.exit(exitCode);
  },
});

/**
 * CLI command: luca run:cursor
 *
 * Placeholder for Cursor IDE integration (coming in a future release).
 * Directs users to `luca init` for scaffolding Cursor configuration.
 */
export const runCursorCommand = defineCommand({
  meta: {
    name: "run:cursor",
    description:
      "Launch Cursor IDE with Luca framework configuration (coming soon)",
  },
  async run() {
    console.log("Cursor IDE integration is coming in a future release.");
    console.log(
      "For now, use `luca init` to scaffold Cursor configuration files into your project.",
    );
  },
});
