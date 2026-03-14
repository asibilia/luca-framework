/**
 * post-edit-typecheck — Async type-check after TypeScript file edits.
 *
 * Reads the edited file path from stdin JSON, checks if it is a TypeScript
 * file, and runs tsc --noEmit. Results are delivered on the next turn (async hook).
 *
 * Always exits 0 — type-check is non-blocking feedback.
 *
 * @module post-edit-typecheck
 */

import { existsSync } from "fs";

import {
  guardDedup,
  readStdinJson,
  extractFilePath,
  emitResult,
  exitSuccess,
  projectDir,
} from "./__helpers/hook-io.ts";
import { readRuntime } from "./__helpers/bridge.ts";

// ─── Dedup guard ─────────────────────────────────────────────────────────────
guardDedup("post-edit-typecheck");

// ─── Main ────────────────────────────────────────────────────────────────────

const main = async (): Promise<void> => {
  const data = await readStdinJson();
  const filePath = extractFilePath(data);

  // Exit early if no file path or file doesn't exist
  if (!filePath || !existsSync(filePath)) {
    return exitSuccess();
  }

  // Only type-check TypeScript files
  if (!filePath.endsWith(".ts") && !filePath.endsWith(".tsx")) {
    return exitSuccess();
  }

  // Check if tsconfig.json exists in project root
  const pd = projectDir();
  if (!existsSync(`${pd}/tsconfig.json`)) {
    exitSuccess();
  }

  const runtime = await readRuntime();

  const cmd =
    runtime === "bun"
      ? ["bunx", "--bun", "tsc", "--noEmit"]
      : ["npx", "tsc", "--noEmit"];

  const result = Bun.spawnSync(cmd, {
    stdout: "pipe",
    stderr: "pipe",
    cwd: pd,
    env: {
      ...process.env,
      PATH: `${pd}/node_modules/.bin:${process.env.PATH}`,
    },
  });

  if (result.exitCode !== 0) {
    const output = result.stdout.toString() + result.stderr.toString();
    if (output.trim()) {
      const lines = output.trim().split("\n");
      const totalLines = lines.length;
      const truncated = lines.slice(0, 20).join("\n");
      const suffix =
        totalLines > 20
          ? `\n... (${totalLines} total lines, showing first 20)`
          : "";

      emitResult({
        systemMessage: `TypeScript type errors found after editing ${filePath}:\n${truncated}${suffix}`,
      });
    }
  }

  exitSuccess();
};

await main();
