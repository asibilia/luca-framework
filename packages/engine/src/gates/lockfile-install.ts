import { basename } from 'node:path'

/** The package manifest a changed file must be for the engine to install. */
const MANIFEST = 'package.json'

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
    return target === 'ticket' ? 'bun install' : 'bun install --frozen-lockfile'
}
