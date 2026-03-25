"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAtomValue } from "jotai";

import orderBy from "lodash/orderBy";

import { vaultAtom } from "~/stores/vault";
import type {
  MuninnEntity,
  MuninnEntityCluster,
  MuninnEntityTimeline,
  MuninnTimelineEntry,
} from "~/lib/muninn-types";

// -- Types -------------------------------------------------------------------

/** Co-occurrence entry: another entity that appears alongside the target. */
export interface CoOccurrence {
  entity_name: string;
  count: number;
}

/** Data returned by the useEntityDeepDive hook. */
export interface EntityDeepDiveData {
  /** Entity aggregate from /api/muninn/entity/[name]. */
  entity: MuninnEntity | null;
  /** Chronological timeline from /api/muninn/entity/[name]/timeline. */
  timeline: MuninnTimelineEntry[];
  /** Filtered co-occurrences from /api/muninn/entity-clusters. */
  coOccurrences: CoOccurrence[];
  /** Loading state -- true during initial fetch or refresh. */
  loading: boolean;
  /** Error message if the last fetch failed. */
  error: string | null;
  /** Manual refresh trigger (no polling). */
  refresh: () => void;
  /** Timestamp of last successful fetch. */
  lastUpdated: Date | null;
}

// -- Fetch helpers ------------------------------------------------------------

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (res.status === 503) {
    throw createNotConfiguredError("MuninnDB not configured");
  }
  if (!res.ok) {
    throw new Error(`Fetch ${url} failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function createNotConfiguredError(message: string): Error {
  const e = new Error(message);
  e.name = "NotConfiguredError";
  return e;
}

// -- Hook --------------------------------------------------------------------

/**
 * React hook for MuninnDB entity deep-dive data.
 *
 * Fetches entity aggregate, timeline, and co-occurrence clusters in parallel
 * using Promise.allSettled. Follows the useDecisionTrail pattern: fetchingRef
 * guard, NotConfiguredError handling, manual refresh, no polling.
 *
 * @param entityName - The entity name to fetch data for
 * @returns EntityDeepDiveData with entity, timeline, coOccurrences, and loading state
 */
export function useEntityDeepDive(entityName: string): EntityDeepDiveData {
  const vault = useAtomValue(vaultAtom);
  const [entity, setEntity] = useState<MuninnEntity | null>(null);
  const [timeline, setTimeline] = useState<MuninnTimelineEntry[]>([]);
  const [coOccurrences, setCoOccurrences] = useState<CoOccurrence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Prevent double-fetch in React strict mode
  const fetchingRef = useRef(false);

  const fetchAll = useCallback(async () => {
    if (fetchingRef.current || !entityName) return;
    fetchingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const encoded = encodeURIComponent(entityName);
      const v = encodeURIComponent(vault);

      const [entityRes, timelineRes, clustersRes] = await Promise.allSettled([
        fetchJson<MuninnEntity>(`/api/muninn/entity/${encoded}?vault=${v}`),
        fetchJson<MuninnEntityTimeline>(
          `/api/muninn/entity/${encoded}/timeline?vault=${v}`,
        ),
        fetchJson<{ clusters: MuninnEntityCluster[]; count: number }>(
          `/api/muninn/entity-clusters?vault=${v}`,
        ),
      ]);

      // Check for 503 (MuninnDB not configured) -- degrade gracefully
      const isNotConfigured = (result: PromiseSettledResult<unknown>) =>
        result.status === "rejected" &&
        result.reason instanceof Error &&
        result.reason.name === "NotConfiguredError";

      const allNotConfigured =
        isNotConfigured(entityRes) &&
        isNotConfigured(timelineRes) &&
        isNotConfigured(clustersRes);

      if (allNotConfigured) {
        // Not an error state -- just empty results
        setEntity(null);
        setTimeline([]);
        setCoOccurrences([]);
        setLastUpdated(new Date());
      } else {
        // Process entity result
        if (entityRes.status === "fulfilled") {
          setEntity(entityRes.value);
        } else if (!isNotConfigured(entityRes)) {
          // Non-503 error on entity fetch
          const reason = entityRes.reason;
          setError(
            reason instanceof Error
              ? reason.message
              : "Failed to fetch entity data",
          );
        }

        // Process timeline result
        if (timelineRes.status === "fulfilled") {
          setTimeline(timelineRes.value.timeline ?? []);
        } else if (!isNotConfigured(timelineRes)) {
          // Timeline failure is non-fatal if entity succeeded
          if (entityRes.status !== "fulfilled") {
            const reason = timelineRes.reason;
            setError(
              reason instanceof Error
                ? reason.message
                : "Failed to fetch timeline data",
            );
          }
        }

        // Process clusters result -- filter to co-occurrences for this entity
        if (clustersRes.status === "fulfilled") {
          const allClusters = clustersRes.value.clusters ?? [];

          // Keep only clusters where entity_a or entity_b matches entityName
          // Map to { entity_name, count } where entity_name is the OTHER entity
          const filtered = allClusters
            .filter(
              (c) => c.entity_a === entityName || c.entity_b === entityName,
            )
            .map((c) => ({
              entity_name: c.entity_a === entityName ? c.entity_b : c.entity_a,
              count: c.count,
            }));

          // Sort by count descending using lodash orderBy
          const sorted = orderBy(filtered, "count", "desc");
          setCoOccurrences(sorted);
        } else if (!isNotConfigured(clustersRes)) {
          // Clusters failure is non-fatal
          setCoOccurrences([]);
        }

        setLastUpdated(new Date());
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to fetch entity deep-dive data",
      );
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [entityName, vault]);

  // Re-fetch when entityName changes
  useEffect(() => {
    // Reset state when entity changes
    setEntity(null);
    setTimeline([]);
    setCoOccurrences([]);
    setError(null);
    setLastUpdated(null);

    void fetchAll();
  }, [fetchAll]);

  const refresh = useCallback(() => {
    void fetchAll();
  }, [fetchAll]);

  return {
    entity,
    timeline,
    coOccurrences,
    loading,
    error,
    refresh,
    lastUpdated,
  };
}
