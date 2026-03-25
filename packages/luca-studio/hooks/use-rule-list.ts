"use client";

import { useCallback, useEffect, useState } from "react";

import type { EntitySummary } from "~/lib/entity-route-helpers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type UseRuleListReturn = {
  /** Array of rule summaries from the API. */
  rules: EntitySummary[];
  /** Whether the rule list is currently loading. */
  loading: boolean;
  /** Error message if the fetch failed. */
  error: string | null;
  /** Manually refetch the rule list. */
  refresh: () => void;
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Fetches the rule list from `/api/entities/rules`.
 *
 * Returns the list, loading state, error state, and a manual refresh function.
 * Follows the same pattern as `useAgentList`.
 *
 * @returns Rule list data and status indicators.
 *
 * @example
 * ```ts
 * const { rules, loading, error, refresh } = useRuleList();
 * ```
 */
export function useRuleList(): UseRuleListReturn {
  const [rules, setRules] = useState<EntitySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRules = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/entities/rules");
      if (!res.ok) {
        throw new Error(`Failed to fetch rules: ${res.status}`);
      }
      const json = (await res.json()) as { data: EntitySummary[] };
      setRules(json.data);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load rule list";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchRules();
  }, [fetchRules]);

  return { rules, loading, error, refresh: fetchRules };
}
