"use client";

import { useCallback, useEffect, useState } from "react";

import { atom, useSetAtom } from "jotai";

import type { EntitySummary } from "~/lib/entity-route-helpers";

import type { EntityListConfig } from "~/hooks/schemas/entity-hook-config";

// ---------------------------------------------------------------------------
// Stable no-op atom for hooks that don't need a registry
// ---------------------------------------------------------------------------

/**
 * A write-only no-op atom used when no registryAtom is configured.
 *
 * This ensures `useSetAtom` is always called unconditionally (React Rules
 * of Hooks), while the setter is safely discarded for entity types that
 * don't populate a server-state mirror.
 */
const noopAtom = atom(null, (_get, _set, _value: unknown) => {
  /* intentional no-op */
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type UseEntityListReturn = {
  /** Array of entity summaries from the API. */
  entities: EntitySummary[];
  /** Whether the entity list is currently loading. */
  loading: boolean;
  /** Error message if the fetch failed. */
  error: string | null;
  /** Manually refetch the entity list. */
  refresh: () => void;
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Generic hook that fetches an entity list from a configured API endpoint.
 *
 * Optionally populates a Jotai registry atom on successful fetch for
 * server-state mirroring. Returns the list, loading state, error state,
 * and a manual refresh function.
 *
 * @param config - Entity-specific list configuration (endpoint, registry atom).
 * @returns Entity list data and status indicators.
 *
 * @example
 * ```ts
 * const { entities, loading, error, refresh } = useEntityList(AGENT_LIST_CONFIG);
 * ```
 */
export function useEntityList(config: EntityListConfig): UseEntityListReturn {
  const [entities, setEntities] = useState<EntitySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Always call useSetAtom unconditionally (Rules of Hooks). When no
  // registry atom is configured, we use the module-level noopAtom.
  const setRegistry = useSetAtom(config.registryAtom ?? noopAtom);
  const hasRegistry = Boolean(config.registryAtom);

  const fetchEntities = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(config.endpoint);
      if (!res.ok) {
        throw new Error(`Failed to fetch ${config.entityType}: ${res.status}`);
      }
      const json = (await res.json()) as { data: EntitySummary[] };
      setEntities(json.data);
      // Populate server-state mirror atom if configured
      if (hasRegistry) {
        setRegistry(json.data);
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : `Failed to load ${config.entityType} list`;
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [config.endpoint, config.entityType, setRegistry, hasRegistry]);

  useEffect(() => {
    void fetchEntities();
  }, [fetchEntities]);

  return { entities, loading, error, refresh: fetchEntities };
}
