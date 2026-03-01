import { defineCommand } from "citty";
import * as p from "@clack/prompts";
import { cp, rm, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "pathe";
import { logger } from "../utils/logger";
import {
  readManifest,
  writeManifest,
  compareFiles,
  hashContent,
  inferFileSource,
  LUCA_VERSION,
} from "../utils/manifest";
import {
  getTemplatesDir,
  processTemplate,
  processFilename,
  getAllFiles,
  isTemplateFile,
} from "../utils/template";
import { createBrandingContext } from "../utils/branding";
import type {
  LucaConfig,
  LucaManifest,
  FileComparison,
  FileSource,
  HarnessId,
} from "../types";

/**
 * Get new framework files from templates directory.
 *
 * Reads all template files and processes them with branding context.
 * Returns a map of relative path → processed content.
 */
/**
 * Read and process all files from a template directory into the output map.
 *
 * @param sourceDir - Template source directory
 * @param output - Map to write results into (relative path -> content)
 * @param context - EJS template context
 * @param destPrefix - Optional prefix prepended to output paths (e.g. '.cursor/luca')
 */
async function collectTemplateFiles(
  sourceDir: string,
  output: Map<string, string>,
  context: Record<string, unknown>,
  destPrefix?: string,
): Promise<void> {
  if (!existsSync(sourceDir)) return;

  const files = await getAllFiles(sourceDir);
  for (const relPath of files) {
    const sourcePath = join(sourceDir, relPath);
    const processedRelPath = processFilename(relPath, context);
    const destKey = destPrefix
      ? join(destPrefix, processedRelPath)
      : processedRelPath;

    if (isTemplateFile(relPath)) {
      const content = await Bun.file(sourcePath).text();
      const processedContent = await processTemplate(content, context);
      output.set(destKey, processedContent);
    } else {
      const content = await Bun.file(sourcePath).text();
      output.set(destKey, content);
    }
  }
}

/**
 * Result of collecting new framework files from templates.
 *
 * @property files - Map of relative path to processed content
 * @property sourceMap - Map of relative path to FileSource for manifest tracking
 */
interface FrameworkFilesResult {
  files: Map<string, string>;
  sourceMap: Map<string, FileSource>;
}

async function getNewFrameworkFiles(
  config: LucaConfig,
  cwd: string,
): Promise<FrameworkFilesResult> {
  const templatesDir = getTemplatesDir();
  const newFiles = new Map<string, string>();
  const sourceMap = new Map<string, FileSource>();
  const context = {
    ...createBrandingContext(config.branding),
    config,
  };

  await collectTemplateFiles(join(templatesDir, "base"), newFiles, context);

  if (config.stack !== "custom") {
    await collectTemplateFiles(
      join(templatesDir, "stacks", config.stack),
      newFiles,
      context,
    );
  }

  await collectTemplateFiles(
    join(templatesDir, "framework"),
    newFiles,
    context,
    join(".cursor", "luca"),
  );

  // Collect per-harness templates (agents, rules, skills, hooks, settings)
  const harnesses: HarnessId[] = config.harnesses ?? ["claude", "cursor"];
  for (const harnessId of harnesses) {
    const harnessDir = join(templatesDir, "harness", harnessId);
    if (existsSync(harnessDir)) {
      const beforeKeys = new Set(newFiles.keys());
      await collectTemplateFiles(
        harnessDir,
        newFiles,
        context,
        `.${harnessId}`,
      );
      // Tag newly added files with their harness source
      for (const key of newFiles.keys()) {
        if (!beforeKeys.has(key)) {
          sourceMap.set(key, `harness:${harnessId}` as FileSource);
        }
      }
    }
  }

  // Tag remaining files as "framework"
  for (const key of newFiles.keys()) {
    if (!sourceMap.has(key)) {
      sourceMap.set(key, "framework");
    }
  }

  return { files: newFiles, sourceMap };
}

/**
 * Show dry run summary of what would be updated.
 */
function showDryRunSummary(comparisons: FileComparison[]): void {
  const unchanged = comparisons.filter((c) => c.status === "unchanged");
  const modified = comparisons.filter((c) => c.status === "user-modified");
  const newFiles = comparisons.filter((c) => c.status === "new");
  const deleted = comparisons.filter((c) => c.status === "deleted");

  logger.box(`
Update Preview (Dry Run)

Files to update:    ${unchanged.length}
New files to add:   ${newFiles.length}
Conflicts:          ${modified.length + deleted.length}
  - User modified:  ${modified.length}
  - User deleted:   ${deleted.length}
  `);

  if (unchanged.length > 0) {
    logger.info("Files to update (unchanged since installation):");
    for (const file of unchanged.slice(0, 10)) {
      logger.info(`  ✓ ${file.path}`);
    }
    if (unchanged.length > 10) {
      logger.info(`  ... and ${unchanged.length - 10} more`);
    }
  }

  if (newFiles.length > 0) {
    logger.info("\nNew files to add:");
    for (const file of newFiles.slice(0, 10)) {
      logger.info(`  + ${file.path}`);
    }
    if (newFiles.length > 10) {
      logger.info(`  ... and ${newFiles.length - 10} more`);
    }
  }

  if (modified.length > 0) {
    logger.warn("\nUser-modified files (conflicts):");
    for (const file of modified) {
      logger.warn(`  ⚠ ${file.path}`);
    }
  }

  if (deleted.length > 0) {
    logger.warn("\nUser-deleted files (conflicts):");
    for (const file of deleted) {
      logger.warn(`  ⚠ ${file.path}`);
    }
  }
}

/**
 * Create backup of tracked files.
 */
async function createBackup(
  manifest: LucaManifest,
  cwd: string,
): Promise<string> {
  const backupDir = join(cwd, ".cursor", "luca", ".backup");

  // Remove old backup if exists
  if (existsSync(backupDir)) {
    await rm(backupDir, { recursive: true, force: true });
  }

  await mkdir(backupDir, { recursive: true });

  // Copy all tracked files
  for (const relativePath of Object.keys(manifest.files)) {
    const sourcePath = join(cwd, relativePath);
    const destPath = join(backupDir, relativePath);

    if (await Bun.file(sourcePath).exists()) {
      await mkdir(dirname(destPath), { recursive: true });
      await cp(sourcePath, destPath);
    }
  }

  return backupDir;
}

/**
 * Restore backup on failure.
 */
async function restoreBackup(backupDir: string, cwd: string): Promise<void> {
  if (!existsSync(backupDir)) {
    logger.warn("No backup found to restore");
    return;
  }

  const files = await getAllFiles(backupDir);
  for (const relativePath of files) {
    const sourcePath = join(backupDir, relativePath);
    const destPath = join(cwd, relativePath);

    await mkdir(dirname(destPath), { recursive: true });
    await cp(sourcePath, destPath);
  }

  logger.info("Backup restored successfully");
}

/**
 * Write conflicts to .cursor/luca/conflicts/ directory.
 */
async function handleConflicts(
  conflicts: FileComparison[],
  newFiles: Map<string, string>,
  cwd: string,
): Promise<void> {
  if (conflicts.length === 0) return;

  const conflictsDir = join(cwd, ".cursor", "luca", "conflicts");
  await mkdir(conflictsDir, { recursive: true });

  for (const conflict of conflicts) {
    const newContent = newFiles.get(conflict.path);
    if (newContent) {
      const conflictPath = join(conflictsDir, conflict.path + ".new");
      await mkdir(dirname(conflictPath), { recursive: true });
      await Bun.write(conflictPath, newContent);
    }
  }

  // Write conflict summary
  const summaryPath = join(conflictsDir, "CONFLICTS.md");
  const summary = `# Update Conflicts

The following files have been modified locally and could not be auto-updated.
New versions have been saved with a \`.new\` extension.

## Resolve manually:

${conflicts.map((c) => `- \`${c.path}\` (${c.status})`).join("\n")}

