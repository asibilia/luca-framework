import { defineCommand } from "citty";
import * as p from "@clack/prompts";
import { readFile, writeFile, cp, rm, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join, dirname } from "pathe";
import { logger } from "../utils/logger";
import {
  readManifest,
  writeManifest,
  compareFiles,
  hashContent,
} from "../utils/manifest";
import {
  getTemplatesDir,
  processTemplate,
  processFilename,
  getAllFiles,
  isTemplateFile,
} from "../utils/template";
import { createBrandingContext } from "../utils/branding";
import type { LucaConfig, LucaManifest, FileComparison } from "../types";

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
      const content = await readFile(sourcePath, "utf-8");
      const processedContent = await processTemplate(content, context);
      output.set(destKey, processedContent);
    } else {
      const content = await readFile(sourcePath, "utf-8");
      output.set(destKey, content);
    }
  }
}

async function getNewFrameworkFiles(
  config: LucaConfig,
  cwd: string,
): Promise<Map<string, string>> {
  const templatesDir = getTemplatesDir();
  const newFiles = new Map<string, string>();
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

  return newFiles;
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

    if (existsSync(sourcePath)) {
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
      await writeFile(conflictPath, newContent);
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
4. Run \`npx luca update\` again after resolving all conflicts
`;

  await writeFile(summaryPath, summary);
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
        await writeFile(destPath, newContent);
        updated.push(comparison.path);
        break;

      case "user-modified":
      case "deleted":
        if (options.force || options.acceptTheirs) {
          // Overwrite user changes
          await mkdir(dirname(destPath), { recursive: true });
          await writeFile(destPath, newContent);
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
 */
async function updateManifestAfterUpdate(
  manifest: LucaManifest,
  updatedFiles: string[],
  newFiles: Map<string, string>,
  cwd: string,
): Promise<LucaManifest> {
  const now = new Date().toISOString();
  const updatedManifest: LucaManifest = {
    ...manifest,
    updatedAt: now,
    files: { ...manifest.files },
  };

  for (const relativePath of updatedFiles) {
    const content = newFiles.get(relativePath);
    if (content) {
      updatedManifest.files[relativePath] = {
        originalHash: hashContent(content),
        source: "framework",
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
      logger.info("Run `npx luca init` to initialize a new Luca project.");
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
    };

    const newFiles = await getNewFrameworkFiles(config, cwd);
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
      await updateManifestAfterUpdate(manifest, updated, newFiles, cwd);
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
      logger.info("  1. Run `npx luca doctor` to check your installation");
      logger.info(
        "  2. Run `npx luca update --dry-run` to preview changes without applying them",
      );
      logger.info("  3. If the issue persists, report a bug at:");
      logger.info("     https://github.com/alecsibilia/luca-framework/issues");
      process.exit(1);
    }
  },
});
