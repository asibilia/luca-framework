/**
 * Shared runtime detection for Pi extensions.
 *
 * Detects the configured runtime (bun/node) from .planning/config.json
 * and provides command builders for formatter, typecheck, and test runners.
 * Replaces the `read_runtime()` function duplicated across shell scripts.
 *
 * Uses node:fs exclusively — Pi runs on Node.js, not Bun.
 *
 * Source: src/hooks/pi-extensions/__helpers/runtime-detect.ts
 * Deployed to: .pi/extensions/__helpers/runtime-detect.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Supported runtimes for command generation. */
export type Runtime = "bun" | "node";

/**
 * Detect the configured runtime from .planning/config.json.
 *
 * Reads the `runtime` field from config. Falls back to "bun" if the
 * file is missing, unreadable, or contains invalid JSON.
 *
 * @param cwd - Project root directory
 * @returns Detected runtime ("bun" or "node")
 */
export function detectRuntime(cwd: string): Runtime {
  try {
    const configPath = join(cwd, ".planning", "config.json");
    const raw = readFileSync(configPath, "utf-8");
    const config = JSON.parse(raw);
    const rt = config?.runtime;
    if (rt === "node") return "node";
    return "bun";
  } catch {
    return "bun";
  }
}

/**
 * Get the formatter command for the detected runtime.
 *
 * @param rt - Runtime to use
 * @returns Shell command prefix for prettier
 */
export function getFormatterCmd(rt: Runtime): string {
  return rt === "bun" ? "bunx --bun prettier" : "npx prettier";
}

/**
 * Get the TypeScript type-check command for the detected runtime.
 *
 * @param rt - Runtime to use
 * @returns Shell command for tsc --noEmit
 */
export function getTscCmd(rt: Runtime): string {
  return rt === "bun" ? "bunx --bun tsc --noEmit" : "npx tsc --noEmit";
}

/**
 * Get the test runner command for the detected runtime.
 *
 * @param rt - Runtime to use
 * @returns Shell command for running tests
 */
export function getTestCmd(rt: Runtime): string {
  return rt === "bun" ? "bun test" : "npm test";
}
