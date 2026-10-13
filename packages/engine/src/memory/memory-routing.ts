import uniqBy from 'lodash/uniqBy'

import { DEFAULT_VAULT, type RecalledMemory } from './memory-schemas'

import type { ProposedMemory } from '../agents/role-results'

/**
 * Which vault each memory type goes to, a fixed table. `project` is the
 * engine config's `muninn.vault`; `scope` follows the memory's scope. Any
 * other type is refused.
 */
export const MEMORY_ROUTES = {
    pattern: 'scope',
    pitfall: 'scope',
    procedure: 'scope',
    decision: 'project',
} as const

export type MemoryType = keyof typeof MEMORY_ROUTES

const isMemoryType = (type: string): type is MemoryType => type in MEMORY_ROUTES

/**
 * Where the learner says a memory is useful (#406): `repo` goes to the
 * project vault, `anywhere` to `default`. Any other scope is refused.
 */
export const MEMORY_SCOPES = { repo: 'project', anywhere: 'default' } as const

export type MemoryScope = keyof typeof MEMORY_SCOPES

const isMemoryScope = (scope: string): scope is MemoryScope =>
    Object.hasOwn(MEMORY_SCOPES, scope)

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

/** `a, b, and c`. */
const listOf = (names: string[]): string =>
    names.join(', ').replace(/, (?=[^,]*$)/, ', and ')

/**
 * Routes the learner's proposed memories to their vaults, from
 * `MEMORY_ROUTES` and `MEMORY_SCOPES`: a `decision` always goes to the
 * project vault, and a `pattern`, `pitfall`, or `procedure` goes by its
 * scope, `repo` to the project vault and `anywhere` to `default`. A type
 * and a scope are read without case or spaces around them. An unknown
 * type is refused with a reason, and so is a missing or unknown scope
 * (never guessed), and a memory bound for the project vault when there is
 * none. Pure.
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
    for (const {
        type: raw,
        scope: raw_scope,
        concept,
        content,
        summary,
    } of proposals) {
        const type = raw.trim().toLowerCase()
        if (!isMemoryType(type)) {
            refused.push({
                type: raw,
                concept,
                reason: `Unknown memory type "${raw}": only ${listOf(
                    Object.keys(MEMORY_ROUTES)
                )} are saved.`,
            })
            continue
        }
        const scope = raw_scope?.trim().toLowerCase() ?? ''
        if (!isMemoryScope(scope)) {
            const scopes = Object.keys(MEMORY_SCOPES)
                .map((name) => `"${name}"`)
                .join(' or ')
            refused.push({
                type,
                concept,
                reason:
                    raw_scope === undefined
                        ? `The memory has no scope: it must be ${scopes}.`
                        : `Unknown memory scope "${raw_scope}": it must be ${scopes}.`,
            })
            continue
        }
        const route = MEMORY_ROUTES[type]
        const target = route === 'scope' ? MEMORY_SCOPES[scope] : route
        const vault = target === 'project' ? project_vault : DEFAULT_VAULT
        if (vault === null) {
            refused.push({
                type,
                concept,
                reason:
                    route === 'project'
                        ? `A ${type} goes to the project vault, and the engine config names none (muninn.vault).`
                        : `A repo-only ${type} goes to the project vault, and the engine config names none (muninn.vault).`,
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
