#!/usr/bin/env bun
/**
 * deploy-global.ts — Deploy Luca artifacts to ~/.claude/ for global availability
 *
 * Makes agents, skills, hooks, and rules available in any repository by
 * installing them into the user-level Claude Code configuration directory.
 *
 * Usage:
 *   bun scripts/deploy-global.ts              # symlinks (default)
 *   bun scripts/deploy-global.ts --copy       # file copies
 *   bun scripts/deploy-global.ts --dry-run    # preview what would happen
 *   bun scripts/deploy-global.ts --remove     # uninstall global artifacts
 *
 * Prerequisites:
 *   - Must be run from the luca-framework monorepo root
 *   - Must run `bun run build:all` first to generate .claude/ artifacts
 *   - Must NOT be run inside an active Claude Code session
 *
 * @see docs/global-installation.md for full documentation
 */

import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import { join, relative, basename, dirname } from "path";

// ─── Constants ──────────────────────────────────────────────────────────────

const HOME = process.env.HOME ?? Bun.env.HOME ?? "";
const GLOBAL_DIR = join(HOME, ".claude");
const MANIFEST_PATH = join(GLOBAL_DIR, ".luca-deploy-manifest.json");

/** Rules that are universal (not framework-specific). */
const UNIVERSAL_RULES = new Set([
  "api-snake-case.md",
  "bun-preference.md",
  "cursor-rules.md",
  "file-naming.md",
  "functional-api-reuse.md",
  "import-standards.md",
  "lodash-preference.md",
  "mandatory-documentation.md",
  "no-classes.md",
  "schema-first-parsing.md",
]);

/** Hook scripts to skip during global deploy (framework-specific). */
const SKIP_HOOKS = new Set(["pre-commit-drift-check.sh"]);

// ─── CLI Parsing ────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const copyMode = args.includes("--copy");
const removeMode = args.includes("--remove");

// ─── Helpers ────────────────────────────────────────────────────────────────

const log = (msg: string) => console.log(`  ${msg}`);
const logHeader = (msg: string) => console.log(`\n→ ${msg}`);
const logDry = (msg: string) => console.log(`  [dry-run] ${msg}`);

/**
 * Symlink or copy a file. In copy mode, always copies.
 * In symlink mode, creates a symlink from target → source.
 */
function deployFile(source: string, target: string, forceCopy = false): void {
  const mode = forceCopy || copyMode ? "copy" : "symlink";

  if (dryRun) {
    logDry(`${mode}: ${relative(process.cwd(), source)} → ${target}`);
    return;
  }

  // Ensure parent directory exists
  mkdirSync(dirname(target), { recursive: true });

  // Remove existing file/symlink
  try {
    if (existsSync(target)) {
      unlinkSync(target);
    }
  } catch {
    // Target doesn't exist — fine
  }

  if (mode === "symlink") {
    symlinkSync(source, target);
    log(`symlink: ${basename(target)}`);
  } else {
    const content = readFileSync(source);
    writeFileSync(target, content);
    log(`copy: ${basename(target)}`);
  }
}

/**
 * Symlink or copy an entire directory.
 */
function deployDir(source: string, target: string, forceCopy = false): void {
  const mode = forceCopy || copyMode ? "copy" : "symlink";

  if (dryRun) {
    logDry(`${mode} dir: ${relative(process.cwd(), source)} → ${target}`);
    return;
  }

  mkdirSync(dirname(target), { recursive: true });

  // Remove existing
  try {
    if (existsSync(target)) {
      const stat = lstatSync(target);
      if (stat.isSymbolicLink()) {
        unlinkSync(target);
      } else {
        rmSync(target, { recursive: true });
      }
    }
  } catch {
    // Doesn't exist — fine
  }

  if (mode === "symlink") {
    symlinkSync(source, target);
    log(`symlink dir: ${basename(target)}/`);
  } else {
    // Copy directory recursively
    copyDirRecursive(source, target);
    log(`copy dir: ${basename(target)}/`);
  }
}

/**
 * Recursively copy a directory.
 */
function copyDirRecursive(source: string, target: string): void {
  mkdirSync(target, { recursive: true });
  const entries = readdirSync(source, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(source, entry.name);
    const tgtPath = join(target, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, tgtPath);
    } else {
      writeFileSync(tgtPath, readFileSync(srcPath));
    }
  }
}