## How to resolve:

1. Compare your version with the \`.new\` version
2. Merge changes as needed
3. Delete the \`.new\` file when resolved
4. Run \`bunx luca update\` again after resolving all conflicts
`;

  await Bun.write(summaryPath, summary);
  logger.info(`Conflict details written to ${conflictsDir}/CONFLICTS.md`);
}

/**
 * Apply updates to files based on comparison results.
 */
async function applyUpdates(
  comparisons: FileComparison[],
  newFiles: Map<string, string>,
  cwd: string,
  options: {
    force: boolean;
    acceptTheirs: boolean;
    acceptMine: boolean;
  },
): Promise<{ updated: string[]; skipped: string[]; conflicted: string[] }> {
  const updated: string[] = [];
  const skipped: string[] = [];
  const conflicted: string[] = [];

  for (const comparison of comparisons) {
    const newContent = newFiles.get(comparison.path);
    if (!newContent) continue;

    const destPath = join(cwd, comparison.path);

    switch (comparison.status) {
      case "unchanged":
      case "new":
        // Safe to update/add
        await mkdir(dirname(destPath), { recursive: true });
        await Bun.write(destPath, newContent);
        updated.push(comparison.path);
        break;

      case "user-modified":
      case "deleted":
        if (options.force || options.acceptTheirs) {
          // Overwrite user changes
          await mkdir(dirname(destPath), { recursive: true });
          await Bun.write(destPath, newContent);
          updated.push(comparison.path);
        } else if (options.acceptMine) {
          // Keep user changes
          skipped.push(comparison.path);
        } else {
          // Conflict - handled separately
          conflicted.push(comparison.path);
        }
        break;
    }
  }

  return { updated, skipped, conflicted };
}

