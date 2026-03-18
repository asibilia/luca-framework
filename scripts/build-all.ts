#!/usr/bin/env bun

/**
 * build-all.ts — Unified build script for Claude Code + Plugin output
 *
 * Chains the two-stage build pipeline for .claude/ output:
 *   Stage 1 (compile): src/ -> templates/harness/claude/ (EJS templates)
 *   Stage 2 (deploy):  templates/harness/claude/ -> .claude/ (resolved)
 *
 * Plugin output (dist/plugin/) is still generated directly from
 * `generateAllOutputs()` since it doesn't go through the template stage.
 *
 * Usage:
 *   bun run build:all                       # via package.json script
 *   bun ./scripts/build-all.ts              # direct invocation
 *   bun run build:all --force               # override session lock and build
 *   bun run build:all --cleanup-stale-locks # remove lock file without building
 *
 * Output paths:
 *   packages/luca-framework/templates/harness/claude/ (intermediate templates)
 *   .claude/agents/*.md
 *   .claude/skills/<name>/SKILL.md
 *   .claude/rules/*.md
 *   dist/plugin/ (complete plugin package)
 */
import { generateAllOutputs, getActiveProfileNames } from "./build-shared";
import {
  cleanDirectory,
  cleanSkillsDirectory,
  ensureDir,
  buildErrorHandler,
} from "./build-utils";
import { generateHooksRegistryJson } from "./generate-hooks-registry-json";
import { runCompile } from "./build-compile";
import { runDeploy } from "./build-deploy";
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
  // 1. Stage 1 — Compile: src/ -> templates/harness/claude/
  // =========================================================================
  console.log("Stage 1: Compiling src/ -> templates/harness/claude/ ...");
  const compileCounts = await runCompile();

  // =========================================================================
  // 2. Stage 2 — Deploy: templates/harness/claude/ -> .claude/
  // =========================================================================
  console.log("\nStage 2: Deploying templates/harness/claude/ -> .claude/ ...");
  const deployCounts = await runDeploy();

  // =========================================================================
  // 3. Plugin output — generated directly (does not use template stage)
  // =========================================================================
  console.log("\nStage 3: Generating dist/plugin/ ...");
  const generated = await generateAllOutputs();

  const pluginDir = path.join(packageRoot, "dist", "plugin");
  const pluginManifestDir = path.join(pluginDir, ".claude-plugin");
  const pluginAgentsDir = path.join(pluginDir, "agents");
  const pluginSkillsDir = path.join(pluginDir, "skills");
  const pluginCommandsDir = path.join(pluginDir, "commands");
  const pluginHooksDir = path.join(pluginDir, "hooks");
  const pluginScriptsDir = path.join(pluginDir, "scripts");

  await Promise.all([
    ensureDir(pluginManifestDir),
    ensureDir(pluginAgentsDir),
    ensureDir(pluginSkillsDir),
    ensureDir(pluginCommandsDir),
    ensureDir(pluginHooksDir),
    ensureDir(pluginScriptsDir),
  ]);

  // Clean plugin stale files
  const [
    removedPluginAgents,
    removedPluginSkills,
    removedPluginCommands,
    removedPluginHooks,
    removedPluginScripts,
  ] = await Promise.all([
    cleanDirectory(pluginAgentsDir, [".md"]),
    cleanSkillsDirectory(pluginSkillsDir),
    cleanDirectory(pluginCommandsDir, [".md"]),
    cleanDirectory(pluginHooksDir, [".json"]),
    cleanDirectory(pluginScriptsDir, [".sh"]),
  ]);

  const pluginRemoved =
    removedPluginAgents.length +
    removedPluginSkills.length +
    removedPluginCommands.length +
    removedPluginHooks.length +
    removedPluginScripts.length;

  if (pluginRemoved) {
    console.log(`Cleaned ${pluginRemoved} stale plugin files/directories`);
  }

  // Write plugin entries from generated Map (only dist/plugin/ keys)
  const pluginHookScriptPaths: string[] = [];

  for (const [relPath, content] of generated) {
    if (!relPath.startsWith("dist/plugin/")) continue;

    const absPath = path.join(packageRoot, relPath);
    await ensureDir(path.dirname(absPath));
    await Bun.write(absPath, content);

    if (relPath.endsWith(".sh")) {
      pluginHookScriptPaths.push(absPath);
    }
  }

  // chmod +x on plugin hook scripts (use chmodSync for consistency with build-compile/deploy)
  const { chmodSync } = await import("node:fs");
  for (const scriptPath of pluginHookScriptPaths) {
    chmodSync(scriptPath, 0o755);
  }

  // =========================================================================
  // 4. Build summary
  // =========================================================================
  const allKeys = [...generated.keys()].filter(
    (k) => k !== ".claude/settings.json__hooks",
  );

  const pluginAgentCountVal = allKeys.filter((k) =>
    k.startsWith("dist/plugin/agents/"),
  ).length;
  const pluginSkillCountVal = allKeys.filter((k) =>
    k.startsWith("dist/plugin/skills/"),
  ).length;
  const pluginCommandCountVal = allKeys.filter((k) =>
    k.startsWith("dist/plugin/commands/"),
  ).length;
  const pluginHookCountVal = allKeys.filter((k) =>
    k.startsWith("dist/plugin/scripts/"),
  ).length;
  const pluginMetaFiles = allKeys.filter(
    (k) =>
      k.startsWith("dist/plugin/.claude-plugin/") ||
      k.startsWith("dist/plugin/hooks/") ||
      k === "dist/plugin/README.md",
  ).length;

  const activeProfiles = await getActiveProfileNames();
  console.log(`\n=== Build All Summary ===`);
  console.log(
    `Profiles: ${activeProfiles.length > 0 ? activeProfiles.join(", ") : "none (opinionated_guidelines disabled)"}`,
  );
  console.log(
    `Agents: ${deployCounts.agents} (Claude + plugin = ${deployCounts.agents + pluginAgentCountVal} files)`,
  );
  console.log(
    `Skills: ${deployCounts.skills} (Claude + plugin = ${deployCounts.skills + pluginSkillCountVal} files)`,
  );
  console.log(`Rules:  ${deployCounts.rules}`);
  console.log(`Hooks:  ${deployCounts.hooks}`);
  console.log(
    `Plugin: ${pluginAgentCountVal} agents, ${pluginSkillCountVal} skills, ${pluginCommandCountVal} commands, ${pluginHookCountVal} hooks + ${pluginMetaFiles} meta files`,
  );

  const totalFiles =
    deployCounts.total +
    allKeys.filter((k) => k.startsWith("dist/plugin/")).length;
  console.log(`Total:  ${totalFiles} files`);

  console.log("\n--- .claude/ ---");
  console.log(`  Agents: ${deployCounts.agents}`);
  console.log(`  Skills: ${deployCounts.skills}`);
  console.log(`  Rules:  ${deployCounts.rules}`);
  console.log(`  Hooks:  ${deployCounts.hooks}`);

  console.log("\n--- dist/plugin/ ---");
  console.log(`  Agents:   ${pluginAgentCountVal}`);
  console.log(`  Skills:   ${pluginSkillCountVal}`);
  console.log(`  Commands: ${pluginCommandCountVal}`);
  console.log(`  Hooks:    ${pluginHookCountVal}`);
  console.log(`  Meta:     ${pluginMetaFiles} files`);

  // =========================================================================
  // 5. Emit hooks registry JSON artifact
  // =========================================================================
  const hooksRegistryPath = await generateHooksRegistryJson();
  console.log(`\nHooks registry written to ${hooksRegistryPath}`);
}

main().catch((error) => buildErrorHandler("build-all", error));
