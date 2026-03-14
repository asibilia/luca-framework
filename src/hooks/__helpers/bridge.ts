/**
 * Typed wrapper around the luca-bridge CLI.
 *
 * Cascading bridge lookup: installed `luca-bridge` binary -> monorepo source
 * `packages/luca-framework/src/state/bridge.ts` -> skip silently.
 *
 * Port of `run_bridge()` from common.sh. All calls are fire-and-forget —
 * errors are swallowed silently and an empty string is returned.
 *
 * @module bridge
 */

import { projectDir } from "./hook-io.ts";

/**
 * Runs a luca-bridge CLI command with cascading lookup.
 *
 * 1. Checks for `luca-bridge` in PATH
 * 2. Falls back to monorepo source at `packages/luca-framework/src/state/bridge.ts`
 * 3. Returns empty string if neither is available
 *
 * Never throws — all errors are swallowed silently.
 *
 * @param args - CLI arguments to pass to luca-bridge (e.g., `['snapshot']`, `['read-status']`)
 * @returns stdout string from bridge execution, or empty string on any error
 */
export const runBridge = async (args: string[]): Promise<string> => {
  try {
    // Try installed binary first
    const binResult = Bun.spawnSync(["luca-bridge", ...args], {
      stdout: "pipe",
      stderr: "pipe",
      cwd: projectDir(),
    });
    if (binResult.exitCode === 0) {
      return binResult.stdout.toString().trim();
    }
  } catch {
    // luca-bridge not in PATH — try monorepo source
  }

  try {
    const bridgePath = `${projectDir()}/packages/luca-framework/src/state/bridge.ts`;
    const file = Bun.file(bridgePath);
    if (await file.exists()) {
      const srcResult = Bun.spawnSync(["bun", "run", bridgePath, ...args], {
        stdout: "pipe",
        stderr: "pipe",
        cwd: projectDir(),
      });
      if (srcResult.exitCode === 0) {
        return srcResult.stdout.toString().trim();
      }
    }
  } catch {
    // Monorepo source not available — skip silently
  }

  return "";
};

/**
 * Reads runtime from .planning/config.json, with fallback to PATH detection.
 *
 * Port of `read_runtime()` from common.sh.
 *
 * @returns "bun" or "node"
 */
export const readRuntime = async (): Promise<"bun" | "node"> => {
  try {
    const configPath = `${projectDir()}/.planning/config.json`;
    const file = Bun.file(configPath);
    if (await file.exists()) {
      const config = JSON.parse(await file.text());
      if (config.runtime === "bun" || config.runtime === "node") {
        return config.runtime;
      }
    }
  } catch {
    // Config not available — fall through to detection
  }

  // Fallback: detect from PATH
  const bunCheck = Bun.spawnSync(["which", "bun"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (bunCheck.exitCode === 0) return "bun";

  const nodeCheck = Bun.spawnSync(["which", "node"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (nodeCheck.exitCode === 0) return "node";

  return "bun";
};

/**
 * Reads session_id from .planning/state.json.
 *
 * Port of `read_session_id()` from common.sh.
 *
 * @returns Session ID string, or empty string if not available
 */
export const readSessionId = async (): Promise<string> => {
  try {
    const stateFile = `${projectDir()}/.planning/state.json`;
    const file = Bun.file(stateFile);
    if (await file.exists()) {
      const state = JSON.parse(await file.text());
      return state.context?.session_id || "";
    }
  } catch {
    // state.json not available or malformed
  }
  return "";
};
