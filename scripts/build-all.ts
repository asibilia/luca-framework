#!/usr/bin/env bun

/**
 * build-all.ts — Unified build script for Claude Code + Plugin output
 *
 * Calls generateAllOutputs() to compile every agent, skill, and rule
 * definition in src/ into platform-specific output, then writes the
 * results to .claude/ and dist/plugin/.
 *
 * Usage:
 *   bun run build:all                       # via package.json script
 *   bun ./scripts/build-all.ts              # direct invocation
 *   bun run build:all --force               # override session lock and build
 *   bun run build:all --cleanup-stale-locks # remove lock file without building
 *
 * Output paths:
 *   .claude/agents/*.md
 *   .claude/skills/<name>/SKILL.md
 *   .claude/rules/*.md
 *   dist/plugin/ (complete plugin package)
 */
import { generateAllOutputs, getActiveProfileNames } from "./build-shared";
import { cleanDirectory, cleanSkillsDirectory, ensureDir } from "./build-utils";
import path from "path";
import { resolvePackageRoot } from "../src/shared/__helpers/resolve-package-root";

async function main() {
  // =========================================================================
  // 0. Session lock guard — refuse to build during active sessions
  // =========================================================================
  const forceFlag = process.argv.includes("--force");
  const cleanupFlag = process.argv.includes("--cleanup-stale-locks");
  const packageRoot = resolvePackageRoot();
  const lockPath = path.join(packageRoot, ".claude", ".session-lock");
  const lockFile = Bun.file(lockPath);

  // Handle --cleanup-stale-locks: remove the lock file and exit without building
  if (cleanupFlag) {
    if (await lockFile.exists()) {
      await lockFile.unlink();
      console.log("Session lock removed successfully.");
    } else {
      console.log("No stale lock found.");
    }
    process.exit(0);
  }

  // Sub-agents running inside an active session inherit LUCA_SESSION_ACTIVE=1.
  // They should always be allowed to build (they ARE the session). Blocking them
  // causes freezes when the orchestrator waits on a sub-agent that exited with
  // error due to the lock the parent session created.
  // See docs/decisions/session-lock-bypass.md for full rationale.
  const sessionActive = process.env.LUCA_SESSION_ACTIVE === "1";

  if (await lockFile.exists()) {
    let hoursOld = 0;
    try {
      const lockData = JSON.parse(await lockFile.text());
      const createdAt = new Date(lockData.created_at);
      hoursOld = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);
    } catch {
      // Lock file is malformed — treat as stale
      hoursOld = Infinity;
    }

    // Auto-clean stale locks (>4h old) instead of blocking forever
    if (hoursOld > 4) {
      console.warn(
        `\n⚠ Removing stale session lock (${hoursOld === Infinity ? "malformed" : `${Math.round(hoursOld)}h old`})\n`,
      );
      await Bun.file(lockPath).unlink();
    } else if (sessionActive) {
      // Sub-agent inside the active session — safe to proceed without warning
    } else if (forceFlag) {
      console.warn(
        `\n⚠ Session lock detected (${Math.round(hoursOld)}h old) — proceeding anyway (--force)\n`,
      );
    } else {
      console.error(
        `\nBuild blocked: an active session is in progress (${Math.round(hoursOld)}h old).`,
      );
      console.error("");
      console.error("Recovery options:");
      console.error("  1. Wait for the session to end naturally");
      console.error(
        "  2. Run with --force to override the lock and build anyway",
      );
      console.error(`  3. Manually delete the lock: rm ${lockPath}`);
      console.error(
        "  4. Run with --cleanup-stale-locks to remove the lock without building",
      );
      console.error("");
      console.error("Locks older than 4 hours are automatically removed.\n");
      process.exit(1);
    }
  }

  // =========================================================================
  // 1. Generate all outputs in memory
  // =========================================================================
  const generated = await generateAllOutputs();

  // =========================================================================
  // 2. Define and prepare output directories
  // =========================================================================
  const claudeDir = path.join(packageRoot, ".claude");
  const claudeAgentsDir = path.join(claudeDir, "agents");
  const claudeSkillsDir = path.join(claudeDir, "skills");
  const claudeRulesDir = path.join(claudeDir, "rules");
  const claudeHooksDir = path.join(claudeDir, "hooks");

  const pluginDir = path.join(packageRoot, "dist", "plugin");
  const pluginManifestDir = path.join(pluginDir, ".claude-plugin");
  const pluginAgentsDir = path.join(pluginDir, "agents");
  const pluginSkillsDir = path.join(pluginDir, "skills");
  const pluginCommandsDir = path.join(pluginDir, "commands");
  const pluginHooksDir = path.join(pluginDir, "hooks");
  const pluginScriptsDir = path.join(pluginDir, "scripts");

  // Ensure all output directories exist
  await Promise.all([
    ensureDir(claudeAgentsDir),
    ensureDir(claudeSkillsDir),
    ensureDir(claudeRulesDir),
    ensureDir(claudeHooksDir),
    ensureDir(pluginManifestDir),
    ensureDir(pluginAgentsDir),
    ensureDir(pluginSkillsDir),
    ensureDir(pluginCommandsDir),
    ensureDir(pluginHooksDir),
    ensureDir(pluginScriptsDir),
  ]);

  // Clean stale files before writing
  const [
    removedClaudeAgents,
    removedClaudeSkills,
    removedClaudeRules,
    removedClaudeHooks,
    removedPluginAgents,
    removedPluginSkills,
    removedPluginCommands,
    removedPluginHooks,
    removedPluginScripts,
  ] = await Promise.all([
    cleanDirectory(claudeAgentsDir, [".md"]),
    cleanSkillsDirectory(claudeSkillsDir),
    cleanDirectory(claudeRulesDir, [".md"]),
    cleanDirectory(claudeHooksDir, [".sh"]),
    cleanDirectory(pluginAgentsDir, [".md"]),
    cleanSkillsDirectory(pluginSkillsDir),
    cleanDirectory(pluginCommandsDir, [".md"]),
    cleanDirectory(pluginHooksDir, [".json"]),
    cleanDirectory(pluginScriptsDir, [".sh"]),
  ]);

  const totalRemoved =
    removedClaudeAgents.length +
    removedClaudeSkills.length +
    removedClaudeRules.length +
    removedClaudeHooks.length +
    removedPluginAgents.length +
    removedPluginSkills.length +
    removedPluginCommands.length +
    removedPluginHooks.length +
    removedPluginScripts.length;

  if (totalRemoved)
    console.log(`Cleaned ${totalRemoved} stale files/directories`);

  // =========================================================================
  // 3. Write all generated content to disk
  // =========================================================================
  const projectDir = packageRoot;
  const hookScriptPaths: string[] = [];
  let settingsHooksFragment: string | undefined;

  for (const [relPath, content] of generated) {
    // Special key: settings.json hooks fragment (handled after the loop)
    if (relPath === ".claude/settings.json__hooks") {
      settingsHooksFragment = content;
      continue;
    }

    const absPath = path.join(projectDir, relPath);

    // Ensure parent directory exists (handles skill subdirectories etc.)
    await ensureDir(path.dirname(absPath));

    await Bun.write(absPath, content);

    // Track hook scripts for chmod pass
    if (relPath.endsWith(".sh")) {
      hookScriptPaths.push(absPath);
    }
  }

  // =========================================================================
  // 4. chmod +x on all hook scripts
  // =========================================================================
  for (const scriptPath of hookScriptPaths) {
    const { exitCode } = Bun.spawnSync(["chmod", "+x", scriptPath]);
    if (exitCode !== 0) {
      console.error(`Failed to chmod +x ${scriptPath}`);
    }
  }

  // =========================================================================
  // 5. Merge hooks config into .claude/settings.json
  // =========================================================================
  if (settingsHooksFragment) {
    const settingsPath = path.join(claudeDir, "settings.json");
    let existingSettings: Record<string, unknown> = {};

    // Preserve any existing settings
    try {
      const settingsFile = Bun.file(settingsPath);
      if (await settingsFile.exists()) {
        existingSettings = JSON.parse(await settingsFile.text());
      }
    } catch {
      // File doesn't exist or is invalid JSON -- start fresh
    }

    existingSettings.hooks = JSON.parse(settingsHooksFragment);

    // Add statusLine configuration (camelCase key required by Claude Code)
    existingSettings.statusLine = {
      type: "command",
      command: '"$CLAUDE_PROJECT_DIR"/.claude/statusline.sh',
    };
    // Remove stale lowercase key if present from prior builds
    delete (existingSettings as Record<string, unknown>).statusline;

    await Bun.write(
      settingsPath,
      JSON.stringify(existingSettings, null, 2) + "\n",
    );
  }

  // =========================================================================
  // 6. Build summary
  // =========================================================================
  const keys = [...generated.keys()].filter(
    (k) => k !== ".claude/settings.json__hooks",
  );

  // Derive counts from Map keys
  const claudeAgentCount = keys.filter((k) =>
    k.startsWith(".claude/agents/"),
  ).length;
  const claudeSkillCount = keys.filter((k) =>
    k.startsWith(".claude/skills/"),
  ).length;
  const claudeRuleCount = keys.filter((k) =>
    k.startsWith(".claude/rules/"),
  ).length;
  const claudeHookCount = keys.filter(
    (k) => k.startsWith(".claude/hooks/") && k.endsWith(".sh"),
  ).length;

  const pluginAgentCountVal = keys.filter((k) =>
    k.startsWith("dist/plugin/agents/"),
  ).length;
  const pluginSkillCountVal = keys.filter((k) =>
    k.startsWith("dist/plugin/skills/"),
  ).length;
  const pluginCommandCountVal = keys.filter((k) =>
    k.startsWith("dist/plugin/commands/"),
  ).length;
  const pluginHookCountVal = keys.filter((k) =>
    k.startsWith("dist/plugin/scripts/"),
  ).length;
  const pluginMetaFiles = keys.filter(
    (k) =>
      k.startsWith("dist/plugin/.claude-plugin/") ||
      k.startsWith("dist/plugin/hooks/") ||
      k === "dist/plugin/README.md",
  ).length;

  // Agent/skill/rule counts
  const agentCount = claudeAgentCount;
  const skillCount = claudeSkillCount;
  const ruleCount = claudeRuleCount;

  // Profile summary
  const activeProfiles = await getActiveProfileNames();
  console.log(`\n=== Build All Summary ===`);
  console.log(
    `Profiles: ${activeProfiles.length > 0 ? activeProfiles.join(", ") : "none (opinionated_guidelines disabled)"}`,
  );
  console.log(
    `Agents: ${agentCount} (Claude + plugin = ${agentCount + pluginAgentCountVal} files)`,
  );
  console.log(
    `Skills: ${skillCount} (Claude + plugin = ${skillCount + pluginSkillCountVal} files)`,
  );
  console.log(`Rules:  ${ruleCount}`);
  console.log(`Hooks:  ${claudeHookCount}`);
  console.log(
    `Plugin: ${pluginAgentCountVal} agents, ${pluginSkillCountVal} skills, ${pluginCommandCountVal} commands, ${pluginHookCountVal} hooks + ${pluginMetaFiles} meta files`,
  );
  console.log(`Total:  ${keys.length} files`);

  console.log("\n--- .claude/ ---");
  console.log(`  Agents: ${claudeAgentCount}`);
  console.log(`  Skills: ${claudeSkillCount}`);
  console.log(`  Rules:  ${claudeRuleCount}`);
  console.log(`  Hooks:  ${claudeHookCount}`);

  console.log("\n--- dist/plugin/ ---");
  console.log(`  Agents:   ${pluginAgentCountVal}`);
  console.log(`  Skills:   ${pluginSkillCountVal}`);
  console.log(`  Commands: ${pluginCommandCountVal}`);
  console.log(`  Hooks:    ${pluginHookCountVal}`);
  console.log(`  Meta:     ${pluginMetaFiles} files`);

  // =========================================================================
  // 7. Write build manifest
  // =========================================================================
  const pkgFile = Bun.file(path.join(packageRoot, "package.json"));
  const pkg = JSON.parse(await pkgFile.text());
  const manifest = {
    built_at: new Date().toISOString(),
    output_count: keys.length,
    version: pkg.version ?? "0.0.0",
    counts: {
      agents: agentCount,
      skills: skillCount,
      rules: ruleCount,
      hooks: claudeHookCount,
    },
  };
  await Bun.write(
    path.join(claudeDir, ".build-manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  console.log("\nBuild manifest written to .claude/.build-manifest.json");
}

main().catch((error) => {
  console.error("\n========================================");
  console.error("  BUILD FAILED: build-all");
  console.error("========================================\n");
  console.error("What failed:", error.message || error);
  console.error("\nTroubleshooting:");
  console.error(
    "  1. Ensure all source files in src/ compile: bun build ./src/index.ts",
  );
  console.error(
    "  2. Check that compile functions exist in src/compilers/compile.ts",
  );
  console.error(
    "  3. Verify the registries export correctly from src/*/index.ts",
  );
  console.error("\nStack trace:");
  console.error(error.stack || error);
  process.exit(1);
});
