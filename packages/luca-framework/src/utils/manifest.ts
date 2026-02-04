import { readFile, writeFile } from 'fs/promises';
import { createHash } from 'crypto';
import { join, relative } from 'pathe';
import type { LucaConfig, LucaManifest } from '../types';

// Package version - will be updated by build process
const LUCA_VERSION = '0.0.1';

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
  const content = await readFile(filePath);
  return createHash('sha256').update(content).digest('hex');
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
export async function createManifest(options: {
  config: LucaConfig;
  cwd: string;
  createdFiles: string[];
}): Promise<LucaManifest> {
  const { config, cwd, createdFiles } = options;
  const now = new Date().toISOString();

  const files: LucaManifest['files'] = {};

  for (const filePath of createdFiles) {
    try {
      const hash = await hashFile(filePath);
      const relativePath = relative(cwd, filePath);

      files[relativePath] = {
        originalHash: hash,
        source: 'framework',
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
export async function writeManifest(manifest: LucaManifest, cwd: string): Promise<void> {
  const manifestPath = join(cwd, '.planning', 'manifest.json');
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
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
  const manifestPath = join(cwd, '.planning', 'manifest.json');
  try {
    const content = await readFile(manifestPath, 'utf-8');
    return JSON.parse(content) as LucaManifest;
  } catch {
    return null;
  }
}
