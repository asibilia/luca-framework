#!/usr/bin/env bun

/**
 * build-deploy.ts — Deploy templates to dist/claude/ with branding resolution.
 *
 * Stage 2 of the split build pipeline. Reads EJS templates from
 * `packages/luca-framework/templates/harness/claude/`, resolves
 * branding placeholders using config from `.planning/config.json`,
 * and writes the final resolved files to `dist/claude/`.
 *
 * This stage is the same code path that `luca init` will use,
 * ensuring consistent resolution between dogfood builds and
 * end-user installations.
 *
 * Usage:
 *   bun run build:deploy                    # via package.json script
 *   bun ./scripts/build-deploy.ts           # direct invocation
 *
 * Output:
 *   dist/claude/agents/*.md
 *   dist/claude/skills/<name>/SKILL.md
 *   dist/claude/rules/*.md
 *   dist/claude/hooks/*.sh
 *   dist/claude/.build-manifest.json
 *
 * @module build-deploy
 */

import path from "path";
import { chmodSync } from "node:fs";

// resolveTemplates is imported via the scripts/ shim (./resolve-templates)
// which re-exports from packages/luca-framework/src/utils/resolve-templates.ts.
// This indirection exists so both build scripts and the npm package share
// the same canonical implementation.
import { resolveTemplates } from "./resolve-templates";
import type { BrandingContext } from "./resolve-templates";
import {
  cleanDirectory,
  cleanSkillsDirectory,
  ensureDir,
  computeOutputCounts,
  buildErrorHandler,
} from "./build-utils";
import { resolvePackageRoot } from "../src/shared/__helpers/resolve-package-root";
import { defaultBranding, validateBranding } from "./branding";
import { sanitizeJsonParse } from "./sanitize";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEMPLATE_SOURCE_DIR = path.join(
  resolvePackageRoot(),
  "packages",
  "luca-framework",
  "templates",
  "harness",
  "claude",
);

// ---------------------------------------------------------------------------
// Config loading
// ---------------------------------------------------------------------------

/**
 * Read branding config from `.planning/config.json` and compute derived values.
 *
 * Falls back to Luca defaults if the config file is missing or malformed.
 *
 * @returns Complete BrandingContext ready for template resolution
 */
async function loadBrandingContext(): Promise<BrandingContext> {
  const configPath = path.join(
    resolvePackageRoot(),
    ".planning",
    "config.json",
  );

  let frameworkName = defaultBranding.frameworkName;
  let commandPrefix = defaultBranding.commandPrefix;
  let ticketPattern = defaultBranding.ticketPattern;
  let placeholderTicket = defaultBranding.placeholderTicket;

  try {
    const configFile = Bun.file(configPath);
    if (await configFile.exists()) {
      const raw = sanitizeJsonParse(await configFile.text()) as Record<
        string,
        unknown
      >;
      const branding = (raw as Record<string, unknown>)?.branding as
        | Record<string, string>
        | undefined;
      if (branding) {
        frameworkName = branding.frameworkName ?? frameworkName;
        commandPrefix = branding.commandPrefix ?? commandPrefix;
        ticketPattern = branding.ticketPattern ?? ticketPattern;
        placeholderTicket = branding.placeholderTicket ?? placeholderTicket;
      }
    }
  } catch {
    console.warn(
      "Warning: Could not read .planning/config.json, using default branding",
    );
  }

  // Validate resolved branding values (non-blocking: warn + continue on failure)
  const validationResult = validateBranding({
    frameworkName,
    commandPrefix,
    ticketPattern,
    placeholderTicket,
  });
  if (!validationResult.valid) {
    console.warn(
      "Warning: Branding validation failed, continuing with current values:",
    );
    for (const [field, message] of Object.entries(validationResult.errors)) {
      console.warn(`  ${field}: ${message}`);
    }
  }

  return {
    frameworkName,
    commandPrefix,
    commandSlash: `/${commandPrefix}`,
    nameLowercase: frameworkName.toLowerCase(),
    nameUppercase: frameworkName.toUpperCase(),
    ticketPattern,
    placeholderTicket,
    ticketPatternJson: ticketPattern.replace(/\\/g, "\\\\"),
  };
}

// ---------------------------------------------------------------------------
// Main deploy function
// ---------------------------------------------------------------------------

/**
 * Run the deploy stage: templates/harness/claude/ -> dist/claude/.
 *
 * 1. Reads branding from .planning/config.json
 * 2. Resolves all templates with branding context
 * 3. Cleans dist/claude/ subdirectories (agents/, skills/, rules/, hooks/)
 * 4. Writes resolved files to dist/claude/
 * 5. chmod +x on .sh files
 * 6. (Skipped) settings.json merge is deferred to deploy-global.ts
 * 7. Writes build manifest
 *
 * @returns Object with deploy counts
 */
