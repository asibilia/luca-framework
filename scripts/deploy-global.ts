#!/usr/bin/env bun
/**
 * deploy-global.ts — Deploy Luca artifacts to ~/.claude/ for global availability
 *
 * Makes agents, skills, hooks, and rules available in any repository by
 * installing them into the user-level Claude Code configuration directory.
 *
 * Uses the modular library functions from `packages/luca-framework/src/utils/`
 * for settings merge, backup, manifest writing, and conflict resolution.
 *
 * Usage:
 *   bun scripts/deploy-global.ts              # file copies (default, symlink deprecated)
 *   bun scripts/deploy-global.ts --copy       # file copies (explicit, backward compat)
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
import filter from "lodash/filter";

// Library imports from packages/luca-framework
import { sanitizeJsonParse } from "../packages/luca-framework/src/utils/sanitize";
import {
  backupSettings,
  rotateBackups,
} from "../packages/luca-framework/src/utils/backup-manager";
import {
  computeMergeActions,
  applyMerge,
  getKnownLucaScripts,
  isLucaHook,
} from "../packages/luca-framework/src/utils/settings-merger";
import { promptConflictResolution } from "../packages/luca-framework/src/utils/conflict-prompt";
import {
  createDeployManifest,
  writeDeployManifest,
} from "../packages/luca-framework/src/utils/deploy-manifest-writer";
import {
  getLucaHomePaths,
  ensureLucaHome,
} from "../packages/luca-framework/src/utils/luca-home";

// Monorepo build-tier imports
import { resolveCanonicalRegistry } from "../src/hooks/__helpers/hook-registry";
import { generateClaudeHooksConfigFromCanonical } from "../src/hooks/__helpers/config-generators";

import {
  copyDirForDeploy,
  rewriteHookPaths,
} from "../packages/luca-framework/src/utils/deploy-helpers";

import type { DeployedFileEntry } from "../packages/luca-framework/src/utils/deploy-helpers";
import type { DeploySourceType } from "../packages/luca-framework/src/utils/deploy-manifest.schemas";

// ─── Constants ──────────────────────────────────────────────────────────────

const HOME = process.env.HOME ?? Bun.env.HOME ?? "";
const GLOBAL_DIR = join(HOME, ".claude");

/** Rules that are universal (not framework-specific). */
const UNIVERSAL_RULES = new Set([
  "api-snake-case.md",
  "bun-preference.md",
  "cursor-rules.md",
  "file-naming.md",
  "functional-api-reuse.md",
  "generated-file-guard.md",
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

// ─── Deployed files tracker (for manifest) ──────────────────────────────────

const deployedFiles: Array<{
  relativePath: string;
  absolutePath: string;
  sourceType: DeploySourceType;
}> = [];

// ─── Helpers ────────────────────────────────────────────────────────────────

const log = (msg: string) => console.log(`  ${msg}`);
const logHeader = (msg: string) => console.log(`\n→ ${msg}`);
const logDry = (msg: string) => console.log(`  [dry-run] ${msg}`);

// rewriteWrapperPaths is now imported from deploy-helpers.ts
// CRITICAL: callers must guard with dryRun check: `if (!dryRun) rewriteHookPaths(...)`

/**
 * Symlink or copy a file. In copy mode, always copies.
 * In symlink mode, creates a symlink from target -> source.
 *
 * Tracks the deployed file for manifest creation when sourceType is provided.
 */
function deployFile(
  source: string,
  target: string,
  forceCopy = false,
  sourceType?: DeploySourceType,
): void {
  const mode = forceCopy || copyMode ? "copy" : "symlink";

  if (dryRun) {
    logDry(`${mode}: ${relative(process.cwd(), source)} -> ${target}`);
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
    // Target doesn't exist -- fine
  }

  if (mode === "symlink") {
    symlinkSync(source, target);
    log(`symlink: ${basename(target)}`);
  } else {
    const content = readFileSync(source);
    writeFileSync(target, content);
    log(`copy: ${basename(target)}`);
  }

  // Track for manifest
  if (sourceType) {
    const relativePath = relative(GLOBAL_DIR, target);
    deployedFiles.push({
      relativePath,
      absolutePath: target,
      sourceType,
    });
  }
}

/**
 * Symlink or copy an entire directory.
 */
function deployDir(
  source: string,
  target: string,
  forceCopy = false,
  sourceType?: DeploySourceType,
): void {
  const mode = forceCopy || copyMode ? "copy" : "symlink";

  if (dryRun) {
    logDry(`${mode} dir: ${relative(process.cwd(), source)} -> ${target}`);
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
    // Doesn't exist -- fine
  }

  if (mode === "symlink") {
    symlinkSync(source, target);
    log(`symlink dir: ${basename(target)}/`);
  } else {
    // Copy directory recursively using shared deploy helper
    if (sourceType) {
      copyDirForDeploy(source, target, GLOBAL_DIR, deployedFiles, sourceType);
    } else {
      copyDirForDeploy(source, target, GLOBAL_DIR, deployedFiles, "lib");
    }
    log(`copy dir: ${basename(target)}/`);
  }
}

// copyDirRecursive is now replaced by copyDirForDeploy from deploy-helpers.ts

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
    console.log(`\nMode: ${copyMode ? "COPY" : "COPY (default)"}`);
    if (!copyMode) {
      log(
        "Note: Symlink mode is deprecated for global deploy. Use --copy explicitly.",
      );
    }
  }

  return projectRoot;
}

