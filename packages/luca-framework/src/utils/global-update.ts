/**
 * Global update utility for Luca artifact deployment.
 *
 * Compares currently deployed artifacts (from deploy manifest) against
 * the current package source, showing new, updated, and removed files.
 * Supports `--dry-run` for preview and writes an updated deploy manifest.
 *
 * This is invoked by `luca update --global` and is separate from the
 * per-project update flow in `update.ts`.
 *
 * @see packages/luca-framework/src/utils/deploy-manifest-writer.ts
 * @see packages/luca-framework/src/utils/luca-home.ts
 * @see packages/luca-framework/src/commands/init.ts for runDeployStep
 */

import * as p from "@clack/prompts";
import {
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  chmodSync,
  mkdirSync,
} from "node:fs";
import { rm } from "node:fs/promises";
import { join, dirname, relative } from "pathe";
import { homedir } from "node:os";

import {
  readDeployManifest,
  createDeployManifest,
  writeDeployManifest,
} from "./deploy-manifest-writer";
import { hashFile } from "./manifest";
import { getLucaHomePaths } from "./luca-home";
import { detectRuntimeContext, resolveMonorepoRoot } from "./runtime-context";

import { inferSourceType } from "./deploy-manifest.schemas";

import type {
  DeployManifest,
  DeploySourceType,
} from "./deploy-manifest.schemas";

/**
 * Diff result for a single artifact comparing old manifest vs current source.
 */
interface ArtifactDiff {
  /** Relative path within ~/.claude/ */
  relativePath: string;
  /** Change type */
  status: "unchanged" | "updated" | "new" | "removed";
  /** Source type for the artifact */
  sourceType: DeploySourceType;
}

/**
 * Result of comparing the current deployment against the source.
 */
interface GlobalUpdateDiff {
  /** All individual file diffs */
  diffs: ArtifactDiff[];
  /** Count of unchanged files */
  unchanged: number;
  /** Count of files with content changes */
  updated: number;
  /** Count of new files not in previous manifest */
  newFiles: number;
  /** Count of files in old manifest but no longer in source */
  removed: number;
}

/**
 * Resolve the source .claude/ directory based on runtime context.
 *
 * In dev mode, walks up from the package directory to find the monorepo root.
 * In global mode, uses the package directory directly.
 *
 * @returns Absolute path to the .claude/ source directory, or null if not found
 */
function resolveSourceClaudeDir(): string | null {
  const ctx = detectRuntimeContext();

  let sourceRoot: string;
  if (ctx.mode === "dev") {
    sourceRoot = resolveMonorepoRoot(ctx.packageDir);
  } else {
    sourceRoot = ctx.packageDir;
  }

  const claudeDir = join(sourceRoot, ".claude");
  if (!existsSync(claudeDir)) {
    return null;
  }

  return claudeDir;
}

/**
 * Recursively collect all files in a directory, returning relative paths.
 *
 * @param dir - Absolute path to search
 * @param base - Base path for computing relative paths (defaults to dir)
 * @returns Array of relative file paths
 */
function collectFiles(dir: string, base?: string): string[] {
  const baseDir = base ?? dir;
  const results: string[] = [];

  if (!existsSync(dir)) return results;

  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath, baseDir));
    } else {
      results.push(relative(baseDir, fullPath));
    }
  }

  return results;
}

/**
 * Compare current deployment against source to produce a diff.
 *
 * Reads the existing deploy manifest and compares against source files
 * to identify new, updated, unchanged, and removed artifacts.
 *
 * @param oldManifest - Previous deploy manifest (null if fresh install)
 * @param sourceClaudeDir - Absolute path to the source .claude/ directory
 * @returns Diff result with categorized artifacts
 *
 * @example
 * ```typescript
 * const diff = await computeGlobalDiff(oldManifest, sourceDir);
 * console.log(`New: ${diff.newFiles}, Updated: ${diff.updated}, Removed: ${diff.removed}`);
 * ```
 */
