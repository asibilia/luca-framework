import type { CheckResult, DoctorCheck } from "../types";
import { readManifest, hashFile } from "../../manifest";

/**
 * Doctor check: detect drift between manifest hashes and current file contents.
 *
 * Reads the Luca manifest and compares the stored originalHash for each
 * tracked file against the current hash on disk. Reports files that have
 * been modified, deleted, or are missing from the manifest.
 *
 * This check helps identify:
 * - Files modified outside of `bunx luca update`
 * - Files accidentally deleted
 * - Stale manifests that don't reflect the current state
 *
 * @example
 * ```typescript
 * const result = await driftDetectionCheck.run();
 * // { name: 'Drift Detection', status: 'pass', message: 'No drift detected (42 files)', ... }
 * ```
 */
export const driftDetectionCheck: DoctorCheck = {
  name: "Drift Detection",

  async run(): Promise<CheckResult> {
    const cwd = process.cwd();
    const manifest = await readManifest(cwd);

    if (!manifest) {
      return {
        name: this.name,
        status: "warning",
        message: "No manifest found — cannot check for drift",
        fixCommand: "bunx luca init",
        details:
          "Run `bunx luca init` to create a Luca project with a manifest.",
      };
    }

    const fileEntries = Object.entries(manifest.files ?? {});

    if (fileEntries.length === 0) {
      return {
        name: this.name,
        status: "warning",
        message: "Manifest has no tracked files",
        fixCommand: "bunx luca update --force",
        details:
          "The manifest exists but tracks no files. Run update to re-scaffold.",
      };
    }

    const modified: string[] = [];
    const deleted: string[] = [];
    let checkedCount = 0;

    for (const [relativePath, entry] of fileEntries) {
      const absolutePath = `${cwd}/${relativePath}`;

      try {
        const file = Bun.file(absolutePath);
        const exists = await file.exists();

        if (!exists) {
          deleted.push(relativePath);
          continue;
        }

        const currentHash = await hashFile(absolutePath);
        if (currentHash !== entry.originalHash) {
          modified.push(relativePath);
        }
        checkedCount++;
      } catch {
        deleted.push(relativePath);
      }
    }

    const totalDrift = modified.length + deleted.length;

    if (totalDrift === 0) {
      return {
        name: this.name,
        status: "pass",
        message: `No drift detected (${checkedCount} files checked)`,
        fixCommand: null,
        details: null,
      };
    }

    const detailLines: string[] = [];

    if (modified.length > 0) {
      detailLines.push(`Modified (${modified.length}):`);
      for (const file of modified.slice(0, 10)) {
        detailLines.push(`  ~ ${file}`);
      }
      if (modified.length > 10) {
        detailLines.push(`  ... and ${modified.length - 10} more`);
      }
    }

    if (deleted.length > 0) {
      detailLines.push(`Deleted (${deleted.length}):`);
      for (const file of deleted.slice(0, 10)) {
        detailLines.push(`  - ${file}`);
      }
      if (deleted.length > 10) {
        detailLines.push(`  ... and ${deleted.length - 10} more`);
      }
    }

    return {
      name: this.name,
      status: "warning",
      message: `${totalDrift} file(s) drifted from manifest (${modified.length} modified, ${deleted.length} deleted)`,
      fixCommand: "bunx luca update  # Re-sync framework files",
      details: detailLines.join("\n"),
    };
  },
};
