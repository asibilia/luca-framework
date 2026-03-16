/**
 * Package root resolution for portable build paths.
 *
 * Provides the single source of truth for "where is the Luca source tree?"
 * This replaces scattered `process.cwd()` calls in build scripts that
 * incorrectly assume process.cwd() always equals the monorepo root.
 *
 * The key distinction:
 * - `process.cwd()` = the user's project directory (where they ran the command)
 * - `resolvePackageRoot()` = the Luca package/monorepo source directory
 *
 * In monorepo dev mode these happen to be the same directory, which is why
 * the bug was invisible. In a global install, they are different.
 *
 * @module resolve-package-root
 */

import { existsSync } from "node:fs";
import path from "path";

/**
 * Detect whether we are running inside the monorepo or from a global install.
 *
 * Uses `import.meta.dir` (Bun's equivalent of `__dirname`) to determine the
 * location of this file at runtime. If the path contains the monorepo marker
 * directory structure (`src/shared/__helpers`), we are in dev mode.
 *
 * @returns `true` when running from the monorepo source tree
 */
function isDevMode(): boolean {
  // import.meta.dir resolves to the directory of THIS file at runtime.
  // In the monorepo that will be something like:
  //   /Users/.../luca-framework/src/shared/__helpers
  // In a global install it will be the installed package location.
  const thisDir = import.meta.dir;
  return thisDir.includes("/src/shared/__helpers");
}

/**
 * Resolve the Luca package root directory.
 *
 * This is the single source of truth for "where is the Luca source tree?"
 * All build scripts should use this instead of raw `process.cwd()` when
 * they need to reference files within the Luca package itself (src/,
 * scripts/, .claude/, dist/, package.json, etc.).
 *
 * - **Monorepo dev**: Walks up from this file's directory to find the
 *   monorepo root (the directory containing `src/shared/__helpers`).
 *   This matches the current `process.cwd()` behavior.
 * - **Global install**: Uses `import.meta.dir` to find the installed
 *   package location, then resolves to its root.
 *
 * @returns Absolute path to the Luca package root directory
 *
 * @example
 * ```typescript
 * import { resolvePackageRoot } from "~/shared";
 *
 * // Instead of: path.join(process.cwd(), ".claude")
 * const claudeDir = path.join(resolvePackageRoot(), ".claude");
 *
 * // Instead of: path.join(process.cwd(), "scripts")
 * const scriptsDir = path.join(resolvePackageRoot(), "scripts");
 * ```
 */
export function resolvePackageRoot(): string {
  const thisDir = import.meta.dir;

  if (isDevMode()) {
    // In dev mode, this file lives at {monorepo}/src/shared/__helpers/
    // Walk up 3 levels to reach the monorepo root.
    return path.resolve(thisDir, "..", "..", "..");
  }

  // Global install: this file is bundled inside the installed package.
  // The package root is determined by walking up from import.meta.dir
  // until we find a directory that looks like a package root (has package.json).
  let current = thisDir;
  const root = path.parse(current).root;

  while (current !== root) {
    if (existsSync(path.join(current, "package.json"))) {
      return current;
    }
    current = path.dirname(current);
  }

  // Final fallback: process.cwd() (preserves existing behavior)
  return process.cwd();
}

/**
 * Resolve the `src/` directory within the Luca package.
 *
 * Convenience wrapper over `resolvePackageRoot()` for the common pattern
 * of referencing source files in build scripts.
 *
 * @returns Absolute path to `{packageRoot}/src`
 *
 * @example
 * ```typescript
 * import { resolveSrcDir } from "~/shared";
 *
 * // Instead of: path.join(process.cwd(), "src", "hooks", "scripts")
 * const hookScriptsDir = path.join(resolveSrcDir(), "hooks", "scripts");
 * ```
 */
export function resolveSrcDir(): string {
  return path.join(resolvePackageRoot(), "src");
}

/**
 * Resolve the `scripts/` directory within the Luca package.
 *
 * Convenience wrapper over `resolvePackageRoot()` for build scripts that
 * need to reference sibling scripts.
 *
 * @returns Absolute path to `{packageRoot}/scripts`
 *
 * @example
 * ```typescript
 * import { resolveScriptsDir } from "~/shared";
 *
 * const buildAllPath = path.join(resolveScriptsDir(), "build-all.ts");
 * ```
 */
export function resolveScriptsDir(): string {
  return path.join(resolvePackageRoot(), "scripts");
}
