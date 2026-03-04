#!/usr/bin/env bun

/**
 * Luca Observer CLI entry point.
 *
 * Starts the Next.js dev server for the observer dashboard.
 *
 * Usage:
 *   luca-observer                    # Start on port 3456
 *   luca-observer --port 4000        # Custom port
 *   luca-observer --open             # Auto-open browser
 *   luca-observer -d /path/to/project  # Point at different project
 */

import { parseArgs } from "node:util";
import { execSync, spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, "..");

const { values } = parseArgs({
  options: {
    port: { type: "string", short: "p", default: "3456" },
    open: { type: "boolean", short: "o", default: false },
    dir: { type: "string", short: "d" },
    help: { type: "boolean", short: "h", default: false },
  },
  strict: false,
});

if (values.help) {
  console.log(`
  luca-observer — Real-time Luca workflow dashboard

  Usage:
    luca-observer [options]

  Options:
    -p, --port <port>   Port to listen on (default: 3456)
    -o, --open          Auto-open browser
    -d, --dir <path>    Project directory to observe
    -h, --help          Show this help message

  Environment:
    LUCA_OBSERVER_PORT  Default port (overridden by --port)
    LUCA_OBSERVER_DIR   Default project directory (overridden by --dir)
  `);
  process.exit(0);
}

const port = values.port ?? process.env.LUCA_OBSERVER_PORT ?? "3456";
const projectDir = values.dir ?? process.env.LUCA_OBSERVER_DIR ?? process.cwd();

// Set environment for the Next.js app
process.env.LUCA_PROJECT_DIR = projectDir;

console.log(`\n  luca-observer v0.1.0`);
console.log(`  Dashboard: http://localhost:${port}`);
console.log(`  Project:   ${projectDir}\n`);

const args = ["next", "dev", "--port", port];

const child = spawn("bunx", args, {
  cwd: packageRoot,
  stdio: "inherit",
  env: {
    ...process.env,
    LUCA_PROJECT_DIR: projectDir,
  },
});

if (values.open) {
  setTimeout(() => {
    const url = `http://localhost:${port}`;
    try {
      // macOS
      execSync(`open ${url}`, { stdio: "ignore" });
    } catch {
      try {
        // Linux
        execSync(`xdg-open ${url}`, { stdio: "ignore" });
      } catch {
        // Fallback: just print URL
        console.log(`  Open: ${url}`);
      }
    }
  }, 2000);
}

child.on("exit", (code) => {
  process.exit(code ?? 0);
});

process.on("SIGINT", () => {
  child.kill("SIGINT");
});

process.on("SIGTERM", () => {
  child.kill("SIGTERM");
});
