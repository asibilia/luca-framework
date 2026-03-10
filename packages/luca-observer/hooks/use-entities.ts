"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import orderBy from "lodash/orderBy";

import type { EntityType, GraphNode } from "~/lib/graph-types";
import { TYPE_DISPLAY } from "~/lib/graph-types";

// -- Fetch helpers -----------------------------------------------------------

function createNotConfiguredError(message: string): Error {
  const e = new Error(message);
  e.name = "NotConfiguredError";
  return e;
}

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

// -- API response type -------------------------------------------------------

interface GraphDataApiResponse {
  nodes: Array<{
    id: string;
    name: string;
    type: EntityType;
    engram_count: number;
    first_seen: number | null;
    last_seen: number | null;
    is_cluster: boolean;
    child_count: number;
    val: number;
  }>;
  links: Array<{
    source: string;
    target: string;
    weight: number;
  }>;
  total_nodes: number;
  total_links: number;
}

// -- Exported types ----------------------------------------------------------

/** An entity summary for the entities list page. */
export interface EntitySummary {
  /** Entity name (unique identifier). */
  name: string;
  /** Resolved entity type. */
  type: EntityType;
  /** Display label for the entity type. */
  typeLabel: string;
  /** Number of engrams mentioning this entity. */
  engramCount: number;
  /** Number of relationships (links) this entity participates in. */
  relationshipCount: number;
  /** Earliest engram timestamp (epoch seconds). */
  firstSeen: number | null;
  /** Latest engram timestamp (epoch seconds). */
  lastSeen: number | null;
}

/** Return type of the useEntities hook. */
export interface EntitiesData {
  /** All entity summaries from the graph data. */
  entities: EntitySummary[];
  /** Total number of entities. */
  totalCount: number;
  /** Whether data is loading. */
  loading: boolean;
  /** Error message if fetch failed. */
  error: string | null;
  /** Timestamp of last successful data fetch. */
  lastUpdated: Date | null;
  /** Whether MuninnDB is configured (not 503). */
  configured: boolean;
  /** Re-fetch all data. */
  refresh: () => void;
}

// -- Hook --------------------------------------------------------------------

/**
 * React hook for the Entities list page.
 *
 * Fetches graph data from /api/muninn/graph-data and transforms nodes
 * into entity summaries with relationship counts computed from links.
 *
 * Follows the canonical use-vault-health.ts pattern:
 * - fetchingRef to prevent double-fetch in React strict mode
 * - Promise.allSettled for resilient data fetching
 * - NotConfiguredError detection for 503 responses
 *
 * @returns EntitiesData with entity list, loading state, and refresh function
 */
export function useEntities(): EntitiesData {
  const [rawNodes, setRawNodes] = useState<GraphNode[]>([]);
  const [rawLinks, setRawLinks] = useState<
    Array<{ source: string; target: string; weight: number }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [configured, setConfigured] = useState(true);

  // Prevent double-fetch in React strict mode
  const fetchingRef = useRef(false);

  const fetchAll = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const [graphRes] = await Promise.allSettled([
        fetchJson<GraphDataApiResponse>("/api/muninn/graph-data"),
      ]);

      // Check for 503 (not configured)
      if (
        graphRes.status === "rejected" &&
        graphRes.reason instanceof Error &&
        graphRes.reason.name === "NotConfiguredError"
      ) {
        setConfigured(false);
      }

      if (graphRes.status === "fulfilled") {
        const data = graphRes.value;

        const nodes: GraphNode[] = data.nodes.map((n) => ({
          id: n.id,
          name: n.name,
          type: n.type,
          is_cluster: n.is_cluster,
          child_count: n.child_count,
          engram_count: n.engram_count,
          first_seen: n.first_seen,
          last_seen: n.last_seen,
          val: n.val,
        }));

        setRawNodes(nodes);
        setRawLinks(data.links);
        setLastUpdated(new Date());
      } else {
        setError(
          graphRes.reason instanceof Error
            ? graphRes.reason.message
            : "Failed to fetch entity data",
        );
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch entity data",
      );
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, []);

  // Initial fetch on mount
  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const refresh = useCallback(() => {
    void fetchAll();
  }, [fetchAll]);

  // -- Derive entity summaries from raw graph data ---------------------------

  const entities = useMemo(() => {
    if (rawNodes.length === 0) return [];

    // Build relationship count map from links
    const relationshipCounts = new Map<string, number>();
    for (const link of rawLinks) {
      relationshipCounts.set(
        link.source,
        (relationshipCounts.get(link.source) ?? 0) + 1,
      );
      relationshipCounts.set(
        link.target,
        (relationshipCounts.get(link.target) ?? 0) + 1,
      );
    }

    // Filter out cluster supernodes, map to EntitySummary
    const summaries: EntitySummary[] = rawNodes
      .filter((node) => !node.is_cluster)
      .map((node) => {
        const display = TYPE_DISPLAY[node.type] ?? TYPE_DISPLAY.other;
        return {
          name: node.name,
          type: node.type,
          typeLabel: display.label,
          engramCount: node.engram_count,
          relationshipCount: relationshipCounts.get(node.id) ?? 0,
          firstSeen: node.first_seen,
          lastSeen: node.last_seen,
        };
      });

    // Sort by engram count descending (most referenced first)
    return orderBy(summaries, "engramCount", "desc");
  }, [rawNodes, rawLinks]);

  return {
    entities,
    totalCount: entities.length,
    loading,
    error,
    lastUpdated,
    configured,
    refresh,
  };
}
