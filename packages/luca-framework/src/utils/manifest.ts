import { createHash } from "crypto";
import { readFileSync } from "node:fs";
import { join, relative } from "pathe";
import { sanitizeJsonParse } from "./sanitize";
import type {
  LucaConfig,
  LucaManifest,
  FileComparison,
  FileSource,
} from "../types";

/**
 * Package version — injected at build time by unbuild's replace plugin.
 *
 * At build time, `__LUCA_VERSION__` is replaced with the real version string
 * from package.json (e.g., `"2.4.0"`). When running from source (dev mode),
 * the sentinel is not replaced and the typeof check falls through to read
 * package.json directly.
 */
declare const __LUCA_VERSION__: string | undefined;

export const LUCA_VERSION: string =
  typeof __LUCA_VERSION__ !== "undefined"
    ? __LUCA_VERSION__
    : (() => {
        try {
          // Dev-mode fallback: read version from package.json
          const pkgPath = join(
            import.meta.dir ?? ".",
            "..",
            "..",
            "package.json",
          );
          const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
          return pkg.version ?? "0.0.0-dev";
        } catch {
          return "0.0.0-dev";
        }
      })();

/**
 * Calculate SHA-256 hash of file contents.
 *
 * Used for tracking file modifications and enabling safe updates.
 *
 * @param filePath - Absolute path to file
 * @returns SHA-256 hash as hex string
 *
 * @example
 * ```typescript
 * const hash = await hashFile('/path/to/file.md');
 * // Returns: 'a1b2c3...' (64 character hex string)
 * ```
 */
