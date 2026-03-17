#!/usr/bin/env bun

/**
 * build-deploy.ts — Deploy templates to .claude/ with branding resolution.
 *
 * Stage 2 of the split build pipeline. Reads EJS templates from
 * `packages/luca-framework/templates/harness/claude/`, resolves
 * branding placeholders using config from `.planning/config.json`,
 * and writes the final resolved files to `.claude/`.
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
 *   .claude/agents/*.md
 *   .claude/skills/<name>/SKILL.md
 *   .claude/rules/*.md
 *   .claude/hooks/*.sh
 *   .claude/settings.json (hooks merged)
 *   .claude/.build-manifest.json
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
import { cleanDirectory, cleanSkillsDirectory, ensureDir } from "./build-utils";
import { resolvePackageRoot } from "../src/shared/__helpers/resolve-package-root";
import { defaultBranding } from "../packages/luca-framework/src/utils/branding";
import { sanitizeJsonParse } from "../packages/luca-framework/src/utils/sanitize";

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
 * Run the deploy stage: templates/harness/claude/ -> .claude/.
 *
 * 1. Reads branding from .planning/config.json
 * 2. Resolves all templates with branding context
 * 3. Cleans .claude/ subdirectories (agents/, skills/, rules/, hooks/)
 * 4. Writes resolved files to .claude/
 * 5. chmod +x on .sh files
 * 6. Handles settings.json (merges hooks from resolved output with existing)
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
  const claudeDir = path.join(packageRoot, ".claude");

  // =========================================================================
  // 1. Load branding context
  // =========================================================================
  const branding = await loadBrandingContext();

  // =========================================================================
  // 2. Resolve templates
  // =========================================================================
  const resolved = await resolveTemplates(TEMPLATE_SOURCE_DIR, branding);

  // =========================================================================
  // 3. Clean .claude/ subdirectories before writing
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
  // 4. Write resolved files to .claude/
  // =========================================================================
  const hookScriptPaths: string[] = [];
  let resolvedSettingsJson: string | undefined;

  for (const [relPath, content] of resolved) {
    // Intercept settings.json for special merge handling
    if (relPath === "settings.json") {
      resolvedSettingsJson = content;
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
  // 6. Merge settings.json
  // =========================================================================
  if (resolvedSettingsJson) {
    const settingsPath = path.join(claudeDir, "settings.json");
    let existingSettings: Record<string, unknown> = {};

    try {
      const settingsFile = Bun.file(settingsPath);
      if (await settingsFile.exists()) {
        existingSettings = JSON.parse(await settingsFile.text());
      }
    } catch {
      // File doesn't exist or is invalid JSON -- start fresh
    }

    // Parse the resolved settings (which already has hooks merged from compile stage)
    const resolvedSettings = JSON.parse(resolvedSettingsJson);

    // Merge: resolved hooks + statusLine override existing
    if (resolvedSettings.hooks) {
      existingSettings.hooks = resolvedSettings.hooks;
    }
    if (resolvedSettings.statusLine) {
      existingSettings.statusLine = resolvedSettings.statusLine;
    }
    // Remove stale lowercase key if present from prior builds
    delete (existingSettings as Record<string, unknown>).statusline;

    await Bun.write(
      settingsPath,
      JSON.stringify(existingSettings, null, 2) + "\n",
    );
  }

  // =========================================================================
  // 7. Write build manifest
  // =========================================================================
  const pkgFile = Bun.file(path.join(packageRoot, "package.json"));
  const pkg = JSON.parse(await pkgFile.text());
  const keys = [...resolved.keys()].filter((k) => k !== "settings.json");

  const counts = {
    agents: keys.filter((k) => k.startsWith("agents/")).length,
    skills: keys.filter((k) => k.startsWith("skills/")).length,
    rules: keys.filter((k) => k.startsWith("rules/")).length,
    hooks: keys.filter((k) => k.startsWith("hooks/") && k.endsWith(".sh"))
      .length,
    total: keys.length,
  };

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
  console.log(`  Total:    ${counts.total} files -> .claude/`);
  console.log(`  Manifest: .claude/.build-manifest.json`);

  return counts;
}

// ---------------------------------------------------------------------------
// Direct invocation
// ---------------------------------------------------------------------------
if (import.meta.main) {
  runDeploy().catch((error) => {
    console.error("\n========================================");
    console.error("  BUILD FAILED: build-deploy");
    console.error("========================================\n");
    console.error("What failed:", error.message || error);
    console.error("\nStack trace:");
    console.error(error.stack || error);
    process.exit(1);
  });
}
