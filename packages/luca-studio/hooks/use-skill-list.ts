"use client";

import { useCallback, useEffect, useState } from "react";

import type { EntitySummary } from "~/lib/entity-route-helpers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type UseSkillListReturn = {
  /** Array of skill summaries from the API. */
  skills: EntitySummary[];
  /** Whether the skill list is currently loading. */
  loading: boolean;
  /** Error message if the fetch failed. */
  error: string | null;
  /** Manually refetch the skill list. */
  refresh: () => void;
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Fetches the skill list from `/api/entities/skills`.
 *
 * Returns the list, loading state, error state, and a manual refresh function.
 * Follows the same pattern as `useAgentList`.
 *
 * @returns Skill list data and status indicators.
 *
 * @example
 * ```ts
 * const { skills, loading, error, refresh } = useSkillList();
 * ```
 */
export function useSkillList(): UseSkillListReturn {
  const [skills, setSkills] = useState<EntitySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSkills = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/entities/skills");
      if (!res.ok) {
        throw new Error(`Failed to fetch skills: ${res.status}`);
      }
      const json = (await res.json()) as { data: EntitySummary[] };
      setSkills(json.data);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load skill list";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSkills();
  }, [fetchSkills]);

  return { skills, loading, error, refresh: fetchSkills };
}
