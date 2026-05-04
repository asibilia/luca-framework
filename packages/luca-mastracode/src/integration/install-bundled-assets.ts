/**
 * Install bundled assets (slash commands, skills) into the project's
 * `.mastracode/` directory at startup.
 *
 * - **commands**: synced (force-overwrite) so updates propagate.
 * - **skills**: synced (force-overwrite) so updates propagate.
 * - **rules**: NOT installed here — `rules-loader.ts` falls back directly
 *   to the bundled `<pkg>/rules/` directory when `.mastracode/rules/`
 *   doesn't exist, so no copy is needed.
 *
 * Each function accepts an optional `assetsRoot` override for testing.
 * In production the root is resolved from `import.meta.url` — two levels up
 * from `src/integration/` (this file's directory) lands at the package root,
 * where `commands/` and `skills/` live as siblings to `src/`.
 */
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Resolve the bundled-assets root (the package directory containing
 * `commands/`, `skills/`, `rules/`). Computed from `import.meta.url`;
 * safe to call repeatedly.
 */
function defaultAssetsRoot(): string {
    // src/integration → src → package root (where commands/, skills/, rules/ live)
    return join(dirname(fileURLToPath(import.meta.url)), '..', '..')
}

/**
 * Copy bundled .md commands into `.mastracode/commands/`.
 *
 * @param assetsRoot - Optional override for the directory containing the
 *   bundled `commands/` folder. Defaults to the package root resolved from
 *   `import.meta.url`. Primarily intended for tests.
 */
export function installSlashCommands(assetsRoot?: string): void {
    const bundledCommandsDir = join(assetsRoot ?? defaultAssetsRoot(), 'commands')

    if (!existsSync(bundledCommandsDir)) {
        console.warn(`[luca] bundled commands not found at ${bundledCommandsDir} — skipping install`)
        return
    }

    const targetDir = join(process.cwd(), '.mastracode', 'commands')
    if (!existsSync(targetDir)) {
        mkdirSync(targetDir, { recursive: true })
    }

    cpSync(bundledCommandsDir, targetDir, {
        recursive: true,
        force: true, // Always sync bundled commands so updates propagate
    })
}

/**
 * Copy bundled skill folders into `.mastracode/skills/`.
 *
 * @param assetsRoot - Optional override for the directory containing the
 *   bundled `skills/` folder. Defaults to the package root resolved from
 *   `import.meta.url`. Primarily intended for tests.
 */
export function installSkills(assetsRoot?: string): void {
    const bundledSkillsDir = join(assetsRoot ?? defaultAssetsRoot(), 'skills')

    if (!existsSync(bundledSkillsDir)) {
        console.warn(`[luca] bundled skills not found at ${bundledSkillsDir} — skipping install`)
        return
    }

    const targetDir = join(process.cwd(), '.mastracode', 'skills')
    if (!existsSync(targetDir)) {
        mkdirSync(targetDir, { recursive: true })
    }

    cpSync(bundledSkillsDir, targetDir, {
        recursive: true,
        force: true, // Always sync bundled skills so updates propagate
    })
}


