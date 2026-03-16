/**
 * CLI command: luca init
 *
 * Global setup orchestrator that guides users through first-time Luca installation.
 * Runs a 5-step flow to get from zero to a fully wired Luca installation with
 * cognitive memory:
 *
 * 1. **Prerequisites** -- Bun runtime check, ensure ~/.luca/ directory
 * 2. **MuninnDB** -- Binary download + service start
 * 3. **Build artifacts** -- Verify .claude/ build output exists
 * 4. **Deploy** -- Copy agents/skills/hooks/rules to ~/.claude/
 * 5. **Vault setup** -- Suggest `luca vault:init` for per-project MuninnDB wiring
 *
 * The per-project wizard logic (detect context, run wizard, generate files,
 * vault config) lives in `vault-init.ts` (the `luca vault:init` command).
 *
 * @example
 * ```bash
 * # Full interactive setup
 * luca init
 *
 * # Skip prerequisite checks
 * luca init --skip-prerequisites
 *
 * # Skip the vault:init suggestion
 * luca init --skip-vault
 *
 * # Skip MuninnDB setup (manage it separately)
 * luca init --skip-muninndb
 *
 * # Skip artifact deployment to ~/.claude/
 * luca init --skip-deploy
 * ```
 */
import { defineCommand, runMain } from "citty";
import * as p from "@clack/prompts";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, dirname, relative } from "pathe";
import { homedir } from "node:os";

import { logger } from "../utils/logger";
import { sanitizeJsonParse } from "../utils/sanitize";
import { detectRuntimeContext } from "../utils/runtime-context";
import { checkPrerequisites, promptBunInstall } from "../utils/prerequisites";
import { ensureLucaHome, getLucaHomePaths } from "../utils/luca-home";
import { checkMuninndbBinary } from "../utils/muninndb-health";
import { downloadMuninndbBinary } from "../utils/muninndb-download";
import { startMuninndb } from "../utils/muninndb-service";
import { isOnPath, getPathGuidance } from "../utils/path-check";
import { backupSettings, rotateBackups } from "../utils/backup-manager";
import {
  computeMergeActions,
  applyMerge,
  getKnownLucaScripts,
} from "../utils/settings-merger";
import { promptConflictResolution } from "../utils/conflict-prompt";
import {
  createDeployManifest,
  writeDeployManifest,
} from "../utils/deploy-manifest-writer";

import type { DeploySourceType } from "../utils/deploy-manifest.schemas";

import type { RuntimeContext } from "../utils/runtime-context";

// ─── Deploy step implementation ─────────────────────────────────────────────

/**
 * Run the artifact deployment step within `luca init`.
 *
 * Copies Luca agents, skills, hooks, rules, and statusline from the package
 * source directory to `~/.claude/`. Runs the three-tier settings merge and
 * writes a deploy manifest to `~/.luca/manifests/`.
 *
 * This is a simplified version of `scripts/deploy-global.ts` integrated into
 * the init flow. For advanced options (--remove, --dry-run), use the standalone
 * deploy script directly.
 *
 * @param ctx - Runtime context from `detectRuntimeContext()`
 * @returns Total number of files deployed
 */