async function computeGlobalDiff(
  oldManifest: DeployManifest | null,
  sourceClaudeDir: string,
): Promise<GlobalUpdateDiff> {
  const home = homedir();
  const globalDir = join(home, ".claude");
  const diffs: ArtifactDiff[] = [];

  // Collect source files (what should be deployed)
  const sourceFiles = new Set(collectFiles(sourceClaudeDir));

  // Compare against old manifest
  const oldArtifacts = oldManifest?.artifacts ?? {};

  for (const relativePath of sourceFiles) {
    const sourceType = inferSourceType(relativePath);
    const deployedPath = join(globalDir, relativePath);
    const sourcePath = join(sourceClaudeDir, relativePath);

    if (!oldArtifacts[relativePath]) {
      // New file — not in previous manifest
      diffs.push({ relativePath, status: "new", sourceType });
      continue;
    }

    // File exists in both — compare hashes
    if (existsSync(deployedPath)) {
      try {
        const currentHash = await hashFile(sourcePath);
        const oldHash = oldArtifacts[relativePath].hash;
        diffs.push({
          relativePath,
          status: currentHash === oldHash ? "unchanged" : "updated",
          sourceType,
        });
      } catch {
        diffs.push({ relativePath, status: "updated", sourceType });
      }
    } else {
      // Was in manifest but file is missing on disk — treat as new
      diffs.push({ relativePath, status: "new", sourceType });
    }
  }

  // Check for removed files (in old manifest but not in source)
  for (const relativePath of Object.keys(oldArtifacts)) {
    if (!sourceFiles.has(relativePath)) {
      diffs.push({
        relativePath,
        status: "removed",
        sourceType: oldArtifacts[relativePath]!.source_type,
      });
    }
  }

  return {
    diffs,
    unchanged: diffs.filter((d) => d.status === "unchanged").length,
    updated: diffs.filter((d) => d.status === "updated").length,
    newFiles: diffs.filter((d) => d.status === "new").length,
    removed: diffs.filter((d) => d.status === "removed").length,
  };
}

/**
 * Execute global update: deploy changed artifacts and write new manifest.
 *
 * This is the main entry point for `luca update --global`. It compares
 * the source artifacts against the current deployment, copies changed files,
 * and writes an updated deploy manifest.
 *
 * @param options - Update options
 * @param options.dryRun - If true, only show what would change without deploying
 * @returns Exit code: 0 for success, 1 for failure
 *
 * @example
 * ```typescript
 * // Preview changes
 * await executeGlobalUpdate({ dryRun: true });
 *
 * // Apply changes
 * await executeGlobalUpdate({ dryRun: false });
 * ```
 */
