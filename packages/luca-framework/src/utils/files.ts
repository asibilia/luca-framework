import { rm, mkdir, readdir, copyFile, chmod } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "pathe";
import * as p from "@clack/prompts";
import { copyTemplates, getTemplatesDir } from "./template";
import { createManifest, writeManifest } from "./manifest";
import { sanitizeJsonParse } from "./sanitize";
import { logger } from "./logger";
import { getSkillsForPreset } from "./skill-manifest";
import { getHarnessTemplate } from "./harness-templates";
import type {
  LucaConfig,
  LucaManifest,
  HarnessId,
  PresetId,
  InstallationStats,
} from "../types";

// Track created files for cleanup on error
const createdPaths: string[] = [];

/**
 * Register a created path for potential cleanup.
 *
 * Called internally when files/directories are created during installation.
 * Paths are tracked in creation order for proper reverse cleanup.
 *
 * @param path - Absolute path to track
 */
function trackCreated(path: string) {
  createdPaths.push(path);
}

/**
 * Cleanup all created paths (on error or SIGINT).
 *
 * Removes files and directories in reverse order (deepest first).
 * Silently ignores cleanup errors to ensure best-effort cleanup.
 *
 * @example
 * ```typescript
 * try {
 *   // ... create files
 * } catch (error) {
 *   await cleanupFiles();
 *   throw error;
 * }
 * ```
 */
export async function cleanupFiles() {
  if (createdPaths.length === 0) return;

  logger.warn("Cleaning up partial installation...");

  // Remove in reverse order (deepest first)
  for (const path of createdPaths.reverse()) {
    try {
      await rm(path, { recursive: true, force: true });
      logger.debug(`Removed: ${path}`);
    } catch {
      // Ignore cleanup errors
    }
  }

  createdPaths.length = 0;
}

/**
 * Setup SIGINT handler for cleanup.
 *
 * Registers a process handler that:
 * 1. Shows cancellation message via @clack/prompts
 * 2. Cleans up any partially created files
 * 3. Exits with code 1
 *
 * Call early in the init command before any file operations.
 *
 * @example
 * ```typescript
 * async run({ args }) {
 *   setupCleanupHandler();
 *   // ... rest of init command
 * }
 * ```
 */
export function setupCleanupHandler() {
  process.once("SIGINT", async () => {
    p.cancel("\nInstallation cancelled.");
    await cleanupFiles();
    process.exit(1);
  });
}

/**
 * Generate all Luca files from templates.
 *
 * Creates directory structure and copies templates with branding substitution.
 * Tracks all created paths for cleanup on error.
 *
 * Directory structure created:
 * - `.planning/` - Planning artifacts
 * - `.cursor/luca/` - Framework files
 * - `.cursor/agents/` - Agent definitions
 * - `.cursor/rules/` - Cursor rules
 * - `.cursor/skills/` - Luca skills
 *
 * @param options - Generation options
 * @param options.config - Luca configuration with branding
 * @param options.cwd - Working directory (default: process.cwd())
 * @returns Result with success status, manifest if successful, error if failed
 *
 * @example
 * ```typescript
 * const result = await generateFiles({
 *   config: {
 *     branding: { frameworkName: 'Luca', commandPrefix: 'lu', ... },
 *     stack: 'react-ts',
 *     workTracker: 'github'
 *   }
 * });
 *
 * if (result.success) {
 *   console.log('Installed', Object.keys(result.data.files).length, 'files');
 * }
 * ```
 */
export async function generateFiles(options: {
  config: LucaConfig;
  cwd?: string;
}): Promise<
  | { success: true; data: LucaManifest; stats: InstallationStats }
  | { success: false; error: string }
