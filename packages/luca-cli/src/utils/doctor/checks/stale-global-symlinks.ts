/**
 * Doctor check: broken (dangling) symlinks in the global `~/.claude/` tree.
 *
 * Older dev setups symlinked `~/.claude/{skills,commands,agents,hooks}/*`
 * into a repo's build output (e.g. `<repo>/dist/claude/...`). After the
 * v13 restructure those build paths moved, leaving the symlinks dangling.
 * A dangling symlink squatting a target path makes `luca init` crash with
 * `EEXIST: mkdir '.../.claude/skills/<name>'` (mkdir cannot create over a
 * symlink, even with `recursive: true`).
 *
 * This check `lstat`-scans the four global subdirectories for symlinks
 * whose target no longer resolves and reports them; `luca doctor --fix`
 * removes them. Only broken symlinks are touched — real files/directories
 * and live symlinks are left alone.
 */
import { readdir, lstat, stat, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import type { CheckResult, DoctorCheck, DoctorFixResult } from '../types'

const CHECK_NAME = 'Global ~/.claude symlinks'

/** Subdirectories of `~/.claude/` that `luca init` populates. */
const SCANNED_SUBDIRS = ['skills', 'commands', 'agents', 'hooks'] as const

/** Find broken (target-missing) symlinks one level under `~/.claude/<sub>`. */
async function findBrokenSymlinks(): Promise<string[]> {
    const claudeRoot = join(homedir(), '.claude')
    const broken: string[] = []
    for (const sub of SCANNED_SUBDIRS) {
        const dir = join(claudeRoot, sub)
        let entries
        try {
            entries = await readdir(dir, { withFileTypes: true })
        } catch {
            continue // dir absent — nothing to scan
        }
        for (const entry of entries) {
            if (!entry.isSymbolicLink()) continue
            const path = join(dir, entry.name)
            // `stat` follows the link; it throws when the target is missing.
            const resolves = await stat(path).then(
                () => true,
                () => false
            )
            if (!resolves) broken.push(path)
        }
    }
    return broken
}

/** Relative label for display (e.g. `~/.claude/skills/note`). */
function label(path: string): string {
    return path.replace(homedir(), '~')
}

export const staleGlobalSymlinksCheck: DoctorCheck = {
    name: CHECK_NAME,
    scope: 'global',

    async run(): Promise<CheckResult> {
        const broken = await findBrokenSymlinks()
        if (broken.length === 0) {
            return {
                name: CHECK_NAME,
                status: 'pass',
                message: 'no broken symlinks in ~/.claude',
                fixCommand: null,
                details: null,
            }
        }
        return {
            name: CHECK_NAME,
            status: 'warning',
            message: `${broken.length} broken symlink(s) in ~/.claude (can block 'luca init')`,
            fixCommand: 'luca doctor --fix',
            details: [
                'Dangling symlinks (target no longer exists) left by an older',
                "dev install. They make 'luca init' fail with EEXIST when it",
                'tries to create a skill/command/agent at the same path:',
                ...broken.map((p) => `- ${label(p)}`),
            ].join('\n  '),
        }
    },

    async fix(): Promise<DoctorFixResult> {
        const applied: string[] = []
        const errors: string[] = []
        for (const path of await findBrokenSymlinks()) {
            try {
                // `lstat` first so we never follow the link, and `rm` removes
                // the link itself (not its missing target).
                await lstat(path)
                await rm(path, { force: true })
                applied.push(`removed broken symlink ${label(path)}`)
            } catch (err) {
                errors.push(
                    `could not remove ${label(path)}: ${(err as Error).message}`
                )
            }
        }
        return { applied, errors }
    },
}