export async function executeGlobalUpdate(options: {
  dryRun: boolean;
}): Promise<number> {
  const { dryRun } = options;

  p.intro(dryRun ? "luca update --global --dry-run" : "luca update --global");

  // Resolve source directory
  const sourceClaudeDir = resolveSourceClaudeDir();
  if (!sourceClaudeDir) {
    p.log.error(
      "Build artifacts not found (.claude/ directory missing in source).",
    );
    p.log.info(
      "Run `bun run build:all` first, then re-run `luca update --global`.",
    );
    p.outro("Update failed.");
    return 1;
  }

  // Read existing deploy manifest
  const homePaths = getLucaHomePaths();
  const oldManifest = await readDeployManifest(homePaths.manifests);

  if (oldManifest) {
    p.log.info(
      `Current deployment: v${oldManifest.package_version}, ${Object.keys(oldManifest.artifacts).length} artifacts`,
    );
  } else {
    p.log.info("No existing deployment found. Will perform fresh install.");
  }

  // Compute diff
  const spinner = p.spinner();
  spinner.start("Comparing artifacts...");
  const diff = await computeGlobalDiff(oldManifest, sourceClaudeDir);
  spinner.stop("Comparison complete");

  // Show summary
  p.log.info(`\nGlobal update summary:`);
  p.log.info(`  Unchanged:  ${diff.unchanged}`);
  p.log.info(`  Updated:    ${diff.updated}`);
  p.log.info(`  New:        ${diff.newFiles}`);
  p.log.info(`  Removed:    ${diff.removed}`);

  if (diff.updated === 0 && diff.newFiles === 0 && diff.removed === 0) {
    p.log.success("Everything is up to date!");
    p.outro("No changes needed.");
    return 0;
  }

  // Show details
  const updatedDiffs = diff.diffs.filter((d) => d.status === "updated");
  const newDiffs = diff.diffs.filter((d) => d.status === "new");
  const removedDiffs = diff.diffs.filter((d) => d.status === "removed");

  if (updatedDiffs.length > 0) {
    p.log.info("\nUpdated files:");
    for (const d of updatedDiffs.slice(0, 15)) {
      p.log.info(`  ~ ${d.relativePath}`);
    }
    if (updatedDiffs.length > 15) {
      p.log.info(`  ... and ${updatedDiffs.length - 15} more`);
    }
  }

  if (newDiffs.length > 0) {
    p.log.info("\nNew files:");
    for (const d of newDiffs.slice(0, 15)) {
      p.log.info(`  + ${d.relativePath}`);
    }
    if (newDiffs.length > 15) {
      p.log.info(`  ... and ${newDiffs.length - 15} more`);
    }
  }

  if (removedDiffs.length > 0) {
    p.log.info("\nRemoved files:");
    for (const d of removedDiffs.slice(0, 15)) {
      p.log.info(`  - ${d.relativePath}`);
    }
    if (removedDiffs.length > 15) {
      p.log.info(`  ... and ${removedDiffs.length - 15} more`);
    }
  }

  // Dry run exits here
  if (dryRun) {
    p.outro("Dry run complete. No changes were made.");
    return 0;
  }

  // Apply changes
  const home = homedir();
  const globalDir = join(home, ".claude");
  const ctx = detectRuntimeContext();

  spinner.start("Deploying artifacts...");

  const deployedFiles: Array<{
    relativePath: string;
    absolutePath: string;
    sourceType: DeploySourceType;
  }> = [];

  // Deploy new and updated files
  for (const d of diff.diffs) {
    if (d.status === "unchanged") continue;
    if (d.status === "removed") continue;

    const sourcePath = join(sourceClaudeDir, d.relativePath);
    const targetPath = join(globalDir, d.relativePath);

    try {
      mkdirSync(dirname(targetPath), { recursive: true });
      writeFileSync(targetPath, readFileSync(sourcePath));

      // Make hook scripts executable
      if (d.relativePath.endsWith(".sh")) {
        chmodSync(targetPath, 0o755);
      }

      deployedFiles.push({
        relativePath: d.relativePath,
        absolutePath: targetPath,
        sourceType: d.sourceType,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      p.log.warn(`Failed to deploy ${d.relativePath}: ${msg}`);
    }
  }

  // Remove deleted files
  let removedCount = 0;
  for (const d of removedDiffs) {
    const targetPath = join(globalDir, d.relativePath);
    try {
      if (existsSync(targetPath)) {
        await rm(targetPath, { force: true });
        removedCount++;
      }
    } catch {
      // Non-fatal
    }
  }

  spinner.stop(
    `Deployed ${deployedFiles.length} files, removed ${removedCount}`,
  );

  // Also include unchanged files in manifest (they're still deployed)
  for (const d of diff.diffs) {
    if (d.status === "unchanged") {
      const targetPath = join(globalDir, d.relativePath);
      deployedFiles.push({
        relativePath: d.relativePath,
        absolutePath: targetPath,
        sourceType: d.sourceType,
      });
    }
  }

  // Resolve source root for manifest
  let sourceRoot: string;
  if (ctx.mode === "dev") {
    sourceRoot = resolveMonorepoRoot(ctx.packageDir);
  } else {
    sourceRoot = ctx.packageDir;
  }

  // Write new deploy manifest
  spinner.start("Writing deploy manifest...");
  const newManifest = await createDeployManifest({
    sourcePath: sourceRoot,
    deployedFiles,
  });
  await writeDeployManifest(newManifest, homePaths.manifests);
  spinner.stop("Deploy manifest updated");

  p.outro(
    `Global update complete: ${diff.updated} updated, ${diff.newFiles} new, ${removedCount} removed`,
  );

  return 0;
}