> {
  // Reset tracked paths from any previous invocation
  createdPaths.length = 0;

  const { config, cwd = process.cwd() } = options;
  const templatesDir = getTemplatesDir();
  const harnesses: HarnessId[] = config.harnesses ?? ["claude", "cursor"];

  // Track installation stats by category
  const stats: InstallationStats = {
    agent_count: 0,
    skill_count: 0,
    rule_count: 0,
    hook_count: 0,
    harnesses_installed: [...harnesses],
  };

  const spinner = p.spinner();

  try {
    // Step 1: Create directories (conditional per harness)
    spinner.start("Creating directories...");

    const planningDir = join(cwd, ".planning");
    const dirs: string[] = [planningDir];

    if (harnesses.includes("cursor")) {
      const cursorDir = join(cwd, ".cursor");
      dirs.push(
        join(cursorDir, "luca"),
        join(cursorDir, "agents"),
        join(cursorDir, "rules"),
        join(cursorDir, "skills"),
      );
    }

    if (harnesses.includes("claude")) {
      dirs.push(join(cwd, ".claude"));
    }

    if (harnesses.includes("pi")) {
      dirs.push(join(cwd, ".pi"));
    }

    for (const dir of dirs) {
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
        trackCreated(dir);
      }
    }

    spinner.stop("Directories created");

    // Step 2: Copy base templates
    spinner.start("Copying base templates...");

    const baseTemplatesDir = join(templatesDir, "base");
    const { processed: baseProcessed } = await copyTemplates({
      sourceDir: baseTemplatesDir,
      destDir: cwd,
      config,
    });

    for (const file of baseProcessed) {
      trackCreated(join(cwd, file));
    }

    spinner.stop(`Copied ${baseProcessed.length} base files`);

    // Step 2.5: Merge stack-aware harness config into generated config.json
    const generatedConfigPath = join(cwd, ".planning", "config.json");
    if (existsSync(generatedConfigPath)) {
      try {
        const configText = await Bun.file(generatedConfigPath).text();
        const configObj = sanitizeJsonParse(configText) as Record<
          string,
          unknown
        >;

        // Only add harness section if not already present
        if (!configObj.harness) {
          const harnessTemplate = getHarnessTemplate(config.stack);
          configObj.harness = harnessTemplate;
          await Bun.write(
            generatedConfigPath,
            JSON.stringify(configObj, null, 2) + "\n",
          );
          logger.debug(
            `Merged harness config for stack "${config.stack}" into config.json`,
          );
        }
      } catch (error) {
        // Non-fatal: config will work without harness section
        logger.debug(
          `Could not merge harness config: ${error instanceof Error ? error.message : "unknown error"}`,
        );
      }
    }

    // Step 3: Copy stack-specific templates (if not custom)
    if (config.stack !== "custom") {
      spinner.start(`Copying ${config.stack} stack templates...`);

      const stackTemplatesDir = join(templatesDir, "stacks", config.stack);
      if (existsSync(stackTemplatesDir)) {
        const { processed: stackProcessed } = await copyTemplates({
          sourceDir: stackTemplatesDir,
          destDir: cwd,
          config,
        });

        for (const file of stackProcessed) {
          trackCreated(join(cwd, file));
        }

        spinner.stop(`Copied ${stackProcessed.length} stack files`);
      } else {
        spinner.stop(
          `Stack template ${config.stack} not found, using base only`,
        );
      }
    }

    // Step 4: Copy framework files (.cursor/luca/) — only if cursor harness selected
    if (harnesses.includes("cursor")) {
      spinner.start("Installing framework files...");

      const cursorDir = join(cwd, ".cursor");
      const lucaDir = join(cursorDir, "luca");
      const frameworkTemplatesDir = join(templatesDir, "framework");
      if (existsSync(frameworkTemplatesDir)) {
        const { processed: frameworkProcessed, copied: frameworkCopied } =
          await copyTemplates({
            sourceDir: frameworkTemplatesDir,
            destDir: lucaDir,
            config,
          });

        spinner.stop(
          `Installed ${frameworkProcessed.length + frameworkCopied.length} framework files`,
        );
      } else {
        spinner.stop("Framework templates not found");
      }
    }

    // Hook templates shared between Claude and Cursor
    const hookTemplatesDir = join(templatesDir, "hooks");

    // Step 4.5: Install Claude Code hooks — only if claude harness selected
    if (harnesses.includes("claude")) {
      spinner.start("Installing Claude Code hooks...");

      const claudeDir = join(cwd, ".claude");
      const claudeHooksDir = join(claudeDir, "hooks");

      if (!existsSync(claudeHooksDir)) {
        await mkdir(claudeHooksDir, { recursive: true });
        trackCreated(claudeHooksDir);
      }

      if (existsSync(hookTemplatesDir)) {
        const hookScriptsDir = join(hookTemplatesDir, "scripts");
        if (existsSync(hookScriptsDir)) {
          const hookFiles = await readdir(hookScriptsDir);
          let hooksCopied = 0;

          for (const hookFile of hookFiles) {
            const srcPath = join(hookScriptsDir, hookFile);
            const destPath = join(claudeHooksDir, hookFile);

            await copyFile(srcPath, destPath);
            trackCreated(destPath);

            try {
              await chmod(destPath, 0o755);
            } catch {
              // chmod may fail on some platforms (Windows), non-fatal
            }

            hooksCopied++;
          }

          // Generate .claude/settings.json from hook settings template
          const settingsHooksPath = join(
            hookTemplatesDir,
            "settings-hooks.json",
          );
          const claudeSettingsPath = join(claudeDir, "settings.json");

          if (await Bun.file(settingsHooksPath).exists()) {
            let existingSettings: Record<string, unknown> = {};

            if (await Bun.file(claudeSettingsPath).exists()) {
              try {
                const existing = await Bun.file(claudeSettingsPath).text();
                existingSettings = sanitizeJsonParse(existing) as Record<
                  string,
                  unknown
                >;
              } catch {
                // Invalid JSON — start fresh
              }
            }

            const hooksContent = await Bun.file(settingsHooksPath).text();
            const hooksSettings = sanitizeJsonParse(hooksContent) as Record<
              string,
              unknown
            >;

            existingSettings.hooks = hooksSettings.hooks;

            await Bun.write(
              claudeSettingsPath,
              JSON.stringify(existingSettings, null, 2) + "\n",
            );
            trackCreated(claudeSettingsPath);
          }

          stats.hook_count += hooksCopied;
          spinner.stop(`Installed ${hooksCopied} hook scripts + settings.json`);
        } else {
          spinner.stop("Hook scripts directory not found, skipping hooks");
        }
      } else {
        spinner.stop("Hook templates not found, skipping hooks");
      }
    }

    // Step 4.6: Install Cursor hooks — only if cursor harness selected
    if (harnesses.includes("cursor")) {
      spinner.start("Installing Cursor hooks...");

      const cursorDir = join(cwd, ".cursor");
      const cursorHooksDir = join(cursorDir, "hooks");

      if (!existsSync(cursorHooksDir)) {
        await mkdir(cursorHooksDir, { recursive: true });
        trackCreated(cursorHooksDir);
      }

      if (existsSync(hookTemplatesDir)) {
        const hookScriptsDirCursor = join(hookTemplatesDir, "scripts");
        if (existsSync(hookScriptsDirCursor)) {
          const cursorHookFiles = await readdir(hookScriptsDirCursor);
          let cursorHooksCopied = 0;

          for (const hookFile of cursorHookFiles) {
            const srcPath = join(hookScriptsDirCursor, hookFile);
            const destPath = join(cursorHooksDir, hookFile);

            await copyFile(srcPath, destPath);
            trackCreated(destPath);

            try {
              await chmod(destPath, 0o755);
            } catch {
              // chmod may fail on Windows
            }

            cursorHooksCopied++;
          }

          const cursorHooksJsonSrc = join(
            hookTemplatesDir,
            "cursor-hooks.json",
          );
          const cursorHooksJsonDest = join(cursorDir, "hooks.json");

          if (await Bun.file(cursorHooksJsonSrc).exists()) {
            await copyFile(cursorHooksJsonSrc, cursorHooksJsonDest);
            trackCreated(cursorHooksJsonDest);
          }

          stats.hook_count += cursorHooksCopied;
          spinner.stop(
            `Installed ${cursorHooksCopied} Cursor hook scripts + hooks.json`,
          );
        } else {
          spinner.stop(
            "Hook scripts directory not found, skipping Cursor hooks",
          );
        }
      } else {
        spinner.stop("Hook templates not found, skipping Cursor hooks");
      }
    }

    // Step 4.7: Copy per-harness templates (agents, rules, skills, settings)
    // Filter skills based on preset — agents, rules, hooks are always copied
    const preset: PresetId = config.preset ?? "standard";
    const allowedSkills = new Set(getSkillsForPreset(preset));

    // Track unique agents/skills/rules across harnesses to avoid double-counting
    const seenAgents = new Set<string>();
    const seenSkills = new Set<string>();
    const seenRules = new Set<string>();

    for (const harnessId of harnesses) {
      const harnessTemplatesDir = join(templatesDir, "harness", harnessId);
      if (existsSync(harnessTemplatesDir)) {
        spinner.start(`Installing ${harnessId} platform files...`);

        const harnessDestDir = join(cwd, `.${harnessId}`);
        const { processed: harnessProcessed, copied: harnessCopied } =
          await copyTemplates({
            sourceDir: harnessTemplatesDir,
            destDir: harnessDestDir,
            config,
            filter: (relPath) => {
              // Only filter files under skills/ directory
              if (!relPath.startsWith("skills/")) return true;
              // Extract skill directory name (skills/{name}/...)
              const skillName = relPath.split("/")[1];
              // Allow index.json (skill catalog) and files in allowed skill dirs
              if (!skillName || skillName.includes(".")) return true;
              return allowedSkills.has(skillName);
            },
          });

        const allHarnessFiles = [...harnessProcessed, ...harnessCopied];

        for (const file of allHarnessFiles) {
          trackCreated(join(harnessDestDir, file));

          // Categorize by path prefix for stats (deduplicate across harnesses)
          const baseName = file.split("/").pop() ?? file;
          if (file.startsWith("agents/")) {
            if (!seenAgents.has(baseName)) {
              seenAgents.add(baseName);
              stats.agent_count++;
            }
          } else if (file.startsWith("skills/")) {
            // Skills are directories; count by top-level skill dir name
            const skillName = file.split("/")[1];
            if (skillName && !seenSkills.has(skillName)) {
              seenSkills.add(skillName);
              stats.skill_count++;
            }
          } else if (file.startsWith("rules/")) {
            if (!seenRules.has(baseName)) {
              seenRules.add(baseName);
              stats.rule_count++;
            }
          }
        }

        spinner.stop(`Installed ${allHarnessFiles.length} ${harnessId} files`);
      }
    }

    // Log skill filtering summary (once, after all harnesses)
    if (seenSkills.size > 0) {
      logger.info(
        `Skills: ${seenSkills.size} installed (${preset} preset, ${allowedSkills.size} allowed)`,
      );
    }

    // Step 5: Create manifest
    spinner.start("Creating manifest...");

    const manifest = await createManifest({
      config,
      cwd,
      createdFiles: createdPaths,
    });

    await writeManifest(manifest, cwd);
    trackCreated(join(cwd, ".planning", "manifest.json"));

    spinner.stop("Manifest created");

    // Clear tracking (success - don't cleanup)
    createdPaths.length = 0;

    return { success: true, data: manifest, stats };
  } catch (error) {
    spinner.stop("Error during file generation");

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    logger.error(`File generation failed: ${errorMessage}`);

    // Cleanup on error
    await cleanupFiles();

    return { success: false, error: errorMessage };
  }
}
