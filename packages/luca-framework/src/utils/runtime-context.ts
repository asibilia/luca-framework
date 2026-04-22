import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'

import { dirname, join } from 'pathe'
import { z } from 'zod'

/**
 * Zod schema for the runtime context result.
 *
 * Defines the shape of the object returned by `detectRuntimeContext()`,
 * including the execution mode (global install vs. monorepo dev),
 * the resolved package directory, and the user's home directory.
 */
export const RuntimeContextSchema = z.object({
    /** Whether Luca is running from a global npm/bun install or from the monorepo in dev mode. */
    mode: z.enum(['global', 'dev']),
    /** Absolute path to the package directory containing the running script. */
    packageDir: z.string(),
    /** Absolute path to the user's home directory. */
    homeDir: z.string(),
})

/** Runtime context inferred from the Zod schema. */
export type RuntimeContext = z.infer<typeof RuntimeContextSchema>

/**
 * Detect whether Luca is running from a global install or from the monorepo in dev mode.
 *
 * Uses `import.meta.dir` to determine the absolute directory of the running script.
 * If the resolved path contains `packages/luca-framework/`, Luca is running in dev mode
 * (inside the monorepo). Otherwise, it is running as a globally installed package.
 *
 * @returns A validated `RuntimeContext` object with mode, packageDir, and homeDir.
 *
 * @example
 * ```typescript
 * const ctx = detectRuntimeContext();
 * if (ctx.mode === 'dev') {
 *   console.log('Running from monorepo at:', ctx.packageDir);
 * } else {
 *   console.log('Running from global install');
 * }
 * ```
 */
export function detectRuntimeContext(): RuntimeContext {
    const scriptDir = import.meta.dir
    const isDevMode = scriptDir.includes('packages/luca-framework/')
    const home = homedir()

    const result: RuntimeContext = {
        mode: isDevMode ? 'dev' : 'global',
        packageDir: scriptDir,
        homeDir: home,
    }

    return RuntimeContextSchema.parse(result)
}

/**
 * Walk up from a starting directory to find the monorepo root.
 *
 * Checks for `packages/luca-framework/` in each ancestor directory.
 * Returns the starting directory unchanged if no monorepo marker is found
 * (e.g. when running from a global install).
 *
 * @param startDir - Directory to start walking up from.
 * @returns Absolute path to the monorepo root, or startDir if not found.
 *
 * @example
 * ```typescript
 * const root = resolveMonorepoRoot("/Users/you/luca/packages/luca-framework/src/utils");
 * // Returns: "/Users/you/luca"
 * ```
 */
export function resolveMonorepoRoot(startDir: string): string {
    let dir = startDir
    while (dir !== '/' && !existsSync(join(dir, 'packages/luca-framework'))) {
        dir = dirname(dir)
    }
    return dir
}

/**
 * Walk up from a starting directory to find the root of the
 * `@alecsibilia/luca-framework` install (the directory containing its
 * `package.json`).
 *
 * Used in global/installed mode to resolve the bundled `dist/mastracode/`
 * harness relative to the framework's own install location rather than the
 * user's cwd.
 *
 * @param startDir - Directory to start walking up from (typically `import.meta.dir`).
 * @returns Absolute path to the framework package root, or `null` if not found.
 */
export function resolveFrameworkPackageRoot(startDir: string): string | null {
    let dir = startDir
    while (dir !== '/' && dir !== '') {
        const pkgPath = join(dir, 'package.json')
        if (existsSync(pkgPath)) {
            try {
                const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as {
                    name?: string
                }
                if (pkg.name === '@alecsibilia/luca-framework') {
                    return dir
                }
            } catch {
                // Ignore malformed package.json files and keep walking up.
            }
        }
        dir = dirname(dir)
    }
    return null
}
