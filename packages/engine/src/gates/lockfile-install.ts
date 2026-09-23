import { basename } from 'node:path'

/** The package manifest a changed file must be for the engine to install. */
export const MANIFEST = 'package.json'

/** The install that must leave the committed lockfile as it is. */
export const FROZEN_INSTALL = 'bun install --frozen-lockfile'

/**
 * The install the engine runs in a new ticket worktree or the run branch's
 * checkout, before any agent or gate: from the lockfile, without changing
 * it. `null` when the worktree has no `package.json`. Pure.
 *
 * @example
 * newWorktreeInstall({ has_manifest: true })
 * // 'bun install --frozen-lockfile'
 */
export const newWorktreeInstall = ({
    has_manifest,
}: {
    has_manifest: boolean
}): string | null => (has_manifest ? FROZEN_INSTALL : null)

/**
 * The install the engine runs before the gates, or `null` when no package
 * manifest changed. Pure.
 *
 * Agents never run the install (it needs the network, which guards deny), so
 * the engine does. In a ticket worktree the install may update `bun.lock`,
 * which then joins the green commit. On the run branch the lockfile is
 * already committed, so the install must not change it.
 *
 * @param changed_files - Paths changed since the worktree's base, committed or not.
 * @param target - Where the gates run: the ticket worktree or the run branch.
 *
 * @example
 * installCommand({ changed_files: ['package.json'], target: 'ticket' })
 * // 'bun install'
 * installCommand({ changed_files: ['src/sum.ts'], target: 'ticket' })
 * // null
 */
export const installCommand = ({
    changed_files,
    target,
}: {
    changed_files: string[]
    target: 'ticket' | 'run_branch'
}): string | null => {
    const manifestChanged = changed_files.some(
        (path) =>
            basename(path) === MANIFEST &&
            !path.split('/').includes('node_modules')
    )
    if (!manifestChanged) return null
    return target === 'ticket' ? 'bun install' : FROZEN_INSTALL
}
