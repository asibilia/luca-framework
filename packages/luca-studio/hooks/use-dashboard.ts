"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAtomValue } from "jotai";

import type { MuninnEngram, MuninnStatsResponse } from "~/lib/muninn-types";
import type { Todo } from "~/hooks/use-todos";
import { vaultAtom } from "~/stores/vault";

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

// -- Category resolution -----------------------------------------------------

const KNOWN_CATEGORIES = new Set([
  "pattern",
  "decision",
  "pitfall",
  "preference",
]);

function resolveCategory(engram: MuninnEngram): string {
  if (engram.memory_type && KNOWN_CATEGORIES.has(engram.memory_type)) {
    return engram.memory_type;
  }
  const colonIndex = engram.concept.indexOf(":");
  if (colonIndex > 0) {
    const prefix = engram.concept.slice(0, colonIndex).toLowerCase().trim();
    if (KNOWN_CATEGORIES.has(prefix)) {
      return prefix;
    }
  }
  return "other";
}

// -- Exported types ----------------------------------------------------------

/** Summary stats for the dashboard overview cards. */
export interface DashboardStats {
  engram_count: number;
  vault_count: number;
  coherence_score: number | null;
  storage_bytes: number;
  learning_total: number;
  patterns: number;
  decisions: number;
  pitfalls: number;
  entity_count: number;
  relationship_count: number;
}

/** Return type of the useDashboard hook. */
export interface DashboardData {
  stats: DashboardStats;
  recentEngrams: MuninnEngram[];
  todos: Todo[];
  configured: boolean;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => void;
}

// -- Default stats -----------------------------------------------------------

const DEFAULT_STATS: DashboardStats = {
  engram_count: 0,
  vault_count: 0,
  coherence_score: null,
  storage_bytes: 0,
  learning_total: 0,
  patterns: 0,
  decisions: 0,
  pitfalls: 0,
  entity_count: 0,
  relationship_count: 0,
};

// -- Hook --------------------------------------------------------------------

/**
 * React hook aggregating dashboard data from multiple API endpoints.
 *
 * Fetches vault stats, engrams, graph data, and todos in parallel.
 * Computes derived metrics for the overview cards.
 *
 * @returns DashboardData with aggregated stats, recent engrams, todos
 */
export function useDashboard(): DashboardData {
  const vault = useAtomValue(vaultAtom);
  const [stats, setStats] = useState<DashboardStats>(DEFAULT_STATS);
  const [recentEngrams, setRecentEngrams] = useState<MuninnEngram[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchingRef = useRef(false);

  const fetchAll = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const v = encodeURIComponent(vault);
      const [statsRes, engramsRes, graphRes, todosRes] =
        await Promise.allSettled([
          fetchJson<MuninnStatsResponse>(`/api/muninn/stats?vault=${v}`),
          fetchJson<{ engrams: MuninnEngram[] }>(
            `/api/muninn/engrams?vault=${v}&limit=200`,
          ),
          fetchJson<{ nodes: unknown[]; links: unknown[] }>(
            `/api/muninn/graph-data?vault=${v}`,
          ),
          fetchJson<Todo[]>("/api/todos"),
        ]);

      // Check for 503 (not configured)
      const notConfigured = [statsRes, engramsRes].some(
        (r) =>
          r.status === "rejected" &&
          r.reason instanceof Error &&
          r.reason.name === "NotConfiguredError",
      );
      if (notConfigured) {
        setConfigured(false);
      }

      // Parse vault stats
      let vaultStats: MuninnStatsResponse | null = null;
      if (statsRes.status === "fulfilled") {
        vaultStats = statsRes.value;
      }

      // Parse engrams
      let engrams: MuninnEngram[] = [];
      if (engramsRes.status === "fulfilled") {
        engrams = engramsRes.value.engrams ?? [];
      }

      // Parse graph data
      let entityCount = 0;
      let relationshipCount = 0;
      if (graphRes.status === "fulfilled") {
        entityCount = graphRes.value.nodes?.length ?? 0;
        relationshipCount = graphRes.value.links?.length ?? 0;
      }

      // Parse todos
      if (todosRes.status === "fulfilled") {
        setTodos(todosRes.value);
      }

      // Compute category counts
      const categoryCounts: Record<string, number> = {};
      for (const engram of engrams) {
        const cat = resolveCategory(engram);
        categoryCounts[cat] = (categoryCounts[cat] ?? 0) + 1;
      }

      // Extract coherence score
      let coherenceScore: number | null = null;
      if (vaultStats?.coherence) {
        const firstEntry = Object.values(vaultStats.coherence)[0];
        if (firstEntry) {
          coherenceScore = firstEntry.score;
        }
      }

      setStats({
        engram_count: vaultStats?.engram_count ?? 0,
        vault_count: vaultStats?.vault_count ?? 0,
        coherence_score: coherenceScore,
        storage_bytes: vaultStats?.storage_bytes ?? 0,
        learning_total: engrams.length,
        patterns: categoryCounts["pattern"] ?? 0,
        decisions: categoryCounts["decision"] ?? 0,
        pitfalls: categoryCounts["pitfall"] ?? 0,
        entity_count: entityCount,
        relationship_count: relationshipCount,
      });

      // Recent engrams: 5 most recent by created_at descending
      const recent = [...engrams]
        .sort((a, b) => {
          const aTs = a.created_at < 1e12 ? a.created_at * 1000 : a.created_at;
          const bTs = b.created_at < 1e12 ? b.created_at * 1000 : b.created_at;
          return bTs - aTs;
        })
        .slice(0, 5);
      setRecentEngrams(recent);

      // Set error only if all MuninnDB fetches failed
      const allFailed = [statsRes, engramsRes].every(
        (r) => r.status === "rejected",
      );
      if (allFailed) {
        setError("Failed to connect to MuninnDB");
      } else {
        setLastUpdated(new Date());
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch dashboard data",
      );
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [vault]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const refresh = useCallback(() => {
    void fetchAll();
  }, [fetchAll]);

  return {
    stats,
    recentEngrams,
    todos,
    configured,
    loading,
    error,
    lastUpdated,
    refresh,
  };
}