async function runDeployStep(ctx: RuntimeContext): Promise<number> {
  const home = homedir();
  const globalDir = join(home, ".claude");
  const homePaths = getLucaHomePaths();

  // Resolve source directory based on runtime context
  // In dev mode, the source is the monorepo .claude/ directory
  // In global mode, the source is relative to the installed package
  let sourceRoot: string;
  if (ctx.mode === "dev") {
    // Walk up from packageDir to find monorepo root
    let dir = ctx.packageDir;
    while (dir !== "/" && !existsSync(join(dir, "packages/luca-framework"))) {
      dir = dirname(dir);
    }
    sourceRoot = dir;
  } else {
    // Global install: package directory contains the dist output
    sourceRoot = ctx.packageDir;
  }

  const claudeDir = join(sourceRoot, ".claude");
  if (!existsSync(claudeDir)) {
    p.log.warn("Build artifacts not found (.claude/ directory missing).");
    p.log.warn("Run `bun run build:all` first, then re-run `luca init`.");
    return 0;
  }

  // Ensure target directories exist
  if (!existsSync(globalDir)) {
    mkdirSync(globalDir, { recursive: true });
  }

  const deployedFiles: Array<{
    relativePath: string;
    absolutePath: string;
    sourceType: DeploySourceType;
  }> = [];

  let totalCount = 0;

  // Deploy agents
  const agentsSource = join(claudeDir, "agents");
  if (existsSync(agentsSource)) {
    const agentsTarget = join(globalDir, "agents");
    mkdirSync(agentsTarget, { recursive: true });
    const files = readdirSync(agentsSource).filter((f) => f.endsWith(".md"));
    for (const file of files) {
      const target = join(agentsTarget, file);
      writeFileSync(target, readFileSync(join(agentsSource, file)));
      deployedFiles.push({
        relativePath: relative(globalDir, target),
        absolutePath: target,
        sourceType: "agent",
      });
    }
    totalCount += files.length;
    p.log.step(`Agents: ${files.length}`);
  }

  // Deploy skills
  const skillsSource = join(claudeDir, "skills");
  if (existsSync(skillsSource)) {
    const skillsTarget = join(globalDir, "skills");
    mkdirSync(skillsTarget, { recursive: true });
    const dirs = readdirSync(skillsSource, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    for (const dir of dirs) {
      copyDirForDeploy(
        join(skillsSource, dir),
        join(skillsTarget, dir),
        globalDir,
        deployedFiles,
        "skill",
      );
    }
    totalCount += dirs.length;
    p.log.step(`Skills: ${dirs.length}`);
  }

  // Deploy hooks (always copy)
  const hooksSource = join(claudeDir, "hooks");
  if (existsSync(hooksSource)) {
    const hooksTarget = join(globalDir, "hooks");
    mkdirSync(hooksTarget, { recursive: true });

    // Deploy _lib
    const libSource = join(hooksSource, "_lib");
    if (existsSync(libSource)) {
      copyDirForDeploy(
        libSource,
        join(hooksTarget, "_lib"),
        globalDir,
        deployedFiles,
        "lib",
      );
    }

    // Deploy hook scripts
    const scripts = readdirSync(hooksSource).filter(
      (f) => f.endsWith(".sh") && f !== "pre-commit-drift-check.sh",
    );
    for (const script of scripts) {
      const target = join(hooksTarget, script);
      writeFileSync(target, readFileSync(join(hooksSource, script)));
      chmodSync(target, 0o755);

      // Rewrite relative paths for global context
      rewriteWrapperPathsForInit(target, sourceRoot);

      deployedFiles.push({
        relativePath: relative(globalDir, target),
        absolutePath: target,
        sourceType: "hook",
      });
    }
    totalCount += scripts.length;
    p.log.step(`Hooks: ${scripts.length}`);
  }

  // Deploy statusline
  const statuslineSource = join(claudeDir, "statusline.sh");
  if (existsSync(statuslineSource)) {
    const target = join(globalDir, "statusline.sh");
    writeFileSync(target, readFileSync(statuslineSource));
    chmodSync(target, 0o755);
    rewriteWrapperPathsForInit(target, sourceRoot);
    deployedFiles.push({
      relativePath: "statusline.sh",
      absolutePath: target,
      sourceType: "statusline",
    });
    totalCount += 1;
    p.log.step("Statusline: 1");
  }

  // Deploy universal rules
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

  const rulesSource = join(claudeDir, "rules");
  if (existsSync(rulesSource)) {
    const rulesTarget = join(globalDir, "rules");
    mkdirSync(rulesTarget, { recursive: true });
    const rules = readdirSync(rulesSource).filter(
      (f) => f.endsWith(".md") && UNIVERSAL_RULES.has(f),
    );
    for (const rule of rules) {
      const target = join(rulesTarget, rule);
      writeFileSync(target, readFileSync(join(rulesSource, rule)));
      deployedFiles.push({
        relativePath: relative(globalDir, target),
        absolutePath: target,
        sourceType: "rule",
      });
    }
    totalCount += rules.length;
    p.log.step(`Rules: ${rules.length} universal`);
  }

  // Settings merge (three-tier)
  const settingsPath = join(globalDir, "settings.json");

  // Backup first
  const backupPath = await backupSettings(settingsPath, homePaths.backups);
  if (backupPath) {
    rotateBackups(homePaths.backups, 5);
  }

  // Read existing settings
  let existingSettings: Record<string, unknown> = {};
  if (existsSync(settingsPath)) {
    try {
      existingSettings = sanitizeJsonParse(
        readFileSync(settingsPath, "utf-8"),
      ) as Record<string, unknown>;
    } catch {
      p.log.warn("Could not parse existing settings.json, merging carefully.");
    }
  }

  // Ensure env section
  const settings = { ...existingSettings } as Record<string, any>;
  if (!settings.env) settings.env = {};
  settings.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = "1";

  // Generate proposed hooks from the hook scripts we deployed
  // Build a minimal proposed hooks structure from deployed hook files
  const globalHooksDir = join(globalDir, "hooks");
  const proposedHooks = buildProposedHooksFromDeployed(globalHooksDir);

  // Derive known scripts from the deployed hooks
  const knownScripts = new Set(
    readdirSync(globalHooksDir).filter((f) => f.endsWith(".sh")),
  );

  // Compute merge actions
  const actions = computeMergeActions(settings, proposedHooks, knownScripts);
  const conflicts = actions.filter((a) => a.type === "conflict");

  if (conflicts.length > 0) {
    p.log.info(`Found ${conflicts.length} hook conflict(s) to resolve.`);
  }

  // Resolve conflicts
  const resolutions = await promptConflictResolution(actions);

  // Apply merge
  const merged = applyMerge(settings, proposedHooks, resolutions, knownScripts);

  // Add statusLine
  const globalStatusline = join(globalDir, "statusline.sh");
  if (existsSync(globalStatusline)) {
    (merged as Record<string, any>).statusLine = {
      type: "command",
      command: `"${globalStatusline}"`,
    };
  }
  delete (merged as Record<string, any>).statusline;

  writeFileSync(settingsPath, JSON.stringify(merged, null, 2) + "\n");
  p.log.success("Settings merged with Luca hooks");

  // Write deploy manifest
  const manifest = await createDeployManifest({
    sourcePath: sourceRoot,
    deployedFiles,
    settingsBackupPath: backupPath ?? undefined,
  });
  await writeDeployManifest(manifest, homePaths.manifests);
  p.log.success("Deploy manifest written");

  return totalCount;
}

/**
 * Recursively copy a directory, tracking deployed files for manifest.
 */
function copyDirForDeploy(
  source: string,
  target: string,
  globalDir: string,
  deployedFiles: Array<{
    relativePath: string;
    absolutePath: string;
    sourceType: DeploySourceType;
  }>,
  sourceType: DeploySourceType,
): void {
  mkdirSync(target, { recursive: true });
  const entries = readdirSync(source, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(source, entry.name);
    const tgtPath = join(target, entry.name);
    if (entry.isDirectory()) {
      copyDirForDeploy(srcPath, tgtPath, globalDir, deployedFiles, sourceType);
    } else {
      writeFileSync(tgtPath, readFileSync(srcPath));
      deployedFiles.push({
        relativePath: relative(globalDir, tgtPath),
        absolutePath: tgtPath,
        sourceType,
      });
    }
  }
}

/**
 * Rewrite relative paths in shell wrappers to absolute paths for global context.
 *
 * Same logic as deploy-global.ts rewriteWrapperPaths(), inlined here to
 * avoid importing from scripts/ (which is outside the package boundary).
 */
function rewriteWrapperPathsForInit(
  targetPath: string,
  projectRoot: string,
): void {
  const content = readFileSync(targetPath, "utf-8");
  const rewritten = content
    .replace(/\$\(dirname "\$0"\)\/\.\.\/\.\.\//g, `${projectRoot}/`)
    .replace(/\$\(dirname "\$0"\)\/\.\.\//g, `${projectRoot}/`);

  if (rewritten !== content) {
    writeFileSync(targetPath, rewritten);
  }
}

/**
 * Build a proposed hooks structure from the deployed hook files.
 *
 * This is a minimal version used by the init flow. It reads the existing
 * settings.json hooks structure as a template for what hooks should look like,
 * rather than using the canonical registry (which lives in the monorepo
 * src/hooks/ tier and is not importable from the packages/ tier).
 *
 * For the full canonical registry approach, use `scripts/deploy-global.ts`.
 */
function buildProposedHooksFromDeployed(
  globalHooksDir: string,
): Record<string, unknown> {
  // Build a hooks structure matching the Claude Code settings.json format
  // Group hooks by their Claude Code event based on known script-to-event mapping
  const scriptEventMap: Record<
    string,
    {
      event: string;
      matcher?: string;
      timeout: number;
      async?: boolean;
      statusMessage?: string;
    }
  > = {
    "session-start.sh": {
      event: "SessionStart",
      timeout: 15,
      statusMessage: "Initializing Luca...",
    },
    "session-compact-restore.sh": {
      event: "SessionStart",
      matcher: "compact",
      timeout: 10,
      statusMessage: "Restoring context...",
    },
    "pre-compact-checkpoint.sh": {
      event: "PreCompact",
      timeout: 15,
      async: true,
      statusMessage: "Saving context checkpoint...",
    },
    "session-persist.sh": {
      event: "SessionEnd",
      timeout: 10,
      statusMessage: "Saving session state...",
    },
    "context-monitor.sh": {
      event: "Stop",
      timeout: 5,
      statusMessage: "Checking context usage...",
    },
    "pre-commit-gate.sh": {
      event: "PreToolUse",
      matcher: "Bash",
      timeout: 120,
      statusMessage: "Running pre-commit checks...",
    },
    "post-edit-format.sh": {
      event: "PostToolUse",
      matcher: "Edit|Write",
      timeout: 10,
      statusMessage: "Formatting...",
    },
    "post-edit-typecheck.sh": {
      event: "PostToolUse",
      matcher: "Edit|Write",
      timeout: 30,
      async: true,
      statusMessage: "Type-checking...",
    },
    "context-check-throttled.sh": {
      event: "PostToolUse",
      timeout: 10,
      async: true,
      statusMessage: "Checking context...",
    },
    "snapshot-sync.sh": {
      event: "PostToolUse",
      timeout: 10,
      async: true,
      statusMessage: "Syncing STATE.md...",
    },
    "muninn-context-recall.sh": {
      event: "UserPromptSubmit",
      timeout: 8,
      statusMessage: "Recalling context...",
    },
    "user-prompt-submit.sh": {
      event: "UserPromptSubmit",
      timeout: 5,
      async: true,
      statusMessage: "Saving prompt observation...",
    },
    "subagent-stop.sh": {
      event: "SubagentStop",
      timeout: 5,
      statusMessage: "Cleaning up subagent...",
    },
    "post-tool-use-failure.sh": {
      event: "PostToolUseFailure",
      timeout: 5,
      statusMessage: "Handling tool failure...",
    },
  };

  // Group hooks into the settings.json format
  const events: Record<
    string,
    Array<{ matcher?: string; hooks: Array<Record<string, unknown>> }>
  > = {};

  if (!existsSync(globalHooksDir)) return events;

  const deployedScripts = readdirSync(globalHooksDir).filter((f) =>
    f.endsWith(".sh"),
  );

  for (const script of deployedScripts) {
    const mapping = scriptEventMap[script];
    if (!mapping) continue;

    const { event, matcher, timeout, async: isAsync, statusMessage } = mapping;

    if (!events[event]) events[event] = [];

    const matcherKey = matcher ?? "__no_matcher__";
    let group = events[event]!.find((g) =>
      matcherKey === "__no_matcher__" ? !g.matcher : g.matcher === matcher,
    );

    if (!group) {
      group = matcher ? { matcher, hooks: [] } : { hooks: [] };
      events[event]!.push(group);
    }

    const hookEntry: Record<string, unknown> = {
      type: "command",
      command: `"${globalHooksDir}/${script}"`,
      timeout,
    };
    if (isAsync) hookEntry.async = true;
    if (statusMessage) hookEntry.statusMessage = statusMessage;

    group.hooks.push(hookEntry);
  }

  return events;
}

// ─── Init command definition ─────────────────────────────────────────────────

export const initCommand = defineCommand({
  meta: {
    name: "init",
    description: "Set up Luca globally and initialize your first project",
  },
  args: {
    "skip-prerequisites": {
      type: "boolean",
      description: "Skip prerequisite checks",
      default: false,
    },
    "skip-vault": {
      type: "boolean",
      description: "Skip per-project initialization",
      default: false,
    },
    "skip-muninndb": {
      type: "boolean",
      description: "Skip MuninnDB binary download and service setup",
      default: false,
    },
    "skip-deploy": {
      type: "boolean",
      description: "Skip deploying Luca artifacts to ~/.claude/",
      default: false,
    },
  },
  async run({ args }) {
    p.intro("luca init");

    // Detect runtime context (used by deploy step)
    const ctx = detectRuntimeContext();
    const modeLabel = ctx.mode === "dev" ? "monorepo dev" : "global install";
    p.log.info(`Runtime mode: ${modeLabel}`);

    // Track status for post-init readout
    let prereqsVersion: string | null = null;
    let prereqsPlatform = "";
    let muninndbHealthy = false;
    let muninndbPort: number | null = null;
    let muninndbBinaryPath: string | null = null;
    let deployedCount = 0;
    let vaultInitRan = false;

    // ── Step 1: Prerequisites ────────────────────────────────────────────
    if (!args["skip-prerequisites"]) {
      p.log.step("Step 1/5: Prerequisites");
      const prereqs = checkPrerequisites();

      if (!prereqs.ok) {
        const shouldContinue = await promptBunInstall();
        if (!shouldContinue) {
          p.outro("Setup cancelled. Install Bun and run `luca init` again.");
          process.exit(1);
        }

        const recheck = checkPrerequisites();
        if (!recheck.ok) {
          logger.error(
            "Bun still not detected. Please install Bun and try again.",
          );
          process.exit(1);
        }
      }

      prereqsVersion = prereqs.bun.version ?? "detected";
      prereqsPlatform = `${prereqs.platform.os}/${prereqs.platform.arch}`;
      p.log.success(`Bun ${prereqsVersion} (${prereqsPlatform})`);
    } else {
      p.log.info("Step 1/5: Prerequisites (skipped)");
    }

    // Ensure ~/.luca/ directory structure
    const homePaths = await ensureLucaHome();
    p.log.success(`Luca home directory: ${homePaths.root}`);

    // ── Step 2: MuninnDB ─────────────────────────────────────────────────
    if (!args["skip-muninndb"]) {
      p.log.step("Step 2/5: MuninnDB");
      const binaryStatus = await checkMuninndbBinary();

      if (!binaryStatus.installed) {
        p.log.info("MuninnDB not found. Downloading...");
        const installResult = await downloadMuninndbBinary();

        if (!installResult.success) {
          p.log.warn(
            `MuninnDB download failed: ${installResult.error ?? "unknown error"}`,
          );
          p.log.warn(
            "You can install MuninnDB later or run `luca init` again.",
          );
        } else {
          muninndbBinaryPath = installResult.binaryPath;
          p.log.success(
            `MuninnDB binary installed: ${installResult.binaryPath}`,
          );
        }
      } else {
        muninndbBinaryPath = binaryStatus.path;
        p.log.success(
          `MuninnDB binary found: ${binaryStatus.path}${binaryStatus.version ? ` (${binaryStatus.version})` : ""}`,
        );
      }

      // Start service if binary is available
      const recheckBinary = await checkMuninndbBinary();
      if (recheckBinary.installed && recheckBinary.executable) {
        p.log.info("Starting MuninnDB service...");
        const serviceStatus = await startMuninndb();

        if (serviceStatus.healthy) {
          muninndbHealthy = true;
          muninndbPort = serviceStatus.port;
          p.log.success(
            `MuninnDB running on port ${serviceStatus.port}${serviceStatus.pid ? ` (PID ${serviceStatus.pid})` : ""}`,
          );
        } else {
          p.log.warn(
            "MuninnDB started but health check failed. It may need a moment to initialize.",
          );
        }
      }

      // PATH guidance
      if (!isOnPath(homePaths.bin)) {
        const guidance = getPathGuidance(homePaths.bin);
        p.note(
          [
            `${homePaths.bin} is not on your PATH.`,
            "Add it so the MuninnDB binary is available globally:",
            "",
            guidance,
          ].join("\n"),
          "PATH Setup Required",
        );
      }
    } else {
      p.log.info("Step 2/5: MuninnDB (skipped)");
    }

    // ── Step 3 & 4: Build artifacts + Deploy ─────────────────────────────
    if (!args["skip-deploy"]) {
      p.log.step("Step 3/5: Build artifacts & deploy");
      const shouldDeploy = await p.confirm({
        message: "Deploy Luca agents, skills, hooks, and rules to ~/.claude/?",
        initialValue: true,
      });

      if (!p.isCancel(shouldDeploy) && shouldDeploy) {
        deployedCount = await runDeployStep(ctx);
      } else {
        p.log.info("Skipping artifact deployment.");
        p.log.info("You can deploy later with: bun scripts/deploy-global.ts");
      }
    } else {
      p.log.info("Step 3/5: Build artifacts & deploy (skipped)");
    }

    // ── Step 5: Vault setup ──────────────────────────────────────────────
    if (!args["skip-vault"]) {
      p.log.step("Step 4/5: Project vault setup");
      const cwd = process.cwd();
      const hasPackageJson = existsSync(join(cwd, "package.json"));

      if (hasPackageJson) {
        const runNow = await p.confirm({
          message:
            "This directory looks like a project. Run `luca vault:init` to set up Luca here?",
          initialValue: true,
        });

        if (!p.isCancel(runNow) && runNow) {
          vaultInitRan = true;
          const { vaultInitCommand } = await import("./vault-init");
          await runMain(vaultInitCommand);
          // vault:init handles its own outro, so skip the readout below
          return;
        }
      }

      p.log.info("To initialize Luca in a project, run:");
      p.log.info("  luca vault:init");
    } else {
      p.log.info("Step 4/5: Vault setup (skipped)");
    }

    // ── Post-init readout ────────────────────────────────────────────────
    const readout: string[] = [];

    // Prerequisites section
    readout.push("Prerequisites:");
    if (prereqsVersion) {
      readout.push(`  Bun ${prereqsVersion} (${prereqsPlatform})`);
    } else {
      readout.push("  Skipped");
    }

    // MuninnDB section
    readout.push("");
    readout.push("MuninnDB:");
    if (args["skip-muninndb"]) {
      readout.push("  Skipped");
    } else if (muninndbHealthy) {
      readout.push(`  Running on port ${muninndbPort}`);
      if (muninndbBinaryPath) {
        readout.push(`  Binary: ${muninndbBinaryPath}`);
      }
    } else {
      readout.push(
        "  Not running (start with `muninndb` or re-run `luca init`)",
      );
    }

    // Artifacts section
    readout.push("");
    readout.push("Artifacts:");
    if (args["skip-deploy"]) {
      readout.push("  Skipped");
    } else if (deployedCount > 0) {
      readout.push(`  ${deployedCount} files deployed to ~/.claude/`);
    } else {
      readout.push("  None deployed");
    }

    // Vault section
    readout.push("");
    readout.push("Vault:");
    if (args["skip-vault"]) {
      readout.push("  Skipped");
    } else {
      readout.push("  Not configured (run `luca vault:init` in a project)");
    }

    // Next steps
    readout.push("");
    readout.push("Next steps:");
    if (deployedCount > 0) {
      readout.push(
        "  To update artifacts after upgrading: bun scripts/deploy-global.ts",
      );
    }
    if (!vaultInitRan) {
      readout.push("  To set up a project: cd <project> && luca vault:init");
    }

    // Directories
    readout.push("");
    readout.push("Directories:");
    readout.push(`  ${homePaths.root}/`);
    readout.push(`  ${homePaths.bin}/`);
    readout.push(`  ${homePaths.manifests}/`);
    readout.push(`  ${homePaths.backups}/`);

    p.note(readout.join("\n"), "Setup Complete");

    p.outro("Luca is ready. Happy building!");
  },
});

/**
 * Run init command directly (used by create-luca and bin/luca.js).
 *
 * Preserves the export contract consumed by index.ts and downstream consumers.
 */
export const runInit = () => runMain(initCommand);
