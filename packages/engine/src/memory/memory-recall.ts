import orderBy from 'lodash/orderBy'
import uniqBy from 'lodash/uniqBy'

import {
    DEFAULT_VAULT,
    MAX_MEMORIES_PER_RECALL,
    MIN_MEMORY_SCORE,
    type MemoryHit,
    type RecalledMemory,
} from './memory-schemas'

/**
 * The vaults every search covers: the project vault (the engine config's
 * `muninn.vault`) and `default`. With no project vault, or one named
 * `default`, just `default`, once.
 *
 * @example
 * recallVaults({ project_vault: 'luca-monorepo' }) // ['luca-monorepo', 'default']
 */
export const recallVaults = ({
    project_vault,
}: {
    project_vault: string | null
}): string[] =>
    project_vault === null || project_vault === DEFAULT_VAULT
        ? [DEFAULT_VAULT]
        : [project_vault, DEFAULT_VAULT]

/**
 * Merges the vaults' search results into what a **recall point** shows:
 * every hit tagged with its vault, those below `MIN_MEMORY_SCORE` dropped,
 * one per vault and id (the best), ranked by score (best first), and at
 * most `MAX_MEMORIES_PER_RECALL`. Pure.
 *
 * @example
 * mergeRecalled({ searches: [{ vault: 'proj', hits }, { vault: 'default', hits: more }] })
 * // [{ id, vault: 'default', concept, content, score: 1.2 }, ...] (at most 5)
 */
export const mergeRecalled = ({
    searches,
}: {
    searches: { vault: string; hits: MemoryHit[] }[]
}): RecalledMemory[] => {
    const tagged = searches.flatMap(({ vault, hits }) =>
        hits.map(({ id, concept, content, score }) => ({
            id,
            vault,
            concept,
            content,
            score,
        }))
    )
    const ranked = orderBy(
        tagged.filter(({ score }) => score >= MIN_MEMORY_SCORE),
        ['score'],
        ['desc']
    )
    return uniqBy(ranked, ({ vault, id }) => `${vault}\u0000${id}`).slice(
        0,
        MAX_MEMORIES_PER_RECALL
    )
}
