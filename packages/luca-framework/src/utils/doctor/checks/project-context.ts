/**
 * Doctor check: project-level context and configuration.
 *
 * Validates broader project context beyond config field validation:
 * MuninnDB vault configuration, .env presence, state.json, and ROADMAP.md.
 * This is distinct from the `config-validation` check which validates
 * branding/stack/workTracker fields.
 *
 * @see packages/luca-framework/src/utils/doctor/checks/config-validation.ts
 */

import { existsSync } from "node:fs";
import { join } from "pathe";

import { sanitizeJsonParse } from "../../sanitize";

import type { CheckResult, DoctorCheck } from "../types";

/**
 * Doctor check: verify project context files and MuninnDB vault configuration.
 *
 * Checks:
 * - `.planning/config.json` exists (prerequisite for vault check)
 * - `muninn.vault` field in config
 * - `.env` file exists
 * - `.planning/state.json` exists
 * - `.planning/ROADMAP.md` exists
 *
 * Returns:
 * - **pass** if config + vault configured
 * - **warning** if partial (missing some files)
 * - **fail** if no .planning/ directory at all
 *
 * @example
 * ```typescript
 * const result = await projectContextCheck.run();
 * // { name: 'Project Context', status: 'pass', message: 'Vault: luca-framework, state.json + ROADMAP.md present', ... }
 * ```
 */
export const projectContextCheck: DoctorCheck = {
  name: "Project Context",
  scope: "project",

  async run(): Promise<CheckResult> {
    const cwd = process.cwd();
    const planningDir = join(cwd, ".planning");
    const configPath = join(planningDir, "config.json");
    const statePath = join(planningDir, "state.json");
    const roadmapPath = join(planningDir, "ROADMAP.md");
    const envPath = join(cwd, ".env");

    // Check .planning/ directory
    if (!existsSync(planningDir)) {
      return {
        name: this.name,
        status: "fail",
        message: "No .planning/ directory found",
        fixCommand: "luca vault:init",
        details:
          "This does not appear to be a Luca project. Run `luca vault:init` to initialize.",
      };
    }

    // Read vault name from config
    let vaultName: string | null = null;
    if (existsSync(configPath)) {
      try {
        const content = await Bun.file(configPath).text();
        const config = sanitizeJsonParse(content) as Record<string, unknown>;
        const muninn = config.muninn as Record<string, unknown> | undefined;
        if (muninn && typeof muninn.vault === "string") {
          vaultName = muninn.vault;
        }
      } catch {
        // Config unreadable — handled by config-validation check
      }
    }

    // Check individual files
    const hasConfig = existsSync(configPath);
    const hasState = existsSync(statePath);
    const hasRoadmap = existsSync(roadmapPath);
    const hasEnv = existsSync(envPath);

    // Build details
    const detailParts = [
      `config.json: ${hasConfig ? "present" : "missing"}`,
      `vault: ${vaultName ?? "not configured"}`,
      `.env: ${hasEnv ? "present" : "missing"}`,
      `state.json: ${hasState ? "present" : "missing"}`,
      `ROADMAP.md: ${hasRoadmap ? "present" : "missing"}`,
    ];

    // Determine warnings
    const issues: string[] = [];
    if (!hasConfig) issues.push("config.json missing");
    if (!vaultName) issues.push("MuninnDB vault not configured");
    if (!hasState) issues.push("state.json missing");
    if (!hasRoadmap) issues.push("ROADMAP.md missing");

    if (!hasConfig) {
      return {
        name: this.name,
        status: "fail",
        message: ".planning/ exists but config.json missing",
        fixCommand: "luca vault:init",
        details: detailParts.join(", "),
      };
    }

    if (issues.length > 0) {
      const vaultStr = vaultName ? `Vault: ${vaultName}` : "No vault";
      return {
        name: this.name,
        status: "warning",
        message: `${vaultStr} — ${issues.length} issue(s): ${issues.join(", ")}`,
        fixCommand: issues.includes("MuninnDB vault not configured")
          ? 'Add "muninn": { "vault": "your-project" } to .planning/config.json'
          : null,
        details: detailParts.join(", "),
      };
    }

    return {
      name: this.name,
      status: "pass",
      message: `Vault: ${vaultName}, state.json + ROADMAP.md present`,
      fixCommand: null,
      details: detailParts.join(", "),
    };
  },
};
