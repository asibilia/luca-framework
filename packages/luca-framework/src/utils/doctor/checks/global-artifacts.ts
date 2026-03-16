/**
 * Doctor check: global Luca artifact deployment status.
 *
 * Validates that ~/.claude/ exists with expected artifacts (agents, skills,
 * hooks, settings.json) and reads the deploy manifest for version info.
 *
 * @see packages/luca-framework/src/utils/deploy-manifest-writer.ts
 * @see packages/luca-framework/src/utils/luca-home.ts
 */

import { existsSync, readdirSync } from "node:fs";
import { join } from "pathe";

import { readDeployManifest } from "../../deploy-manifest-writer";
import { getLucaHomePaths } from "../../luca-home";

import type { CheckResult, DoctorCheck } from "../types";

/**
 * Known Luca hook script names that should be present in settings.json.
 *
 * Used to verify that settings.json has Luca hooks configured.
 */
const KNOWN_HOOK_SCRIPTS = [
  "session-start.sh",
  "pre-commit-gate.sh",
  "post-edit-typecheck.sh",
  "context-monitor.sh",
];

/**
 * Doctor check: verify global Luca artifacts are deployed to ~/.claude/.
 *
 * Checks:
 * - ~/.claude/ directory exists
 * - Agent .md files in ~/.claude/agents/
 * - Skill directories in ~/.claude/skills/
 * - Hook .sh files in ~/.claude/hooks/
 * - settings.json exists and is parseable with Luca hooks
 * - Deploy manifest version and timestamp
 *
 * Returns:
 * - **pass** if all artifacts present
 * - **warning** if partial deployment
 * - **fail** if ~/.claude/ missing entirely
 *
 * @example
 * ```typescript
 * const result = await globalArtifactsCheck.run();
 * // { name: 'Global Artifacts', status: 'pass', message: '12 agents, 5 skills, 8 hooks (v5.0.0)', ... }
 * ```
 */
export const globalArtifactsCheck: DoctorCheck = {
  name: "Global Artifacts",
  scope: "global",

  async run(): Promise<CheckResult> {
    const { claudeGlobal: claudeDir } = getLucaHomePaths();

    // Check ~/.claude/ exists
    if (!existsSync(claudeDir)) {
      return {
        name: this.name,
        status: "fail",
        message: "~/.claude/ directory not found",
        fixCommand: "luca init",
        details:
          "No global Luca artifacts deployed. Run `luca init` to set up.",
      };
    }

    // Count agents
    const agentsDir = join(claudeDir, "agents");
    const agentCount = existsSync(agentsDir)
      ? readdirSync(agentsDir).filter((f) => f.endsWith(".md")).length
      : 0;

    // Count skills (directories)
    const skillsDir = join(claudeDir, "skills");
    let skillCount = 0;
    if (existsSync(skillsDir)) {
      try {
        skillCount = readdirSync(skillsDir, { withFileTypes: true }).filter(
          (d) => d.isDirectory(),
        ).length;
      } catch {
        // Non-fatal
      }
    }

    // Count hooks
    const hooksDir = join(claudeDir, "hooks");
    const hookCount = existsSync(hooksDir)
      ? readdirSync(hooksDir).filter((f) => f.endsWith(".sh")).length
      : 0;

    // Check settings.json
    const settingsPath = join(claudeDir, "settings.json");
    let settingsValid = false;
    let hasLucaHooks = false;

    if (existsSync(settingsPath)) {
      try {
        const content = await Bun.file(settingsPath).text();
        const settings = JSON.parse(content);
        settingsValid = true;

        // Check if settings has hooks section with known Luca scripts
        if (settings.hooks) {
          const settingsStr = JSON.stringify(settings.hooks);
          hasLucaHooks = KNOWN_HOOK_SCRIPTS.some((script) =>
            settingsStr.includes(script),
          );
        }
      } catch {
        // settings.json exists but is invalid
      }
    }

    // Read deploy manifest
    const homePaths = getLucaHomePaths();
    const manifest = await readDeployManifest(homePaths.manifests);

    const versionStr = manifest ? `v${manifest.package_version}` : "unknown";
    const deployedAt = manifest
      ? new Date(manifest.deployed_at).toLocaleDateString()
      : "unknown";
    const artifactCount = manifest ? Object.keys(manifest.artifacts).length : 0;

    // Determine status
    const hasArtifacts = agentCount > 0 || skillCount > 0 || hookCount > 0;

    if (!hasArtifacts) {
      return {
        name: this.name,
        status: "warning",
        message: "~/.claude/ exists but no Luca artifacts found",
        fixCommand: "luca init",
        details:
          "The ~/.claude/ directory exists but contains no agents, skills, or hooks.",
      };
    }

    // Build details string
    const detailParts = [
      `Agents: ${agentCount}`,
      `Skills: ${skillCount}`,
      `Hooks: ${hookCount}`,
      `Settings: ${settingsValid ? "valid" : "missing/invalid"}`,
      `Luca hooks in settings: ${hasLucaHooks ? "yes" : "no"}`,
      `Manifest: ${manifest ? `${artifactCount} artifacts` : "not found"}`,
      `Version: ${versionStr}`,
      `Deployed: ${deployedAt}`,
    ];

    const warnings: string[] = [];
    if (!settingsValid) warnings.push("settings.json missing or invalid");
    if (!hasLucaHooks) warnings.push("Luca hooks not found in settings.json");
    if (!manifest) warnings.push("deploy manifest not found");

    if (warnings.length > 0) {
      return {
        name: this.name,
        status: "warning",
        message: `${agentCount} agents, ${skillCount} skills, ${hookCount} hooks (${versionStr}) — ${warnings.length} issue(s)`,
        fixCommand: "luca reinit --force",
        details: detailParts.join(", "),
      };
    }

    return {
      name: this.name,
      status: "pass",
      message: `${agentCount} agents, ${skillCount} skills, ${hookCount} hooks (${versionStr})`,
      fixCommand: null,
      details: detailParts.join(", "),
    };
  },
};
