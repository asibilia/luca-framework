/**
 * CLI command: luca reinit
 *
 * Force rebuild Luca global artifacts by removing previously deployed
 * files from `~/.claude/` and re-running the full deploy step from init.
 *
 * Workflow:
 * 1. Read current deploy manifest to identify previously deployed artifacts
 * 2. Confirm with user (unless `--force`)
 * 3. Remove all previously deployed artifacts from `~/.claude/`
 * 4. Re-run the full deploy step (delegates to `luca init --skip-prerequisites --skip-vault --skip-muninndb`)
 * 5. Write new deploy manifest
 * 6. Show summary of what was rebuilt
 *
 * @example
 * ```bash
 * # Interactive reinit with confirmation
 * luca reinit
 *
 * # Skip confirmation
 * luca reinit --force
 * ```
 */
import { defineCommand, runMain } from "citty";
import * as p from "@clack/prompts";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "pathe";

import { readDeployManifest } from "../utils/deploy-manifest-writer";
import { getLucaHomePaths } from "../utils/luca-home";
import { detectRuntimeContext } from "../utils/runtime-context";
import { logger } from "../utils/logger";

/**
 * Remove all previously deployed artifacts listed in the deploy manifest.
 *
 * Iterates through the manifest's artifact entries and removes each file
 * from `~/.claude/`. Non-fatal: files that don't exist or can't be removed
 * are silently skipped.
 *
 * @param manifestArtifacts - Record of relative paths to artifact metadata
 * @returns Count of files successfully removed
 *
 * @example
 * ```typescript
 * const manifest = await readDeployManifest(paths.manifests);
 * if (manifest) {
 *   const removed = await removeDeployedArtifacts(manifest.artifacts);
 *   console.log(`Removed ${removed} artifacts`);
 * }
 * ```
 */
async function removeDeployedArtifacts(
  manifestArtifacts: Record<string, unknown>,
): Promise<number> {
  const { claudeGlobal: globalDir } = getLucaHomePaths();
  let removedCount = 0;

  for (const relativePath of Object.keys(manifestArtifacts)) {
    const absolutePath = join(globalDir, relativePath);
    try {
      if (existsSync(absolutePath)) {
        await rm(absolutePath, { force: true });
        removedCount++;
      }
    } catch {
      // Non-fatal: skip files that can't be removed
    }
  }

  return removedCount;
}

export const reinitCommand = defineCommand({
  meta: {
    name: "reinit",
    description: "Force rebuild Luca configuration and files",
  },
  args: {
    force: {
      type: "boolean",
      description: "Skip confirmation",
      default: false,
    },
  },
  async run({ args }) {
    p.intro("luca reinit");

    // Step 1: Detect runtime context
    const ctx = detectRuntimeContext();
    const modeLabel = ctx.mode === "dev" ? "monorepo dev" : "global install";
    p.log.info(`Runtime mode: ${modeLabel}`);

    // Step 2: Read current deploy manifest
    const homePaths = getLucaHomePaths();
    const manifest = await readDeployManifest(homePaths.manifests);

    const artifactCount = manifest ? Object.keys(manifest.artifacts).length : 0;

    if (manifest) {
      p.log.info(
        `Current deployment: v${manifest.package_version}, ${artifactCount} artifacts (deployed ${new Date(manifest.deployed_at).toLocaleDateString()})`,
      );
    } else {
      p.log.warn("No deploy manifest found. Will perform a fresh deployment.");
    }

    // Step 3: Confirm with user (unless --force)
    if (!args.force) {
      const confirmed = await p.confirm({
        message: manifest
          ? `Remove ${artifactCount} deployed artifacts and redeploy from scratch?`
          : "Deploy Luca artifacts to ~/.claude/?",
        initialValue: false,
      });

      if (p.isCancel(confirmed) || !confirmed) {
        p.cancel("Reinit cancelled.");
        process.exit(0);
      }
    }

    // Step 4: Remove previously deployed artifacts
    if (manifest && artifactCount > 0) {
      const spinner = p.spinner();
      spinner.start("Removing deployed artifacts...");

      const removedCount = await removeDeployedArtifacts(manifest.artifacts);

      // Also remove the old deploy manifest
      const manifestPath = join(homePaths.manifests, "deploy-manifest.json");
      if (existsSync(manifestPath)) {
        try {
          await rm(manifestPath, { force: true });
        } catch {
          // Non-fatal
        }
      }

      spinner.stop(`Removed ${removedCount} of ${artifactCount} artifacts`);
    }

    // Step 5: Re-run full deploy via init command
    p.log.info("Re-deploying Luca artifacts...");

    // Delegate to the init command with skip flags to only run the deploy step
    const { initCommand } = await import("./init");
    await runMain(initCommand, {
      rawArgs: ["--skip-prerequisites", "--skip-vault", "--skip-muninndb"],
    });

    // Step 6: Verify new manifest was written
    const newManifest = await readDeployManifest(homePaths.manifests);
    if (newManifest) {
      const newArtifactCount = Object.keys(newManifest.artifacts).length;
      p.log.success(
        `Reinit complete: v${newManifest.package_version}, ${newArtifactCount} artifacts deployed`,
      );
    }

    p.outro("Luca artifacts have been rebuilt.");
  },
});
