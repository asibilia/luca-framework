"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAtomValue } from "jotai";

import type { MuninnStatsResponse } from "~/lib/muninn-types";
import { vaultAtom } from "~/stores/vault";

import type { CoherenceEntry } from "~/hooks/use-vault-health";

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

// -- Types -------------------------------------------------------------------

/** Health endpoint response shape. */
interface HealthStatus {
  status: string;
  uptime_seconds: number;
  db_writable: boolean;
}

/** Data returned by the useMemoryHealth hook. */
export interface MemoryHealthData {
  /** MuninnDB server health status (null when unavailable). */
  health: HealthStatus | null;
  /** Per-vault coherence entries from stats endpoint. */
  coherence: CoherenceEntry[];
  /** Total engram count from stats. */
  entity_count: number;
  /** Number of contradiction pairs (from stats coherence data). */
  contradiction_count: number;
  /** Derived health score from coherence (null when unavailable). */
  health_score: number | null;
  /** Whether data is currently being fetched. */
  loading: boolean;
  /** Error message if the last fetch failed. */
  error: string | null;
  /** Timestamp of last successful fetch. */
  lastUpdated: Date | null;
  /** Manual refresh trigger (no polling). */
  refresh: () => void;
  /** Whether MuninnDB is reachable and configured. */
  configured: boolean;
}

// -- Coherence extraction ----------------------------------------------------

/**
 * Extract coherence entries from stats response.
 *
 * Flattens the Record<string, CoherenceData> into an array of
 * entries with vault name included.
 */
function extractCoherence(stats: MuninnStatsResponse | null): CoherenceEntry[] {
  if (!stats?.coherence) return [];

  const entries: CoherenceEntry[] = [];
  for (const [vault, data] of Object.entries(stats.coherence)) {
    entries.push({
      vault,
      score: data.score,
      orphan_ratio: data.orphan_ratio,
      contradiction_density: data.contradiction_density,
      duplication_pressure: data.duplication_pressure,
      temporal_variance: data.temporal_variance,
      total_engrams: data.total_engrams,
    });
  }
  return entries;
}

// -- Hook -------------------------------------------------------------------

/**
 * React hook for MuninnDB health and coherence data.
 *
 * Fetches from /api/muninn/health and /api/muninn/stats in parallel
 * using Promise.allSettled. No polling interval — manual refresh only.
 *
 * @returns MemoryHealthData with health status, coherence, and derived scores
 */
export function useMemoryHealth(): MemoryHealthData {
  const vault = useAtomValue(vaultAtom);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [stats, setStats] = useState<MuninnStatsResponse | null>(null);
  const [configured, setConfigured] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Prevent double-fetch in React strict mode
  const fetchingRef = useRef(false);

  const fetchAll = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const v = encodeURIComponent(vault);
      const [healthRes, statsRes] = await Promise.allSettled([
        fetchJson<HealthStatus>("/api/muninn/health"),
        fetchJson<MuninnStatsResponse>(`/api/muninn/stats?vault=${v}`),
      ]);

      // Check for 503 (not configured)
      const notConfigured = [healthRes, statsRes].some(
        (r) =>
          r.status === "rejected" &&
          r.reason instanceof Error &&
          r.reason.name === "NotConfiguredError",
      );
      if (notConfigured) {
        setConfigured(false);
      }

      if (healthRes.status === "fulfilled") {
        setHealth(healthRes.value);
      }
      if (statsRes.status === "fulfilled") {
        setStats(statsRes.value);
      }

      // If all failed, set error
      const allFailed = [healthRes, statsRes].every(
        (r) => r.status === "rejected",
      );
      if (allFailed) {
        const firstError =
          healthRes.status === "rejected" ? healthRes.reason : null;
        setError(
          firstError instanceof Error
            ? firstError.message
            : "Failed to fetch memory health data",
        );
      } else {
        setLastUpdated(new Date());
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to fetch memory health data",
      );
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [vault]);

  // Initial fetch on mount
  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const refresh = useCallback(() => {
    void fetchAll();
  }, [fetchAll]);

  // Compute derived data
  const coherence = extractCoherence(stats);
  const healthScore =
    coherence.length > 0 ? coherence[0]!.score : null;
  const entityCount = stats?.engram_count ?? 0;
  const contradictionCount =
    coherence.length > 0
      ? Math.round(coherence[0]!.contradiction_density * coherence[0]!.total_engrams)
      : 0;

  return {
    health,
    coherence,
    entity_count: entityCount,
    contradiction_count: contradictionCount,
    health_score: healthScore,
    loading,
    error,
    lastUpdated,
    refresh,
    configured,
  };
}