// ─── Pre-flight Checks ─────────────────────────────────────────────────────

async function preflight(): Promise<string> {
  console.log("Luca Global Deploy");
  console.log("==================");

  // Check we're in the monorepo root
  const projectRoot = process.cwd();
  if (!existsSync(join(projectRoot, "packages/luca-framework"))) {
    console.error("Error: Must be run from the luca-framework monorepo root.");
    process.exit(1);
  }

  // Check build artifacts exist
  const claudeAgentsDir = join(projectRoot, ".claude/agents");
  if (!existsSync(claudeAgentsDir)) {
    console.error(
      "Error: .claude/agents/ not found. Run `bun run build:all` first.",
    );
    process.exit(1);
  }

  // Check ~/.claude/ exists
  if (!existsSync(GLOBAL_DIR)) {
    console.error(
      `Error: ${GLOBAL_DIR} does not exist. Is Claude Code installed?`,
    );
    process.exit(1);
  }

  // Check not inside an active session
  if (process.env.LUCA_SESSION_ACTIVE === "1") {
    console.error(
      "Error: Active Claude Code session detected (LUCA_SESSION_ACTIVE=1).\n" +
        "Stop the session first, then run this script.",
    );
    process.exit(1);
  }

  if (dryRun) {
    console.log("\nMode: DRY RUN (no changes will be made)");
  } else if (removeMode) {
    console.log("\nMode: REMOVE (uninstalling global artifacts)");
  } else {
    console.log(`\nMode: ${copyMode ? "COPY" : "SYMLINK"}`);
  }

  return projectRoot;
}

// ─── Phase: Install luca-bridge globally ────────────────────────────────────