// ─── Phase: Ensure ~/.luca/ directory structure ─────────────────────────────

async function ensureHomeDirectories(): Promise<void> {
  logHeader("Ensuring ~/.luca/ directory structure...");

  if (dryRun) {
    const paths = getLucaHomePaths();
    logDry(
      `Would create: ${paths.root}, ${paths.bin}, ${paths.manifests}, ${paths.backups}`,
    );
    return;
  }

  const paths = await ensureLucaHome();
  log(`Home directories ready: ${paths.root}`);
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
    deployFile(join(sourceDir, file), join(targetDir, file), false, "agent");
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
    deployDir(join(sourceDir, dir), join(targetDir, dir), false, "skill");
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
      deployFile(
        join(libSourceDir, file),
        join(libTargetDir, file),
        true,
        "lib",
      );
      count++;
    }
  }

  // Deploy hook scripts (skip framework-specific ones)
  const scripts = readdirSync(sourceDir).filter(
    (f) => f.endsWith(".sh") && !SKIP_HOOKS.has(f),
  );

  for (const script of scripts) {
    const targetPath = join(targetDir, script);
    deployFile(join(sourceDir, script), targetPath, true, "hook");

    // Make executable
    if (!dryRun) {
      chmodSync(targetPath, 0o755);
    }

    // Rewrite relative $(dirname "$0")/../../ paths to absolute monorepo paths
    if (!dryRun) rewriteHookPaths(targetPath, projectRoot);

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
  deployFile(source, target, true, "statusline");

  if (!dryRun) {
    chmodSync(target, 0o755);
  }

  // Rewrite relative $(dirname "$0")/../ paths to absolute monorepo paths
  if (!dryRun) rewriteHookPaths(target, projectRoot);

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
    deployFile(join(sourceDir, rule), join(targetDir, rule), true, "rule");
  }

  log(`${universalRules.length} universal rule(s) deployed`);
  log(
    `${skippedRules.length} framework-specific rule(s) skipped: ${skippedRules.join(", ")}`,
  );
  return universalRules.length;
}

// ─── Phase: Backup & Merge Settings ─────────────────────────────────────────

