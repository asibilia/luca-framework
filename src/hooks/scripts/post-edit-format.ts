/**
 * post-edit-format — Auto-format files after Edit/Write operations.
 *
 * Reads the edited file path from stdin JSON, determines the appropriate
 * formatter based on file extension, and runs it in-place.
 *
 * Always exits 0 — formatting is non-blocking feedback.
 *
 * @module post-edit-format
 */

import { existsSync } from "fs";
import { resolve } from "path";

import {
  guardDedup,
  readStdinJson,
  extractFilePath,
  exitSuccess,
  projectDir,
} from "../__helpers/hook-io.ts";
import { readRuntime } from "../__helpers/bridge.ts";

// ─── Dedup guard ─────────────────────────────────────────────────────────────
guardDedup("post-edit-format");

// ─── Main ────────────────────────────────────────────────────────────────────

const main = async (): Promise<void> => {
  const data = await readStdinJson();
  const filePath = extractFilePath(data);

  // Exit early if no file path
  if (!filePath) {
    return exitSuccess();
  }

  // Path boundary check: resolved path must be within projectDir
  const pd = projectDir();
  const resolved = resolve(filePath);
  if (!resolved.startsWith(pd + "/")) {
    return exitSuccess();
  }

  // Exit early if file doesn't exist
  if (!existsSync(resolved)) {
    return exitSuccess();
  }

  // Determine file extension
  const ext = resolved.split(".").pop()?.toLowerCase() ?? "";

  // Extensions that Prettier can format
  const formattableExtensions = new Set([
    "ts",
    "tsx",
    "js",
    "jsx",
    "mjs",
    "cjs",
    "json",
    "css",
    "scss",
    "less",
    "html",
    "htm",
    "md",
    "mdx",
    "yaml",
    "yml",
  ]);

  if (!formattableExtensions.has(ext)) {
    return exitSuccess();
  }

  const runtime = await readRuntime();

  const cmd: string[] =
    runtime === "bun"
      ? ["bunx", "--bun", "prettier", "--write", resolved]
      : ["npx", "prettier", "--write", resolved];

  try {
    Bun.spawnSync(cmd, {
      stdout: "pipe",
      stderr: "pipe",
      cwd: pd,
      env: {
        ...process.env,
        PATH: `${projectDir()}/node_modules/.bin:${process.env.PATH}`,
      },
    });
  } catch {
    // Formatting failure is non-blocking
  }

  exitSuccess();
};

await main();
