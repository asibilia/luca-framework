'use client'

import { SKILL_LIST_CONFIG } from '~/hooks/schemas/entity-hook-config'
import { useEntityList } from '~/hooks/use-entity-list'
import type { EntitySummary } from '~/lib/entity-route-helpers'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type UseSkillListReturn = {
    /** Array of skill summaries from the API. */
    skills: EntitySummary[]
    /** Whether the skill list is currently loading. */
    loading: boolean
    /** Error message if the fetch failed. */
    error: string | null
    /** Manually refetch the skill list. */
    refresh: () => void
}

// ---------------------------------------------------------------------------
// Thin wrapper
// ---------------------------------------------------------------------------

/**
 * Fetches the skill list from `/api/entities/skills`.
 *
 * Delegates to the generic `useEntityList` and renames `entities` to
 * `skills` for backward compatibility with existing consumers.
 *
 * @returns Skill list data and status indicators.
 *
 * @example
 * ```ts
 * const { skills, loading, error, refresh } = useSkillList();
 * ```
 */
export function useSkillList(): UseSkillListReturn {
    const { entities, loading, error, refresh } =
        useEntityList(SKILL_LIST_CONFIG)
    return { skills: entities, loading, error, refresh }
}
