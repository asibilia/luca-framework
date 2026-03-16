/**
 * Deploy manifest writer for global Luca artifact deployment.
 *
 * Manages the deploy manifest at `~/.luca/manifests/deploy-manifest.json`,
 * which tracks all artifacts deployed to `~/.claude/` by `luca deploy` or
 * `luca init`. The manifest enables:
 *
 * - `luca update` to diff deployed vs current artifacts
 * - `luca reinit` to know what to remove
 * - Version tracking for upgrade safety
 *
 * Reuses `hashFile()` and `LUCA_VERSION` from `manifest.ts` for consistency.
 * Uses `Bun.file()` and `Bun.write()` for file I/O.
 *
 * @see packages/luca-framework/src/utils/deploy-manifest.schemas.ts for schema definitions
 * @see packages/luca-framework/src/utils/manifest.ts for hashFile() and LUCA_VERSION
 * @see packages/luca-framework/src/utils/luca-home.ts for ~/.luca/ path resolution
 */

import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "pathe";

import { hashFile, LUCA_VERSION } from "./manifest.ts";
import { DeployManifestSchema } from "./deploy-manifest.schemas.ts";

import type {
  DeployManifest,
  DeploySourceType,
} from "./deploy-manifest.schemas.ts";

// ─── Manifest creation ──────────────────────────────────────────────────────

/**
 * Create a deploy manifest from a list of deployed files.
 *
 * Hashes each deployed file using `hashFile()` (SHA-256) and builds the
 * manifest `artifacts` record keyed by relative path. Includes the
 * package version from `LUCA_VERSION` and the current timestamp.
 *
 * @param options - Manifest creation options
 * @param options.sourcePath - Absolute path to the package root that sourced the artifacts
 * @param options.deployedFiles - Array of deployed file descriptors with paths and source types
 * @param options.settingsBackupPath - Optional path to the settings.json backup taken during deploy
 * @returns A validated DeployManifest object ready to be written
 *
 * @example
 * ```typescript
 * const manifest = await createDeployManifest({
 *   sourcePath: "/Users/you/.bun/install/global/node_modules/luca-framework",
 *   deployedFiles: [
 *     { relativePath: "agents/lu-router.md", absolutePath: "/Users/you/.claude/agents/lu-router.md", sourceType: "agent" },
 *     { relativePath: "hooks/session-start.sh", absolutePath: "/Users/you/.claude/hooks/session-start.sh", sourceType: "hook" },
 *   ],
 *   settingsBackupPath: "/Users/you/.luca/backups/settings-2026-03-16T12-00-00-000Z.json",
 * });
 * ```
 */
export async function createDeployManifest(options: {
  sourcePath: string;
  deployedFiles: Array<{
    relativePath: string;
    absolutePath: string;
    sourceType: DeploySourceType;
  }>;
  settingsBackupPath?: string;
}): Promise<DeployManifest> {
  const { sourcePath, deployedFiles, settingsBackupPath } = options;

  const artifacts: DeployManifest["artifacts"] = {};

  for (const file of deployedFiles) {
    try {
      const hash = await hashFile(file.absolutePath);
      artifacts[file.relativePath] = {
        hash,
        source_type: file.sourceType,
      };
    } catch {
      // Skip files that cannot be hashed (deleted, permissions, etc.)
    }
  }

  const manifest: DeployManifest = {
    deployed_at: new Date().toISOString(),
    package_version: LUCA_VERSION,
    mode: "copy",
    source_path: sourcePath,
    settings_backup_path: settingsBackupPath,
    artifacts,
  };

  return manifest;
}

// ─── Manifest writing ───────────────────────────────────────────────────────

/**
 * Write a deploy manifest to disk as pretty-printed JSON.
 *
 * Creates the manifest directory if it does not exist. Writes to
 * `{manifestDir}/deploy-manifest.json` using `Bun.write()`.
 *
 * @param manifest - The DeployManifest object to write
 * @param manifestDir - Absolute path to the manifests directory (e.g., `~/.luca/manifests/`)
 *
 * @example
 * ```typescript
 * import { getLucaHomePaths } from "./luca-home";
 *
 * const paths = getLucaHomePaths();
 * await writeDeployManifest(manifest, paths.manifests);
 * // Writes: ~/.luca/manifests/deploy-manifest.json
 * ```
 */
export async function writeDeployManifest(
  manifest: DeployManifest,
  manifestDir: string,
): Promise<void> {
  if (!existsSync(manifestDir)) {
    await mkdir(manifestDir, { recursive: true });
  }

  const manifestPath = join(manifestDir, "deploy-manifest.json");
  await Bun.write(manifestPath, JSON.stringify(manifest, null, 2));
}

// ─── Manifest reading ───────────────────────────────────────────────────────

/**
 * Read and validate the deploy manifest from disk.
 *
 * Returns null if the manifest file does not exist, cannot be read,
 * or fails Zod schema validation. Uses `DeployManifestSchema.safeParse()`
 * for runtime safety.
 *
 * @param manifestDir - Absolute path to the manifests directory (e.g., `~/.luca/manifests/`)
 * @returns Validated DeployManifest if found and valid, null otherwise
 *
 * @example
 * ```typescript
 * import { getLucaHomePaths } from "./luca-home";
 *
 * const paths = getLucaHomePaths();
 * const manifest = await readDeployManifest(paths.manifests);
 *
 * if (manifest) {
 *   console.log("Last deployed:", manifest.deployed_at);
 *   console.log("Version:", manifest.package_version);
 *   console.log("Artifacts:", Object.keys(manifest.artifacts).length);
 * } else {
 *   console.log("No deploy manifest found.");
 * }
 * ```
 */
export async function readDeployManifest(
  manifestDir: string,
): Promise<DeployManifest | null> {
  const manifestPath = join(manifestDir, "deploy-manifest.json");
  const file = Bun.file(manifestPath);

  const exists = await file.exists();
  if (!exists) {
    return null;
  }

  try {
    const content = await file.text();
    const parsed = JSON.parse(content);
    const result = DeployManifestSchema.safeParse(parsed);

    if (!result.success) {
      return null;
    }

    return result.data;
  } catch {
    return null;
  }
}