export async function runDeploy(): Promise<{
  agents: number;
  skills: number;
  rules: number;
  hooks: number;
  total: number;
}> {
  const packageRoot = resolvePackageRoot();
  const claudeDir = path.join(packageRoot, "dist", "claude");

  // =========================================================================
  // 1. Load branding context
  // =========================================================================
  const branding = await loadBrandingContext();

  // =========================================================================
  // 2. Resolve templates
  // =========================================================================
  const resolved = await resolveTemplates(TEMPLATE_SOURCE_DIR, branding);

  // =========================================================================
  // 3. Clean dist/claude/ subdirectories before writing
  // =========================================================================
  const claudeAgentsDir = path.join(claudeDir, "agents");
  const claudeSkillsDir = path.join(claudeDir, "skills");
  const claudeRulesDir = path.join(claudeDir, "rules");
  const claudeHooksDir = path.join(claudeDir, "hooks");

  await Promise.all([
    ensureDir(claudeAgentsDir),
    ensureDir(claudeSkillsDir),
    ensureDir(claudeRulesDir),
    ensureDir(claudeHooksDir),
  ]);

  const [removedAgents, removedSkills, removedRules, removedHooks] =
    await Promise.all([
      cleanDirectory(claudeAgentsDir, [".md"]),
      cleanSkillsDirectory(claudeSkillsDir),
      cleanDirectory(claudeRulesDir, [".md"]),
      cleanDirectory(claudeHooksDir, [".sh"]),
    ]);

  const totalRemoved =
    removedAgents.length +
    removedSkills.length +
    removedRules.length +
    removedHooks.length;

  if (totalRemoved) {
    console.log(`Cleaned ${totalRemoved} stale files/directories`);
  }

  // =========================================================================
  // 4. Write resolved files to dist/claude/
  // =========================================================================
  const hookScriptPaths: string[] = [];

  for (const [relPath, content] of resolved) {
    // Skip settings.json — merge is handled by deploy-global.ts
    if (relPath === "settings.json") {
      continue;
    }

    const absPath = path.join(claudeDir, relPath);
    if (!path.resolve(absPath).startsWith(path.resolve(claudeDir) + "/")) {
      throw new Error(`Path traversal detected: ${relPath}`);
    }
    await ensureDir(path.dirname(absPath));
    await Bun.write(absPath, content);

    if (relPath.endsWith(".sh")) {
      hookScriptPaths.push(absPath);
    }
  }

  // =========================================================================
  // 5. chmod +x on .sh files
  // =========================================================================
  for (const scriptPath of hookScriptPaths) {
    chmodSync(scriptPath, 0o755);
  }

  // =========================================================================
  // 6. Merge settings.json — SKIPPED for source repo
  // =========================================================================
  // Settings.json merge is handled by deploy-global.ts when deploying to
  // ~/.claude/. The build stage writes to dist/claude/ which is a staging
  // area, not a live Claude Code config directory.
  // The resolved settings template is intentionally not written here.

  // =========================================================================
  // 7. Write build manifest
  // =========================================================================
  const pkgFile = Bun.file(path.join(packageRoot, "package.json"));
  const pkg = JSON.parse(await pkgFile.text());
  const keys = [...resolved.keys()].filter((k) => k !== "settings.json");

  const counts = computeOutputCounts(keys);

  const manifest = {
    built_at: new Date().toISOString(),
    output_count: counts.total,
    version: pkg.version ?? "0.0.0",
    counts: {
      agents: counts.agents,
      skills: counts.skills,
      rules: counts.rules,
      hooks: counts.hooks,
    },
  };

  await Bun.write(
    path.join(claudeDir, ".build-manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );

  // =========================================================================
  // 8. Print summary
  // =========================================================================
  console.log(`\n=== Build Deploy Summary ===`);
  console.log(
    `  Branding: ${branding.frameworkName} (prefix: ${branding.commandPrefix})`,
  );
  console.log(`  Agents:   ${counts.agents}`);
  console.log(`  Skills:   ${counts.skills}`);
  console.log(`  Rules:    ${counts.rules}`);
  console.log(`  Hooks:    ${counts.hooks}`);
  console.log(`  Total:    ${counts.total} files -> dist/claude/`);
  console.log(`  Manifest: dist/claude/.build-manifest.json`);

  return counts;
}

// ---------------------------------------------------------------------------
// Direct invocation
// ---------------------------------------------------------------------------
if (import.meta.main) {
  runDeploy().catch((error) => buildErrorHandler("build-deploy", error));
}