export async function hashFile(filePath: string): Promise<string> {
  const content = await Bun.file(filePath).bytes();
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Create manifest from generated files.
 *
 * Builds a manifest containing:
 * - Version of Luca that installed the files
 * - Installation timestamp
 * - Configuration used during installation
 * - Hash of each created file for update comparison
 *
 * @param options - Manifest creation options
 * @param options.config - Luca configuration used
 * @param options.cwd - Working directory (for relative paths)
 * @param options.createdFiles - Array of absolute file paths created
 * @returns LucaManifest object
 *
 * @example
 * ```typescript
 * const manifest = await createManifest({
 *   config: { branding: {...}, stack: 'react-ts', workTracker: 'github' },
 *   cwd: '/path/to/project',
 *   createdFiles: ['/path/to/project/.planning/BRAIN.md', ...]
 * });
 * ```
 */
/**
 * Determine the file source for a relative path based on harness directories.
 *
 * Files under `.claude/`, `.cursor/`, or `.pi/` are tagged with their
 * harness-specific source marker. All other files default to "framework".
 *
 * @param relativePath - Path relative to project root
 * @param harnesses - Active harness IDs
 * @returns FileSource value (e.g., "framework", "harness:claude")
 */
export function inferFileSource(
  relativePath: string,
  harnesses: string[],
): FileSource {
  for (const harnessId of harnesses) {
    if (
      relativePath.startsWith(`.${harnessId}/`) ||
      relativePath.startsWith(`.${harnessId}\\`)
    ) {
      return `harness:${harnessId}` as FileSource;
    }
  }
  return "framework";
}

export async function createManifest(options: {
  config: LucaConfig;
  cwd: string;
  createdFiles: string[];
  /** Optional explicit source map overriding auto-detection */
  sourceMap?: Map<string, FileSource>;
}): Promise<LucaManifest> {
  const { config, cwd, createdFiles, sourceMap } = options;
  const now = new Date().toISOString();
  const harnesses: string[] = config.harnesses ?? ["claude", "cursor"];

  const files: LucaManifest["files"] = {};

  for (const filePath of createdFiles) {
    try {
      const hash = await hashFile(filePath);
      const relativePath = relative(cwd, filePath);
      const source =
        sourceMap?.get(relativePath) ??
        inferFileSource(relativePath, harnesses);

      files[relativePath] = {
        originalHash: hash,
        source,
      };
    } catch {
      // Skip files that can't be hashed (directories, etc.)
    }
  }

  return {
    version: LUCA_VERSION,
    installedAt: now,
    updatedAt: now,
    branding: config.branding,
    stack: config.stack,
    workTracker: config.workTracker,
    harnesses: config.harnesses ?? ["claude", "cursor"],
    files,
  };
}

/**
 * Write manifest to .planning/manifest.json.
 *
 * @param manifest - Manifest object to write
 * @param cwd - Working directory (manifest goes in .planning/)
 *
 * @example
 * ```typescript
 * await writeManifest(manifest, process.cwd());
 * // Creates: .planning/manifest.json
 * ```
 */
export async function writeManifest(
  manifest: LucaManifest,
  cwd: string,
): Promise<void> {
  const manifestPath = join(cwd, ".planning", "manifest.json");
  await Bun.write(manifestPath, JSON.stringify(manifest, null, 2));
}

/**
 * Read existing manifest from project.
 *
 * Returns null if manifest doesn't exist or can't be parsed.
 * Used during update operations to compare with current state.
 *
 * @param cwd - Working directory (manifest expected in .planning/)
 * @returns LucaManifest if exists, null otherwise
 *
 * @example
 * ```typescript
 * const manifest = await readManifest(process.cwd());
 * if (manifest) {
 *   console.log('Luca version:', manifest.version);
 * }
 * ```
 */
export async function readManifest(cwd: string): Promise<LucaManifest | null> {
  const manifestPath = join(cwd, ".planning", "manifest.json");
  try {
    const content = await Bun.file(manifestPath).text();
    return sanitizeJsonParse(content) as LucaManifest;
  } catch {
    return null;
  }
}

/**
 * Calculate SHA-256 hash of string content.
 *
 * Used for comparing file contents without reading files from disk.
 * Useful when you already have the content in memory.
 *
 * @param content - String content to hash
 * @returns SHA-256 hash as hex string
 *
 * @example
 * ```typescript
 * const hash = hashContent('Hello, World!');
 * // Returns: 'dffd6021bb2bd5b0af676290809ec3a5...'
 * ```
 */
export function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Compare manifest files with current filesystem and new content.
 *
 * Implements three-way comparison algorithm for safe updates:
 * - unchanged: originalHash === currentHash → safe to update
 * - user-modified: originalHash !== currentHash → conflict (user changed file)
 * - new: no originalHash in manifest → add file (didn't exist before)
 * - deleted: file missing from filesystem → conflict (user deleted file)
 *
 * @param manifest - Existing manifest from project
 * @param newFiles - Map of path → content from new framework version
 * @param cwd - Working directory
 * @returns Array of FileComparison results
 *
 * @example
 * ```typescript
 * const comparisons = await compareFiles(manifest, newFiles, process.cwd());
 *
 * const unchanged = comparisons.filter(c => c.status === 'unchanged');
 * const conflicts = comparisons.filter(c => c.status === 'user-modified');
 * const newFiles = comparisons.filter(c => c.status === 'new');
 * ```
 */
export async function compareFiles(
  manifest: LucaManifest,
  newFiles: Map<string, string>,
  cwd: string,
): Promise<FileComparison[]> {
  const comparisons: FileComparison[] = [];

  for (const [relativePath, newContent] of newFiles) {
    const absolutePath = join(cwd, relativePath);
    const newHash = hashContent(newContent);
    const manifestEntry = manifest.files[relativePath];

    // Check if file exists in manifest (was previously installed)
    if (manifestEntry) {
      const originalHash = manifestEntry.originalHash;

      // Check if file exists on disk
      if (await Bun.file(absolutePath).exists()) {
        try {
          const currentHash = await hashFile(absolutePath);

          if (originalHash === currentHash) {
            // File unchanged since installation → safe to update
            comparisons.push({
              path: relativePath,
              status: "unchanged",
              originalHash,
              currentHash,
              newHash,
            });
          } else {
            // User modified the file → conflict
            comparisons.push({
              path: relativePath,
              status: "user-modified",
              originalHash,
              currentHash,
              newHash,
            });
          }
        } catch {
          // Can't read file - treat as deleted
          comparisons.push({
            path: relativePath,
            status: "deleted",
            originalHash,
            currentHash: null,
            newHash,
          });
        }
      } else {
        // File was deleted from filesystem → conflict
        comparisons.push({
          path: relativePath,
          status: "deleted",
          originalHash,
          currentHash: null,
          newHash,
        });
      }
    } else {
      // File not in manifest → new file to add
      comparisons.push({
        path: relativePath,
        status: "new",
        originalHash: null,
        currentHash: null,
        newHash,
      });
    }
  }

  return comparisons;
}
