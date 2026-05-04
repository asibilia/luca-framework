/**
 * Install bundled assets (slash commands, skills, rules) into the project's
 * `.mastracode/` directory at startup.
 *
 * - **commands**: synced (force-overwrite) so updates propagate.
 * - **skills**: synced (force-overwrite) so updates propagate.
 * - **rules**: cleared and re-installed so removed rules don't persist.
 *
 * Each function accepts an optional `assetsRoot` override for testing.
 * In production the root is resolved from `import.meta.url` — two levels up
 * from `src/integration/` (this file's directory) lands at the package root,
 * where `commands/`, `skills/`, `rules/` live as siblings to `src/`.
 */
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
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

/**
 * Copy bundled rule .md files into `.mastracode/rules/`.
 *
 * Bundled rules are authoritative — clears the installed dir first so
 * stale rules removed from the bundle don't persist indefinitely.
 *
 * @param assetsRoot - Optional override for the directory containing the
 *   bundled `rules/` folder. Defaults to the package root resolved from
 *   `import.meta.url`. Primarily intended for tests.
 */
export function installRules(assetsRoot?: string): void {
    const bundledRulesDir = join(assetsRoot ?? defaultAssetsRoot(), 'rules')

    if (!existsSync(bundledRulesDir)) {
        console.warn(`[luca] bundled rules not found at ${bundledRulesDir} — skipping install`)
        return
    }

    const targetDir = join(process.cwd(), '.mastracode', 'rules')
    if (existsSync(targetDir)) {
        rmSync(targetDir, { recursive: true, force: true })
    }
    mkdirSync(targetDir, { recursive: true })

    cpSync(bundledRulesDir, targetDir, {
        recursive: true,
        force: true,
    })
}
