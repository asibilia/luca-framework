import { basename } from 'node:path'

/** The package manifest a changed file must be for the engine to install. */
export const MANIFEST = 'package.json'

/**
 * The install that must leave the committed lockfile as it is: in new
 * worktrees, on the run branch, and to put back a `node_modules` an agent
 * changed.
 */
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

/** The files that decide what the install puts in `node_modules`. */
const DEPENDENCY_FILES = new Set([MANIFEST, 'bun.lock', 'bun.lockb'])

const outsideNodeModules = (path: string): boolean =>
    !path.split('/').includes('node_modules')

/**
 * Whether a ticket's worktree needs its frozen install again after the
 * engine moved its change onto the run branch's tip: the dependency files
 * (manifests, lockfiles) differ between its old base and the new one, and
 * the ticket's own change touches no manifest (if it does, its gates run
 * the install anyway). Pure.
 *
 * @param moved_files - Paths that differ between the old base and the new one.
 * @param ticket_files - Paths the ticket's own change touches.
 *
 * @example
 * rebaseNeedsInstall({ moved_files: ['bun.lock', 'package.json'], ticket_files: ['src/sum.ts'] })
 * // true
 */
export const rebaseNeedsInstall = ({
    moved_files,
    ticket_files,
}: {
    moved_files: string[]
    ticket_files: string[]
}): boolean =>
    dependenciesChanged({ changed_files: moved_files }) &&
    !ticket_files.some(
        (path) => basename(path) === MANIFEST && outsideNodeModules(path)
    )

/**
 * Whether any manifest or lockfile is among these paths (outside
 * `node_modules`). Pure.
 *
 * @example
 * dependenciesChanged({ changed_files: ['bun.lock'] }) // true
 */
export const dependenciesChanged = ({
    changed_files,
}: {
    changed_files: string[]
}): boolean =>
    changed_files.some(
        (path) =>
            DEPENDENCY_FILES.has(basename(path)) && outsideNodeModules(path)
    )
