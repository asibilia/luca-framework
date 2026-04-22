'use client'

import { AGENT_LIST_CONFIG } from '~/hooks/schemas/entity-hook-config'
import { useEntityList } from '~/hooks/use-entity-list'
import type { EntitySummary } from '~/lib/entity-route-helpers'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type UseAgentListReturn = {
    /** Array of agent summaries from the API. */
    agents: EntitySummary[]
    /** Whether the agent list is currently loading. */
    loading: boolean
    /** Error message if the fetch failed. */
    error: string | null
    /** Manually refetch the agent list. */
    refresh: () => void
}

// ---------------------------------------------------------------------------
// Thin wrapper
// ---------------------------------------------------------------------------

/**
 * Fetches the agent list from `/api/entities/agents` and populates the
 * `agentRegistryAtom` server-state mirror.
 *
 * Delegates to the generic `useEntityList` and renames `entities` to
 * `agents` for backward compatibility with existing consumers.
 *
 * @returns Agent list data and status indicators.
 *
 * @example
 * ```ts
 * const { agents, loading, error, refresh } = useAgentList();
 * ```
 */
export function useAgentList(): UseAgentListReturn {
    const { entities, loading, error, refresh } =
        useEntityList(AGENT_LIST_CONFIG)
    return { agents: entities, loading, error, refresh }
}
