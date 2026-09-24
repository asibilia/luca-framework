import uniqBy from 'lodash/uniqBy'

import { DEFAULT_VAULT, type RecalledMemory } from './memory-schemas'

import type { ProposedMemory } from '../agents/role-results'

/**
 * Which vault each memory type goes to, a fixed table. `project` is the
 * engine config's `muninn.vault`. Any other type is refused.
 */
export const MEMORY_ROUTES = {
    pattern: 'default',
    pitfall: 'default',
    procedure: 'default',
    decision: 'project',
} as const

export type MemoryType = keyof typeof MEMORY_ROUTES

const isMemoryType = (type: string): type is MemoryType => type in MEMORY_ROUTES

/** A proposed memory routed to its vault, ready to save. */
export type RoutedMemory = {
    type: MemoryType
    vault: string
    /** The stored concept, `<type>:<concept>`. */
    concept: string
    content: string
    summary: string
}

/** A proposed memory the engine won't save, and why. */
export type RefusedMemory = { type: string; concept: string; reason: string }

/**
 * The concept a memory is stored under: its type in front, as the vaults
 * already name them (`pitfall:bun-junit`). A concept that already starts
 * with its type keeps it once.
 *
 * @example
 * storedConcept({ type: 'pitfall', concept: 'bun-junit' }) // 'pitfall:bun-junit'
 */
export const storedConcept = ({
    type,
    concept,
}: {
    type: string
    concept: string
}): string => {
    const name = concept.trim()
    return name.startsWith(`${type}:`) ? name : `${type}:${name}`
}

/**
 * Routes the learner's proposed memories to their vaults by type, from
 * `MEMORY_ROUTES`: `pattern`, `pitfall`, and `procedure` to `default`, and
 * `decision` to the project vault. A type is read without case or spaces
 * around it. An unknown type is refused with a reason, and so is a
 * `decision` when there is no project vault. Pure.
 *
 * @example
 * routeMemories({ proposals, project_vault: 'luca-monorepo' })
 * // { saves: [{ type: 'pitfall', vault: 'default', concept: 'pitfall:x', ... }], refused: [] }
 */
export const routeMemories = ({
    proposals,
    project_vault,
}: {
    proposals: ProposedMemory[]
    project_vault: string | null
}): { saves: RoutedMemory[]; refused: RefusedMemory[] } => {
    const saves: RoutedMemory[] = []
    const refused: RefusedMemory[] = []
    for (const { type: raw, concept, content, summary } of proposals) {
        const type = raw.trim().toLowerCase()
        if (!isMemoryType(type)) {
            refused.push({
                type: raw,
                concept,
                reason: `Unknown memory type "${raw}": only ${Object.keys(
                    MEMORY_ROUTES
                )
                    .join(', ')
                    .replace(/, (?=[^,]*$)/, ', and ')} are saved.`,
            })
            continue
        }
        const route = MEMORY_ROUTES[type]
        const vault = route === 'project' ? project_vault : DEFAULT_VAULT
        if (vault === null) {
            refused.push({
                type,
                concept,
                reason: `A ${type} goes to the project vault, and the engine config names none (muninn.vault).`,
            })
            continue
        }
        saves.push({
            type,
            vault,
            concept: storedConcept({ type, concept }),
            content,
            summary,
        })
    }
    return { saves, refused }
}

/**
 * The feedback to send once the learner answered: every distinct memory
 * shown in the run (by vault and id), `useful` if the learner listed its id
 * as one that helped. Ids in `helped` that were never shown are ignored.
 * Pure.
 *
 * @example
 * memoryFeedback({ shown, helped: ['01J...'] })
 * // [{ id: '01J...', vault: 'default', useful: true }, ...]
 */
export const memoryFeedback = ({
    shown,
    helped,
}: {
    shown: RecalledMemory[]
    helped: string[]
}): { id: string; vault: string; useful: boolean }[] =>
    uniqBy(shown, ({ vault, id }) => `${vault}\u0000${id}`).map(
        ({ id, vault }) => ({ id, vault, useful: helped.includes(id) })
    )