async function installBridge(projectRoot: string): Promise<void> {
  logHeader("Installing luca-bridge globally via bun link...");

  if (dryRun) {
    logDry("cd packages/luca-framework && bun link");
    return;
  }

  const proc = Bun.spawn(["bun", "link"], {
    cwd: join(projectRoot, "packages/luca-framework"),
    stdout: "pipe",
    stderr: "pipe",
  });

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    console.error(
      `Warning: bun link failed (exit ${exitCode}): ${stderr.trim()}`,
    );
    console.error("The luca-bridge binary may not be available globally.");
  } else {
    log("bun link succeeded");
  }

  // Verify
  const verify = Bun.spawn(["command", "-v", "luca-bridge"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const verifyExit = await verify.exited;
  if (verifyExit === 0) {
    const path = (await new Response(verify.stdout).text()).trim();
    log(`luca-bridge available at: ${path}`);
  } else {
    // Try which as fallback
    const which = Bun.spawn(["which", "luca-bridge"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const whichExit = await which.exited;
    if (whichExit === 0) {
      const path = (await new Response(which.stdout).text()).trim();
      log(`luca-bridge available at: ${path}`);
    } else {
      console.error("Warning: luca-bridge not found on PATH after bun link.");
    }
  }
}

// ─── Phase: Deploy Agents ───────────────────────────────────────────────────

async function deployAgents(projectRoot: string): Promise<number> {
  logHeader("Deploying agents...");

  const sourceDir = join(projectRoot, ".claude/agents");
  const targetDir = join(GLOBAL_DIR, "agents");

  if (!existsSync(sourceDir)) {
    log("No agents to deploy (.claude/agents/ not found)");
    return 0;
  }

  mkdirSync(targetDir, { recursive: true });

  const files = readdirSync(sourceDir).filter((f) => f.endsWith(".md"));
  for (const file of files) {
    deployFile(join(sourceDir, file), join(targetDir, file));
  }

  log(`${files.length} agent(s) deployed`);
  return files.length;
}

// ─── Phase: Deploy Skills ───────────────────────────────────────────────────

async function deploySkills(projectRoot: string): Promise<number> {
  logHeader("Deploying skills...");

  const sourceDir = join(projectRoot, ".claude/skills");
  const targetDir = join(GLOBAL_DIR, "skills");

  if (!existsSync(sourceDir)) {
    log("No skills to deploy (.claude/skills/ not found)");
    return 0;
  }

  mkdirSync(targetDir, { recursive: true });

  const dirs = readdirSync(sourceDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const dir of dirs) {
    deployDir(join(sourceDir, dir), join(targetDir, dir));
  }

  log(`${dirs.length} skill(s) deployed`);
  return dirs.length;
}

// ─── Phase: Deploy Hooks ────────────────────────────────────────────────────

async function deployHooks(projectRoot: string): Promise<number> {
  logHeader("Deploying hooks (always copy, never symlink)...");

  const sourceDir = join(projectRoot, ".claude/hooks");
  const targetDir = join(GLOBAL_DIR, "hooks");

  if (!existsSync(sourceDir)) {
    log("No hooks to deploy (.claude/hooks/ not found)");
    return 0;
  }

  mkdirSync(targetDir, { recursive: true });

  let count = 0;

  // Deploy _lib/common.sh
  const libSourceDir = join(sourceDir, "_lib");
  if (existsSync(libSourceDir)) {
    const libTargetDir = join(targetDir, "_lib");
    mkdirSync(libTargetDir, { recursive: true });
    for (const file of readdirSync(libSourceDir)) {
      deployFile(join(libSourceDir, file), join(libTargetDir, file), true);
      count++;
    }
  }

  // Deploy hook scripts (skip framework-specific ones)
  const scripts = readdirSync(sourceDir).filter(
    (f) => f.endsWith(".sh") && !SKIP_HOOKS.has(f),
  );

  for (const script of scripts) {
    const targetPath = join(targetDir, script);
    deployFile(join(sourceDir, script), targetPath, true);

    // Make executable
    if (!dryRun) {
      chmodSync(targetPath, 0o755);
    }

    // Rewrite relative paths to absolute monorepo paths for global deploy.
    // Shell wrappers use $(dirname "$0")/../../src/hooks/scripts/ which resolves
    // correctly inside the monorepo but breaks when deployed to ~/.claude/hooks/.
    if (!dryRun) {
      const content = readFileSync(targetPath, "utf-8");
      const rewritten = content
        .replace(/\$\(dirname "\$0"\)\/\.\.\/\.\.\//g, `${projectRoot}/`)
        .replace(/\$\(dirname "\$0"\)\/\.\.\//g, `${projectRoot}/`);
      if (rewritten !== content) {
        writeFileSync(targetPath, rewritten);
      }
    }

    count++;
  }

  // Preserve existing non-Luca hooks
  const existingHooks = existsSync(targetDir)
    ? readdirSync(targetDir).filter(
        (f) =>
          f.endsWith(".sh") &&
          !scripts.includes(f) &&
          f !== "cleanup-processes.sh",
      )
    : [];
  if (existingHooks.length > 0) {
    log(`Preserved existing hooks: ${existingHooks.join(", ")}`);
  }

  log(
    `${count} hook file(s) deployed (skipped: ${[...SKIP_HOOKS].join(", ")})`,
  );
  return count;
}

// ─── Phase: Deploy Statusline ────────────────────────────────────────────────

async function deployStatusline(projectRoot: string): Promise<void> {
  logHeader("Deploying statusline...");

  const source = join(projectRoot, ".claude/statusline.sh");
  if (!existsSync(source)) {
    log("No statusline to deploy (.claude/statusline.sh not found)");
    return;
  }

  const target = join(GLOBAL_DIR, "statusline.sh");
  deployFile(source, target, true); // always copy (like hooks)

  if (!dryRun) {
    chmodSync(target, 0o755);
  }

  log("statusline.sh deployed");
}

// ─── Phase: Deploy Rules ────────────────────────────────────────────────────

async function deployRules(projectRoot: string): Promise<number> {
  logHeader("Deploying universal rules...");

  const sourceDir = join(projectRoot, ".claude/rules");
  const targetDir = join(GLOBAL_DIR, "rules");

  if (!existsSync(sourceDir)) {
    log("No rules to deploy (.claude/rules/ not found)");
    return 0;
  }

  mkdirSync(targetDir, { recursive: true });

  const allRules = readdirSync(sourceDir).filter((f) => f.endsWith(".md"));
  const universalRules = allRules.filter((f) => UNIVERSAL_RULES.has(f));
  const skippedRules = allRules.filter((f) => !UNIVERSAL_RULES.has(f));

  for (const rule of universalRules) {
    deployFile(join(sourceDir, rule), join(targetDir, rule), true);
  }

  log(`${universalRules.length} universal rule(s) deployed`);
  log(
    `${skippedRules.length} framework-specific rule(s) skipped: ${skippedRules.join(", ")}`,
  );
  return universalRules.length;
}

// ─── Phase: Merge Settings ──────────────────────────────────────────────────

async function mergeSettings(): Promise<void> {
  logHeader("Merging settings.json...");

  const settingsPath = join(GLOBAL_DIR, "settings.json");

  // Read existing settings
  let settings: Record<string, any> = {};
  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
    } catch {
      console.error(
        "Warning: Could not parse existing settings.json, will merge carefully.",
      );
    }
  }

  // Ensure env section
  if (!settings.env) settings.env = {};
  settings.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = "1";

  // Build Luca hook registrations using global paths
  const globalHooksDir = join(GLOBAL_DIR, "hooks");
  const lucaHooks: Record<string, any[]> = {
    SessionStart: [
      {
        hooks: [
          {
            type: "command",
            command: `"${globalHooksDir}/session-start.sh"`,
            timeout: 15,
            statusMessage: "Initializing Luca...",
          },
        ],
      },
      {
        matcher: "compact",
        hooks: [
          {
            type: "command",
            command: `"${globalHooksDir}/session-compact-restore.sh"`,
            timeout: 10,
            statusMessage: "Restoring context...",
          },
        ],
      },
    ],
    PreCompact: [
      {
        hooks: [
          {
            type: "command",
            command: `"${globalHooksDir}/pre-compact-checkpoint.sh"`,
            timeout: 15,
            async: true,
            statusMessage: "Saving context checkpoint...",
          },
        ],
      },
    ],
    SessionEnd: [
      {
        hooks: [
          {
            type: "command",
            command: `"${globalHooksDir}/session-persist.sh"`,
            timeout: 10,
            statusMessage: "Saving session state...",
          },
        ],
      },
    ],
    Stop: [
      {
        hooks: [
          {
            type: "command",
            command: `"${globalHooksDir}/context-monitor.sh"`,
            timeout: 5,
            statusMessage: "Checking context usage...",
          },
        ],
      },
    ],
    PreToolUse: [
      {
        matcher: "Bash",
        hooks: [
          {
            type: "command",
            command: `"${globalHooksDir}/pre-commit-gate.sh"`,
            timeout: 120,
            statusMessage: "Running pre-commit checks...",
          },
        ],
      },
    ],
    PostToolUse: [
      {
        matcher: "Edit|Write",
        hooks: [
          {
            type: "command",
            command: `"${globalHooksDir}/post-edit-format.sh"`,
            timeout: 10,
            statusMessage: "Formatting...",
          },
          {
            type: "command",
            command: `"${globalHooksDir}/post-edit-typecheck.sh"`,
            timeout: 30,
            async: true,
            statusMessage: "Type-checking...",
          },
        ],
      },
      {
        hooks: [
          {
            type: "command",
            command: `"${globalHooksDir}/context-check-throttled.sh"`,
            timeout: 10,
            async: true,
            statusMessage: "Checking context...",
          },
          {
            type: "command",
            command: `"${globalHooksDir}/snapshot-sync.sh"`,
            timeout: 10,
            async: true,
            statusMessage: "Syncing STATE.md...",
          },
        ],
      },
    ],
  };

  // Merge hooks: preserve existing non-Luca hooks, add/replace Luca hooks
  if (!settings.hooks) settings.hooks = {};

  for (const [event, lucaEntries] of Object.entries(lucaHooks)) {
    const existingEntries: any[] = settings.hooks[event] || [];

    // Filter out previous Luca hook entries (identified by path containing /hooks/)
    // but preserve non-Luca hooks (like cleanup-processes.sh)
    const nonLucaEntries = existingEntries.filter((entry: any) => {
      const hooks = entry.hooks || [];
      // Keep entry if none of its hooks reference Luca hook scripts
      return hooks.every((h: any) => {
        const cmd = h.command || "";
        // Luca hooks are identified by the known script names
        const lucaScripts = [
          "session-start.sh",
          "session-persist.sh",
          "session-compact-restore.sh",
          "context-monitor.sh",
          "pre-commit-gate.sh",
          "pre-commit-drift-check.sh",
          "post-edit-format.sh",
          "post-edit-typecheck.sh",
          "context-check-throttled.sh",
          "pre-compact-checkpoint.sh",
          "snapshot-sync.sh",
        ];
        return !lucaScripts.some((s) => cmd.includes(s));
      });
    });

    // Combine: non-Luca entries first, then Luca entries
    settings.hooks[event] = [...nonLucaEntries, ...lucaEntries];
  }

  // Add statusLine configuration (camelCase key required by Claude Code)
  const globalStatusline = join(GLOBAL_DIR, "statusline.sh");
  if (existsSync(globalStatusline)) {
    settings.statusLine = {
      type: "command",
      command: `"${globalStatusline}"`,
    };
  }
  // Remove stale lowercase key if present from prior deploys
  delete settings.statusline;

  if (dryRun) {
    logDry(`Would write settings.json with merged hooks`);
    logDry(`Events: ${Object.keys(lucaHooks).join(", ")}`);
    return;
  }

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
  log("settings.json updated with Luca hooks and statusline");
  log(`Preserved existing settings: model, plugins, etc.`);
}

// ─── Phase: Write Manifest ──────────────────────────────────────────────────

async function writeManifest(
  projectRoot: string,
  counts: { agents: number; skills: number; hooks: number; rules: number },
): Promise<void> {
  logHeader("Writing deploy manifest...");

  const manifest = {
    version: "1.0.0",
    deployed_at: new Date().toISOString(),
    mode: copyMode ? "copy" : "symlink",
    source_path: projectRoot,
    counts,
  };

  if (dryRun) {
    logDry(`Would write manifest to ${MANIFEST_PATH}`);
    return;
  }

  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
  log(`Manifest written to ${MANIFEST_PATH}`);
}

// ─── Remove Mode ────────────────────────────────────────────────────────────

async function removeGlobalArtifacts(): Promise<void> {
  console.log("Luca Global Deploy — REMOVE");
  console.log("===========================\n");

  // Read manifest to know what was deployed
  if (!existsSync(MANIFEST_PATH)) {
    console.error("No deploy manifest found. Nothing to remove.");
    process.exit(1);
  }

  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
  log(`Removing artifacts deployed at ${manifest.deployed_at}`);

  // Remove agents
  logHeader("Removing agents...");
  const agentsDir = join(GLOBAL_DIR, "agents");
  if (existsSync(agentsDir)) {
    rmSync(agentsDir, { recursive: true });
    log("Removed ~/.claude/agents/");
  }

  // Remove skills (only Luca skills, preserve marketplace)
  logHeader("Removing Luca skills...");
  const skillsDir = join(GLOBAL_DIR, "skills");
  if (existsSync(skillsDir)) {
    const sourceSkillsDir = join(manifest.source_path, ".claude/skills");
    if (existsSync(sourceSkillsDir)) {
      const lucaSkills = readdirSync(sourceSkillsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);

      for (const skill of lucaSkills) {
        const skillPath = join(skillsDir, skill);
        if (existsSync(skillPath)) {
          const stat = lstatSync(skillPath);
          if (stat.isSymbolicLink()) {
            unlinkSync(skillPath);
          } else {
            rmSync(skillPath, { recursive: true });
          }
          log(`Removed: ${skill}/`);
        }
      }
    }
  }

  // Remove Luca hooks (preserve cleanup-processes.sh)
  logHeader("Removing Luca hooks...");
  const hooksDir = join(GLOBAL_DIR, "hooks");
  if (existsSync(hooksDir)) {
    // Remove _lib directory
    const libDir = join(hooksDir, "_lib");
    if (existsSync(libDir)) {
      rmSync(libDir, { recursive: true });
      log("Removed: _lib/");
    }

    // Remove Luca hook scripts (preserve non-Luca hooks)
    const lucaScripts = [
      "session-start.sh",
      "session-persist.sh",
      "session-compact-restore.sh",
      "context-monitor.sh",
      "pre-commit-gate.sh",
      "post-edit-format.sh",
      "post-edit-typecheck.sh",
      "context-check-throttled.sh",
      "pre-compact-checkpoint.sh",
      "snapshot-sync.sh",
    ];

    for (const script of lucaScripts) {
      const scriptPath = join(hooksDir, script);
      if (existsSync(scriptPath)) {
        unlinkSync(scriptPath);
        log(`Removed: ${script}`);
      }
    }
  }

  // Remove Luca rules
  logHeader("Removing Luca rules...");
  const rulesDir = join(GLOBAL_DIR, "rules");
  if (existsSync(rulesDir)) {
    for (const rule of UNIVERSAL_RULES) {
      const rulePath = join(rulesDir, rule);
      if (existsSync(rulePath)) {
        unlinkSync(rulePath);
        log(`Removed: ${rule}`);
      }
    }
  }

  // Remove statusline
  logHeader("Removing statusline...");
  const statuslinePath = join(GLOBAL_DIR, "statusline.sh");
  if (existsSync(statuslinePath)) {
    unlinkSync(statuslinePath);
    log("Removed: statusline.sh");
  }

  // Clean settings.json (remove Luca hooks, keep everything else)
  logHeader("Cleaning settings.json...");
  const settingsPath = join(GLOBAL_DIR, "settings.json");
  if (existsSync(settingsPath)) {
    const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));

    if (settings.hooks) {
      for (const event of Object.keys(settings.hooks)) {
        settings.hooks[event] = (settings.hooks[event] || []).filter(
          (entry: any) => {
            const hooks = entry.hooks || [];
            // Keep only non-Luca hooks
            return hooks.every((h: any) => {
              const cmd = h.command || "";
              const lucaScripts = [
                "session-start.sh",
                "session-persist.sh",
                "session-compact-restore.sh",
                "context-monitor.sh",
                "pre-commit-gate.sh",
                "post-edit-format.sh",
                "post-edit-typecheck.sh",
                "context-check-throttled.sh",
                "pre-compact-checkpoint.sh",
                "snapshot-sync.sh",
              ];
              return !lucaScripts.some((s) => cmd.includes(s));
            });
          },
        );

        // Remove empty event arrays
        if (settings.hooks[event].length === 0) {
          delete settings.hooks[event];
        }
      }
    }

    // Remove statusLine config (both key variants)
    delete settings.statusLine;
    delete settings.statusline;

    // Remove CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS env var
    if (settings.env?.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS) {
      delete settings.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;
      if (Object.keys(settings.env).length === 0) {
        delete settings.env;
      }
    }

    writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
    log("Cleaned Luca hooks from settings.json");
  }

  // Remove manifest
  unlinkSync(MANIFEST_PATH);
  log("Removed deploy manifest");

  console.log("\nLuca global artifacts removed successfully.");
  console.log(
    "Existing hooks (cleanup-processes.sh) and marketplace skills preserved.",
  );
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (removeMode) {
    await removeGlobalArtifacts();
    return;
  }

  const projectRoot = await preflight();

  // Phase 1: Install luca-bridge
  await installBridge(projectRoot);

  // Phase 2: Deploy artifacts
  const agents = await deployAgents(projectRoot);
  const skills = await deploySkills(projectRoot);
  const hooks = await deployHooks(projectRoot);
  const rules = await deployRules(projectRoot);

  // Phase 2.5: Deploy statusline
  await deployStatusline(projectRoot);

  // Phase 3: Merge settings
  await mergeSettings();

  // Phase 4: Write manifest
  await writeManifest(projectRoot, { agents, skills, hooks, rules });

  // Summary
  console.log("\n==================");
  console.log("Deploy complete!");
  console.log(`  Agents: ${agents}`);
  console.log(`  Skills: ${skills}`);
  console.log(`  Hooks:  ${hooks}`);
  console.log(`  Rules:  ${rules}`);

  if (!dryRun) {
    console.log("\nNext steps:");
    console.log("  1. Start a new Claude Code session in any repository");
    console.log(
      "  2. The session-start hook will create .planning/ automatically",
    );
    console.log("  3. Use /lu to begin working with Luca");
    console.log("\nTo update after pulling changes:");
    console.log("  bun run build:all && bun run deploy");
    console.log("\nTo uninstall:");
    console.log("  bun run deploy:remove");
  }
}

main().catch((err) => {
  console.error("Deploy failed:", err);
  process.exit(1);
});