/**
 * Update manifest after successful update.
 *
 * Tags each updated file with its source from the source map,
 * falling back to inferFileSource() for auto-detection.
 *
 * @param manifest - Current manifest
 * @param updatedFiles - Relative paths of files that were written
 * @param newFiles - Map of relative path to content
 * @param cwd - Working directory
 * @param sourceMap - Map of relative path to FileSource
 * @param config - Current config (for harness propagation)
 * @returns Updated manifest
 */
async function updateManifestAfterUpdate(
  manifest: LucaManifest,
  updatedFiles: string[],
  newFiles: Map<string, string>,
  cwd: string,
  sourceMap: Map<string, FileSource>,
  config: LucaConfig,
): Promise<LucaManifest> {
  const now = new Date().toISOString();
  const harnesses = config.harnesses ??
    manifest.harnesses ?? ["claude", "cursor"];
  const updatedManifest: LucaManifest = {
    ...manifest,
    version: LUCA_VERSION,
    updatedAt: now,
    harnesses,
    files: { ...manifest.files },
  };

  for (const relativePath of updatedFiles) {
    const content = newFiles.get(relativePath);
    if (content) {
      const source =
        sourceMap.get(relativePath) ?? inferFileSource(relativePath, harnesses);
      updatedManifest.files[relativePath] = {
        originalHash: hashContent(content),
        source,
      };
    }
  }

  await writeManifest(updatedManifest, cwd);
  return updatedManifest;
}