async function mergeSettingsWithLibrary(): Promise<string | null> {
  logHeader("Merging settings.json (three-tier merge)...");

  const settingsPath = join(GLOBAL_DIR, "settings.json");
  const homePaths = getLucaHomePaths();

  // Step 1: Backup existing settings before any modification
  if (dryRun) {
    logDry(`Would backup settings.json to ${homePaths.backups}/`);
  } else {
    const backupPath = await backupSettings(settingsPath, homePaths.backups);
    if (backupPath) {
      log(`Backup created: ${backupPath}`);
      rotateBackups(homePaths.backups, 5);
    } else {
      log("No existing settings.json to backup");
    }
  }

  // Step 2: Read existing settings
  let existingSettings: Record<string, unknown> = {};
  if (existsSync(settingsPath)) {
    try {
      existingSettings = sanitizeJsonParse(
        readFileSync(settingsPath, "utf-8"),
      ) as Record<string, unknown>;
    } catch {
      console.error(
        "Warning: Could not parse existing settings.json, will merge carefully.",
      );
    }
  }

  // Ensure env section
  const settings = { ...existingSettings } as Record<string, any>;
  if (!settings.env) settings.env = {};
  settings.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = "1";

  // Step 3: Generate proposed hooks from canonical registry
  // Filter out hooks that are in SKIP_HOOKS (not deployed globally)
  const globalHooksDir = join(GLOBAL_DIR, "hooks");
  const fullRegistry = resolveCanonicalRegistry();
  const skipNames = new Set([...SKIP_HOOKS].map((f) => f.replace(/\.sh$/, "")));
  const registry = Object.fromEntries(
    Object.entries(fullRegistry).filter(([name]) => !skipNames.has(name)),
  );
  const proposedHooks = generateClaudeHooksConfigFromCanonical(registry, {
    commandPrefix: `"${globalHooksDir}`,
    scriptExtension: ".sh",
  });

  // Fix command quoting: the config generator produces `"dir/script.sh"` but
  // we need `"dir/script.sh"` (the opening quote is in the prefix, closing needs appending)
  fixCommandQuoting(proposedHooks, globalHooksDir);

  // Step 4: Derive known scripts set from canonical registry
  const knownScripts = getKnownLucaScripts(registry);

  // Step 5: Compute three-tier merge actions
  const actions = computeMergeActions(settings, proposedHooks, knownScripts);

  // Log merge analysis
  const autoMerge = filter(actions, (a) => a.type === "auto-merge");
  const autoSkip = filter(actions, (a) => a.type === "auto-skip");
  const conflicts = filter(actions, (a) => a.type === "conflict");

  log(
    `Merge analysis: ${autoMerge.length} auto-merge, ${autoSkip.length} auto-skip, ${conflicts.length} conflict(s)`,
  );

  // Step 6: Resolve conflicts (interactive prompt or CI default)
  const resolutions = await promptConflictResolution(actions);

  // Step 7: Apply merge
  const merged = applyMerge(settings, proposedHooks, resolutions, knownScripts);

  // Add statusLine configuration (camelCase key required by Claude Code)
  const globalStatusline = join(GLOBAL_DIR, "statusline.sh");
  if (existsSync(globalStatusline) || dryRun) {
    (merged as Record<string, any>).statusLine = {
      type: "command",
      command: `"${globalStatusline}"`,
    };
  }
  // Remove stale lowercase key if present from prior deploys
  delete (merged as Record<string, any>).statusline;

  if (dryRun) {
    logDry("Would write settings.json with merged hooks");
    logDry(`Events: ${Object.keys(proposedHooks).join(", ")}`);
    return null;
  }

  writeFileSync(settingsPath, JSON.stringify(merged, null, 2) + "\n");
  log("settings.json updated with Luca hooks and statusline");
  log("Preserved existing settings: model, plugins, etc.");

  // Return the backup path for manifest
  const backups = readdirSync(homePaths.backups)
    .filter((f) => f.startsWith("settings-"))
    .sort()
    .reverse();
  return backups.length > 0 ? join(homePaths.backups, backups[0]!) : null;
}

/**
 * Fix command quoting in the generated hooks config.
 *
 * The config generator produces commands like `"dir/script.sh` (prefix includes
 * opening quote). We need to append the closing quote: `"dir/script.sh"`.
 */
function fixCommandQuoting(
  hooks: Record<string, unknown>,
  _globalHooksDir: string,
): void {
  for (const slots of Object.values(hooks)) {
    if (!Array.isArray(slots)) continue;
    for (const slot of slots) {
      const s = slot as { hooks?: Array<{ command?: string }> };
      if (!s.hooks) continue;
      for (const hook of s.hooks) {
        if (
          hook.command &&
          hook.command.startsWith('"') &&
          !hook.command.endsWith('"')
        ) {
          hook.command = `${hook.command}"`;
        }
      }
    }
  }
}

// ─── Phase: Write Manifest ──────────────────────────────────────────────────

async function writeManifestWithLibrary(
  projectRoot: string,
  settingsBackupPath: string | null,
): Promise<void> {
  logHeader("Writing deploy manifest...");

  const homePaths = getLucaHomePaths();

  if (dryRun) {
    logDry(
      `Would write manifest to ${join(homePaths.manifests, "deploy-manifest.json")}`,
    );
    return;
  }

  const manifest = await createDeployManifest({
    sourcePath: projectRoot,
    deployedFiles,
    settingsBackupPath: settingsBackupPath ?? undefined,
  });

  await writeDeployManifest(manifest, homePaths.manifests);
  log(
    `Manifest written to ${join(homePaths.manifests, "deploy-manifest.json")}`,
  );

  // Clean up old manifest location if present
  const oldManifestPath = join(GLOBAL_DIR, ".luca-deploy-manifest.json");
  if (existsSync(oldManifestPath)) {
    try {
      unlinkSync(oldManifestPath);
      log("Removed old manifest from ~/.claude/.luca-deploy-manifest.json");
    } catch {
      // Best-effort cleanup
    }
  }
}

