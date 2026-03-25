"use client";

import { useCallback, useEffect, useState } from "react";

import { useSetAtom } from "jotai";

import { agentRegistryAtom } from "~/stores/config-atoms";

import type { EntitySummary } from "~/lib/entity-route-helpers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type UseAgentListReturn = {
  /** Array of agent summaries from the API. */
  agents: EntitySummary[];
  /** Whether the agent list is currently loading. */
  loading: boolean;
  /** Error message if the fetch failed. */
  error: string | null;
  /** Manually refetch the agent list. */
  refresh: () => void;
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Fetches the agent list from `/api/entities/agents` and populates the
 * `agentRegistryAtom` server-state mirror.
 *
 * Returns the list, loading state, error state, and a manual refresh function.
 *
 * @returns Agent list data and status indicators.
 *
 * @example
 * ```ts
 * const { agents, loading, error, refresh } = useAgentList();
 * ```
 */
export function useAgentList(): UseAgentListReturn {
  const [agents, setAgents] = useState<EntitySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const setRegistry = useSetAtom(agentRegistryAtom);

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/entities/agents");
      if (!res.ok) {
        throw new Error(`Failed to fetch agents: ${res.status}`);
      }
      const json = (await res.json()) as { data: EntitySummary[] };
      setAgents(json.data);
      // Populate server-state mirror atom
      setRegistry(json.data);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load agent list";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [setRegistry]);

  useEffect(() => {
    void fetchAgents();
  }, [fetchAgents]);

  return { agents, loading, error, refresh: fetchAgents };
}
