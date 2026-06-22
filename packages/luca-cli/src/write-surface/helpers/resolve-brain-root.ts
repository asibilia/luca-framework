import { loadCurrentConfig } from '@alecsibilia/luca-core'

import {
    MuninnConfigSectionSchema,
    MuninnRootEntrySchema,
} from './muninn-config.schema.ts'
import { resolveRepoVault } from './resolve-repo-vault.ts'

export interface ResolveBrainRootOptions {
    cwd: string
    /** The brain tree's root concept, e.g. "brain:project-identity". */
    concept: string
}

export interface BrainRoot {
    /** Resolved repo vault name (always present). */
    vault: string
    /**
     * Cached brain-tree root engram ULID, or `null` when this brain tree
     * has not been created for the current vault yet (or the cached entry
     * belongs to a different vault).
     */
    rootId: string | null
}

/**
 * Resolve the cached root ULID for a `brain:*` tree (e.g.
 * `brain:project-identity`, `brain:project-requirements`) in the current
 * repo vault.
 *
 * MuninnDB has no concept lookup and `muninn_recall_tree` rejects a concept
 * passed as `root_id` ("parse ulid: bad data size") — empirically verified.
 * So a brain tree, like the todo backlog, can only be re-opened by its
 * ULID. project-new / seed-memory create the tree with `muninn_remember_tree`
 * and persist the returned `root_id` here (via `luca brain set-root`); readers
 * (phase-plan, session-plan, milestone-new, …) resolve it back through this
 * helper instead of the broken `recall_tree(id="brain:project-identity")`.
 *
 * Vault-scoped: a stored id is honoured only when its recorded vault matches
 * the currently-resolved vault. Returns `rootId: null` (never throws) when the
 * tree is uninitialized for this vault.
 */
export async function resolveBrainRoot({
    cwd,
    concept,
}: ResolveBrainRootOptions): Promise<BrainRoot> {
    const vault = await resolveRepoVault({ cwd })
    const config = await loadCurrentConfig({ cwd })

    const muninn = MuninnConfigSectionSchema.catch({}).parse(config.muninn)
    const entry = MuninnRootEntrySchema.safeParse(muninn.brainRoots?.[concept])
    if (entry.success && entry.data.vault === vault) {
        return { vault, rootId: entry.data.rootId }
    }

    return { vault, rootId: null }
}