// ─── Remove Mode ────────────────────────────────────────────────────────────

async function removeGlobalArtifacts(): Promise<void> {
  console.log("Luca Global Deploy -- REMOVE");
  console.log("===========================\n");

  const homePaths = getLucaHomePaths();
  const newManifestPath = join(homePaths.manifests, "deploy-manifest.json");
  const oldManifestPath = join(GLOBAL_DIR, ".luca-deploy-manifest.json");

  // Read manifest from new location, fall back to old location
  let manifestPath: string | null = null;
  if (existsSync(newManifestPath)) {
    manifestPath = newManifestPath;
  } else if (existsSync(oldManifestPath)) {
    manifestPath = oldManifestPath;
    log("Using legacy manifest location (backward compat)");
  }

  if (!manifestPath) {
    console.error("No deploy manifest found. Nothing to remove.");
    process.exit(1);
  }

  const manifest = sanitizeJsonParse(
    readFileSync(manifestPath, "utf-8"),
  ) as Record<string, any>;
  log(`Removing artifacts deployed at ${manifest.deployed_at}`);

  // Derive known Luca scripts from canonical registry
  const registry = resolveCanonicalRegistry();
  const knownScripts = getKnownLucaScripts(registry);

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

  // Remove Luca hooks (preserve non-Luca hooks)
  logHeader("Removing Luca hooks...");
  const hooksDir = join(GLOBAL_DIR, "hooks");
  if (existsSync(hooksDir)) {
    // Remove _lib directory
    const libDir = join(hooksDir, "_lib");
    if (existsSync(libDir)) {
      rmSync(libDir, { recursive: true });
      log("Removed: _lib/");
    }

    // Remove known Luca hook scripts (derived from canonical registry)
    for (const scriptName of knownScripts) {
      const scriptPath = join(hooksDir, scriptName);
      if (existsSync(scriptPath)) {
        unlinkSync(scriptPath);
        log(`Removed: ${scriptName}`);
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

  // Clean settings.json (remove Luca hooks using merge library)
  logHeader("Cleaning settings.json...");
  const settingsFilePath = join(GLOBAL_DIR, "settings.json");
  if (existsSync(settingsFilePath)) {
    const settings = sanitizeJsonParse(
      readFileSync(settingsFilePath, "utf-8"),
    ) as Record<string, any>;

    if (settings.hooks) {
      for (const event of Object.keys(settings.hooks)) {
        settings.hooks[event] = (settings.hooks[event] || []).filter(
          (entry: any) => {
            const hooks = entry.hooks || [];
            // Keep only entries where none of the hooks are known Luca scripts
            return hooks.every((h: any) => {
              const cmd = h.command || "";
              return !isLucaHook(cmd, knownScripts);
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

    writeFileSync(settingsFilePath, JSON.stringify(settings, null, 2) + "\n");
    log("Cleaned Luca hooks from settings.json");
  }

  // Remove manifests (both locations)
  if (existsSync(newManifestPath)) {
    unlinkSync(newManifestPath);
    log("Removed deploy manifest (new location)");
  }
  if (existsSync(oldManifestPath)) {
    unlinkSync(oldManifestPath);
    log("Removed deploy manifest (old location)");
  }

  console.log("\nLuca global artifacts removed successfully.");
  console.log("Existing hooks and marketplace skills preserved.");
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (removeMode) {
    await removeGlobalArtifacts();
    return;
  }

  const projectRoot = await preflight();

  // Phase 0: Ensure ~/.luca/ directory structure
  await ensureHomeDirectories();

  // Phase 1: Install luca-bridge
  await installBridge(projectRoot);

  // Phase 2: Deploy artifacts
  const agents = await deployAgents(projectRoot);
  const skills = await deploySkills(projectRoot);
  const hooks = await deployHooks(projectRoot);
  const rules = await deployRules(projectRoot);

  // Phase 2.5: Deploy statusline
  await deployStatusline(projectRoot);

  // Phase 3: Backup & Merge settings (three-tier merge)
  const settingsBackupPath = await mergeSettingsWithLibrary();

  // Phase 4: Write manifest
  await writeManifestWithLibrary(projectRoot, settingsBackupPath);

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
