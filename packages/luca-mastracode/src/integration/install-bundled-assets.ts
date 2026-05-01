/**
 * Install bundled assets (slash commands, skills, rules) into the project's
 * `.mastracode/` directory at startup.
 *
 * - **commands**: synced (force-overwrite) so updates propagate.
 * - **skills**: synced (force-overwrite) so updates propagate.
 * - **rules**: cleared and re-installed so removed rules don't persist.
 */
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Copy bundled .md commands into `.mastracode/commands/`. */
export function installSlashCommands(): void {
    const thisDir = dirname(fileURLToPath(import.meta.url))
    const bundledCommandsDir = join(thisDir, '..', 'commands')

    if (!existsSync(bundledCommandsDir)) return

    const targetDir = join(process.cwd(), '.mastracode', 'commands')
    if (!existsSync(targetDir)) {
        mkdirSync(targetDir, { recursive: true })
    }

    cpSync(bundledCommandsDir, targetDir, {
        recursive: true,
        force: true, // Always sync bundled commands so updates propagate
    })
}

/** Copy bundled skill folders into `.mastracode/skills/`. */
export function installSkills(): void {
    const thisDir = dirname(fileURLToPath(import.meta.url))
    const bundledSkillsDir = join(thisDir, '..', 'skills')

    if (!existsSync(bundledSkillsDir)) return

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
 */
export function installRules(): void {
    const thisDir = dirname(fileURLToPath(import.meta.url))
    const bundledRulesDir = join(thisDir, '..', 'rules')

    if (!existsSync(bundledRulesDir)) return

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
