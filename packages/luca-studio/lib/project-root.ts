/**
 * Shared project-root resolver for all API routes that read from `.planning/`.
 *
 * Resolution strategy (in priority order):
 * 1. `LUCA_PROJECT_DIR` environment variable (explicit override)
 * 2. `WORKSPACE_ROOT` environment variable (IDE-supplied workspace)
 * 3. Auto-detect: walk up from `process.cwd()` looking for a `.planning/` directory
 * 4. Final fallback: `process.cwd()` (best effort)
 *
 * The result is cached after first resolution for the process lifetime, so
 * subsequent calls are synchronous map lookups rather than filesystem walks.
 */
import { access } from 'node:fs/promises'
import { resolve } from 'node:path'

/** Module-level cache -- populated once per process. */
let cachedRoot: string | null = null

/**
 * Walk up from `startDir` looking for a `.planning/` directory.
 *
 * @param startDir - Absolute path to start the search from.
 * @returns The first ancestor directory containing `.planning/`, or `null`.
 */
async function walkUpForPlanning(startDir: string): Promise<string | null> {
    let current = resolve(startDir)
    const fsRoot = resolve('/')

    while (current !== fsRoot) {
        try {
            await access(resolve(current, '.planning'))
            return current
        } catch {
            /* .planning not found at this level -- keep walking */
        }
        current = resolve(current, '..')
    }
    return null
}

/**
 * Resolve the project root directory for `.planning/` file access.
 *
 * Uses a three-tier resolution strategy:
 * 1. `LUCA_PROJECT_DIR` env var
 * 2. `WORKSPACE_ROOT` env var
 * 3. Auto-detect by walking up from `process.cwd()` for `.planning/`
 *
 * The resolved path is cached after the first call so all API routes share
 * the same value without repeated filesystem access.
 *
 * @returns Absolute path to the project root directory.
 *
 * @example
 * ```typescript
 * const root = await resolveProjectRoot();
 * const configPath = join(root, ".planning", "config.json");
 * ```
 */
export async function resolveProjectRoot(): Promise<string> {
    if (cachedRoot) return cachedRoot

    const envRoot = process.env.LUCA_PROJECT_DIR || process.env.WORKSPACE_ROOT

    if (envRoot) {
        const resolved = resolve(envRoot)
        try {
            await access(resolve(resolved, '.planning'))
            cachedRoot = resolved
            return cachedRoot
        } catch {
            // Env var points to a directory without .planning/ -- fall through to auto-detect
        }
    }

    const detected = await walkUpForPlanning(process.cwd())
    cachedRoot = detected ?? process.cwd()
    return cachedRoot
}