export const updateCommand = defineCommand({
  meta: {
    name: "update",
    description: "Update Luca framework to the latest version",
  },
  args: {
    force: {
      type: "boolean",
      description: "Force update, overwriting user modifications",
      default: false,
      alias: "f",
    },
    "dry-run": {
      type: "boolean",
      description: "Show what would be updated without making changes",
      default: false,
      alias: "d",
    },
    "accept-theirs": {
      type: "boolean",
      description: "Accept all new framework versions for conflicts",
      default: false,
    },
    "accept-mine": {
      type: "boolean",
      description: "Keep all user modifications, skip conflicting files",
      default: false,
    },
  },
  async run({ args }) {
    const cwd = process.cwd();

    // Step 1: Check Luca is installed (read manifest)
    const manifest = await readManifest(cwd);
    if (!manifest) {
      logger.error("Luca is not installed in this project.");
      logger.info("Run `bunx luca init` to initialize a new Luca project.");
      process.exit(1);
    }

    logger.info(`Current version: ${manifest.version}`);

    // Validate conflicting options
    if (args["accept-theirs"] && args["accept-mine"]) {
      logger.error(
        "Cannot use both --accept-theirs and --accept-mine. Choose one conflict resolution strategy:",
      );
      logger.info("");
      logger.info(
        "  --accept-theirs  Overwrite your local changes with the new framework versions",
      );
      logger.info(
        "  --accept-mine    Keep your local changes and skip conflicting framework files",
      );
      logger.info("");
      logger.info("Or omit both flags to resolve conflicts interactively.");
      process.exit(1);
    }

    // Step 2: Get new framework files from templates
    const spinner = p.spinner();
    spinner.start("Reading framework templates...");

    const config: LucaConfig = {
      branding: manifest.branding,
      stack: manifest.stack,
      workTracker: manifest.workTracker as "jira" | "github" | "none",
      harnesses: manifest.harnesses ?? ["claude", "cursor"],
    };

    const { files: newFiles, sourceMap } = await getNewFrameworkFiles(
      config,
      cwd,
    );
    spinner.stop(`Found ${newFiles.size} framework files`);

    // Step 3: Compare files using compareFiles()
    spinner.start("Comparing files...");
    const comparisons = await compareFiles(manifest, newFiles, cwd);
    spinner.stop("Comparison complete");

    // Step 4: Show summary
    const unchanged = comparisons.filter((c) => c.status === "unchanged");
    const modified = comparisons.filter((c) => c.status === "user-modified");
    const newFilesCount = comparisons.filter((c) => c.status === "new");
    const deleted = comparisons.filter((c) => c.status === "deleted");
    const conflicts = [...modified, ...deleted];

    logger.info(`\nUpdate summary:`);
    logger.info(`  Files to update:   ${unchanged.length}`);
    logger.info(`  New files to add:  ${newFilesCount.length}`);
    logger.info(`  Conflicts:         ${conflicts.length}`);

    // Step 5: Handle dry run
    if (args["dry-run"]) {
      showDryRunSummary(comparisons);
      logger.info("\nDry run complete. No changes were made.");
      return;
    }

    // If nothing to update
    if (
      unchanged.length === 0 &&
      newFilesCount.length === 0 &&
      conflicts.length === 0
    ) {
      logger.info("Everything is up to date!");
      return;
    }

    // Step 6: Handle conflicts based on args or prompt user
    if (
      conflicts.length > 0 &&
      !args.force &&
      !args["accept-theirs"] &&
      !args["accept-mine"]
    ) {
      logger.warn(`\n${conflicts.length} file(s) have been modified locally.`);

      const conflictAction = await p.select({
        message: "How would you like to handle conflicts?",
        options: [
          {
            value: "theirs",
            label: "Accept framework versions (overwrite my changes)",
          },
          { value: "mine", label: "Keep my changes (skip conflicting files)" },
          { value: "manual", label: "Save conflicts for manual resolution" },
          { value: "cancel", label: "Cancel update" },
        ],
      });

      if (p.isCancel(conflictAction) || conflictAction === "cancel") {
        p.cancel("Update cancelled.");
        process.exit(0);
      }

      if (conflictAction === "theirs") {
        (args as Record<string, unknown>)["accept-theirs"] = true;
      } else if (conflictAction === "mine") {
        (args as Record<string, unknown>)["accept-mine"] = true;
      }
      // 'manual' continues with default behavior
    }

    // Step 7: Create backup before changes
    spinner.start("Creating backup...");
    const backupDir = await createBackup(manifest, cwd);
    spinner.stop("Backup created");

    try {
      // Step 8: Apply updates
      spinner.start("Applying updates...");
      const { updated, skipped, conflicted } = await applyUpdates(
        comparisons,
        newFiles,
        cwd,
        {
          force: args.force,
          acceptTheirs: args["accept-theirs"],
          acceptMine: args["accept-mine"],
        },
      );
      spinner.stop("Updates applied");

      // Step 9: Handle conflicts (write to conflicts directory)
      if (conflicted.length > 0) {
        const conflictComparisons = comparisons.filter((c) =>
          conflicted.includes(c.path),
        );
        await handleConflicts(conflictComparisons, newFiles, cwd);
      }

      // Step 10: Update manifest
      spinner.start("Updating manifest...");
      await updateManifestAfterUpdate(
        manifest,
        updated,
        newFiles,
        cwd,
        sourceMap,
        config,
      );
      spinner.stop("Manifest updated");

      // Step 11: Clean up backup (success)
      await rm(backupDir, { recursive: true, force: true });

      // Success output
      p.outro("Update complete!");

      logger.box(`
Update Summary:

Updated:    ${updated.length} files
Skipped:    ${skipped.length} files (user modifications kept)
Conflicts:  ${conflicted.length} files (saved to .cursor/luca/conflicts/)

${conflicted.length > 0 ? "Review conflicts in .cursor/luca/conflicts/ and resolve manually." : ""}
      `);
    } catch (error) {
      spinner.stop("Update failed");

      // Restore backup on failure
      logger.error("Update failed, restoring backup...");
      await restoreBackup(backupDir, cwd);

      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error(`Update failed: ${errorMessage}`);
      logger.info("");
      logger.info("Your files have been restored to their pre-update state.");
      logger.info("");
      logger.info("To recover, try the following:");
      logger.info("  1. Run `bunx luca doctor` to check your installation");
      logger.info(
        "  2. Run `bunx luca update --dry-run` to preview changes without applying them",
      );
      logger.info("  3. If the issue persists, report a bug at:");
      logger.info("     https://github.com/alecsibilia/luca-framework/issues");
      process.exit(1);
    }
  },
});
