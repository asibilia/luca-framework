/**
 * Doctor check: Luca framework runtime availability.
 *
 * Validates that the luca-bridge CLI is available on PATH and that
 * the ~/.luca/ directory structure exists. Optionally checks whether
 * the state machine is initialized by running `luca-bridge read-status`.
 *
 * @see packages/luca-framework/src/utils/luca-home.ts
 */

import { existsSync } from "node:fs";

import { getLucaHomePaths } from "../../luca-home";

import type { CheckResult, DoctorCheck } from "../types";

/**
 * Doctor check: verify Luca framework runtime components are available.
 *
 * Checks:
 * - `luca-bridge` is on PATH (via `Bun.which()`)
 * - If found, runs `luca-bridge read-status` to check state machine
 * - `~/.luca/` directory structure exists (root, bin, manifests, backups)
 *
 * Returns:
 * - **pass** if bridge available and state initialized
 * - **warning** if bridge missing but ~/.luca/ exists
 * - **fail** if ~/.luca/ missing entirely
 *
 * @example
 * ```typescript
 * const result = await frameworkRuntimeCheck.run();
 * // { name: 'Framework Runtime', status: 'pass', message: 'Bridge available, state initialized', ... }
 * ```
 */
export const frameworkRuntimeCheck: DoctorCheck = {
  name: "Framework Runtime",
  scope: "global",

  async run(): Promise<CheckResult> {
    const homePaths = getLucaHomePaths();

    // Check ~/.luca/ directory structure
    const rootExists = existsSync(homePaths.root);
    const binExists = existsSync(homePaths.bin);
    const manifestsExists = existsSync(homePaths.manifests);
    const backupsExists = existsSync(homePaths.backups);

    if (!rootExists) {
      return {
        name: this.name,
        status: "fail",
        message: "~/.luca/ directory not found",
        fixCommand: "luca init",
        details:
          "Luca home directory does not exist. Run `luca init` to create it.",
      };
    }

    const missingDirs: string[] = [];
    if (!binExists) missingDirs.push("bin");
    if (!manifestsExists) missingDirs.push("manifests");
    if (!backupsExists) missingDirs.push("backups");

    // Check luca-bridge on PATH
    const bridgePath = Bun.which("luca-bridge");
    const bridgeAvailable = bridgePath !== null;

    // If bridge is available, try to read state machine status
    let stateInitialized = false;
    if (bridgeAvailable) {
      try {
        const result = await Bun.$`luca-bridge read-status`.quiet().nothrow();
        if (result.exitCode === 0) {
          const output = result.stdout.toString().trim();
          if (output) {
            const status = JSON.parse(output);
            stateInitialized = status.initialized !== false;
          }
        }
      } catch {
        // Bridge exists but read-status failed — not critical
      }
    }

    // Build details
    const detailParts = [
      `~/.luca/ root: ${rootExists ? "exists" : "missing"}`,
      `bin: ${binExists ? "exists" : "missing"}`,
      `manifests: ${manifestsExists ? "exists" : "missing"}`,
      `backups: ${backupsExists ? "exists" : "missing"}`,
      `luca-bridge: ${bridgeAvailable ? bridgePath : "not on PATH"}`,
      `State machine: ${stateInitialized ? "initialized" : "not initialized"}`,
    ];

    if (missingDirs.length > 0) {
      return {
        name: this.name,
        status: "warning",
        message: `~/.luca/ exists but missing subdirectories: ${missingDirs.join(", ")}`,
        fixCommand: "luca init",
        details: detailParts.join(", "),
      };
    }

    if (!bridgeAvailable) {
      return {
        name: this.name,
        status: "warning",
        message: "~/.luca/ exists but luca-bridge not on PATH",
        fixCommand: "Ensure ~/.luca/bin is on your PATH",
        details: detailParts.join(", "),
      };
    }

    if (!stateInitialized) {
      return {
        name: this.name,
        status: "warning",
        message: "Bridge available but state machine not initialized",
        fixCommand: "luca-bridge ensure-init",
        details: detailParts.join(", "),
      };
    }

    return {
      name: this.name,
      status: "pass",
      message: "Bridge available, state machine initialized",
      fixCommand: null,
      details: detailParts.join(", "),
    };
  },
};
