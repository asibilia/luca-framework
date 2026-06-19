import { loadCurrentConfig } from '@alecsibilia/luca-core'

import { resolveRepoVault } from './resolve-repo-vault.ts'

export interface ResolveBacklogRootOptions {
    cwd: string
}

export interface BacklogRoot {
    /** Resolved repo vault name (always present). */
    vault: string
    /**
     * Cached backlog-root engram ULID, or `null` when the backlog has not
     * been initialized for this vault yet (no todo created, or the cached
     * entry belongs to a different vault).
     */
    rootId: string | null
}

/**
 * Resolve the cached backlog-root ULID for the current repo vault.
 *
 * MuninnDB exposes no concept/prefix lookup (empirically confirmed:
 * `recall` matches content embeddings, `find_by_entity` matches
 * auto-extracted content entities, and `remember_tree` drops injected
 * entities), so the only stable handle to the backlog-root tree node is
 * its ULID. We persist it in `.luca/config.json#muninn.todoBacklog` and
 * read it here. The entry is vault-scoped: a stored id is honoured only
 * when its recorded vault matches the currently-resolved vault, so
 * switching vaults transparently re-bootstraps a fresh root.
 *
 * Returns `rootId: null` (never throws) when uninitialized — callers
 * branch on that to emit a bootstrap procedure (create the root, then
 * `luca todo set-root`) instead of a direct one.
 */
export async function resolveBacklogRoot(
    opts: ResolveBacklogRootOptions
): Promise<BacklogRoot> {
    const vault = await resolveRepoVault({ cwd: opts.cwd })
    const config = await loadCurrentConfig({ cwd: opts.cwd })

    const muninn = config.muninn
    if (muninn && typeof muninn === 'object' && !Array.isArray(muninn)) {
        const todoBacklog = (muninn as Record<string, unknown>).todoBacklog
        if (
            todoBacklog &&
            typeof todoBacklog === 'object' &&
            !Array.isArray(todoBacklog)
        ) {
            const entry = todoBacklog as Record<string, unknown>
            if (
                entry.vault === vault &&
                typeof entry.rootId === 'string' &&
                entry.rootId.length > 0
            ) {
                return { vault, rootId: entry.rootId }
            }
        }
    }

    return { vault, rootId: null }
}
