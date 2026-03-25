"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAtomValue } from "jotai";

import { KNOWN_ENTITY_TYPES } from "~/lib/graph-types";
import type { MuninnEngram, MuninnStatsResponse } from "~/lib/muninn-types";
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

// -- Engram type resolution --------------------------------------------------

// Known entity types imported from ~/lib/graph-types (canonical source).
// The KNOWN_ENTITY_TYPES set is used for engram type categorization below.

const TYPE_DISPLAY: Record<string, { label: string; color: string }> = {
  pattern: { label: "Patterns", color: "success" },
  decision: { label: "Decisions", color: "info" },
  pitfall: { label: "Pitfalls", color: "warning" },
  preference: { label: "Preferences", color: "accent" },
  fact: { label: "Facts", color: "muted-foreground" },
  observation: { label: "Observations", color: "muted-foreground" },
  procedure: { label: "Procedures", color: "info" },
  identity: { label: "Identity", color: "accent" },
  session: { label: "Session", color: "event-session" },
  brain: { label: "Brain", color: "event-memory" },
  reference: { label: "References", color: "muted-foreground" },
  other: { label: "Other", color: "muted-foreground" },
};

/**
 * Resolve engram type using the hybrid mapping strategy.
 *
 * 1. memory_type field if it matches a known type
 * 2. Concept prefix (text before first `:`) if known
 * 3. "other" as fallback
 */
function resolveEngramType(engram: MuninnEngram): string {
  if (engram.memory_type && KNOWN_ENTITY_TYPES.has(engram.memory_type)) {
    return engram.memory_type;
  }

  const colonIndex = engram.concept.indexOf(":");
  if (colonIndex > 0) {
    const prefix = engram.concept.slice(0, colonIndex).toLowerCase().trim();
    if (KNOWN_ENTITY_TYPES.has(prefix)) {
      return prefix;
    }
  }

  return "other";
}

// -- Exported types ----------------------------------------------------------

/** Top-level vault overview stats. */
export interface VaultOverviewStats {
  engram_count: number;
  vault_count: number;
  index_size: number;
  storage_bytes: number;
}

/** Single vault coherence entry. */
export interface CoherenceEntry {
  vault: string;
  score: number;
  orphan_ratio: number;
  contradiction_density: number;
  duplication_pressure: number;
  temporal_variance: number;
  total_engrams: number;
}

/** A single row in the engram type breakdown chart. */
export interface EngramTypeItem {
  type: string;
  label: string;
  color: string;
  count: number;
  percentage: number;
}

/** Return type of the useVaultHealth hook. */
export interface VaultHealthData {
  overview: VaultOverviewStats;
  coherence: CoherenceEntry[];
  typeBreakdown: EngramTypeItem[];
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => void;
  configured: boolean;
}

// -- Aggregation helpers -----------------------------------------------------

/**
 * Build engram type breakdown from an array of engrams.
 *
 * Groups by resolved type, sorts by count descending, and computes
 * percentage values for the horizontal bar chart.
 */
function buildTypeBreakdown(engrams: MuninnEngram[]): EngramTypeItem[] {
  if (engrams.length === 0) return [];

  const counts: Record<string, number> = {};
  for (const engram of engrams) {
    const t = resolveEngramType(engram);
    counts[t] = (counts[t] ?? 0) + 1;
  }

  const total = engrams.length;
  const items: EngramTypeItem[] = [];

  for (const [type, count] of Object.entries(counts)) {
    const display = TYPE_DISPLAY[type] ?? TYPE_DISPLAY["other"]!;
    items.push({
      type,
      label: display.label,
      color: display.color,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0,
    });
  }

  // Sort by count descending
  items.sort((a, b) => b.count - a.count);

  return items;
}

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

// -- Default stats -----------------------------------------------------------

const DEFAULT_OVERVIEW: VaultOverviewStats = {
  engram_count: 0,
  vault_count: 0,
  index_size: 0,
  storage_bytes: 0,
};

// -- Hook -------------------------------------------------------------------

/**
 * React hook for Vault Health Dashboard data.
 *
 * Fetches vault statistics from /api/muninn/stats and engrams from
 * /api/muninn/engrams to compute derived metrics. Uses the same
 * resilient fetch pattern as use-learning-evolution.ts.
 *
 * @returns VaultHealthData with overview stats, coherence, type breakdown
 */
export function useVaultHealth(): VaultHealthData {
  const vault = useAtomValue(vaultAtom);
  const [stats, setStats] = useState<MuninnStatsResponse | null>(null);
  const [engrams, setEngrams] = useState<MuninnEngram[]>([]);
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
      const [statsRes, engramsRes] = await Promise.allSettled([
        fetchJson<MuninnStatsResponse>(`/api/muninn/stats?vault=${v}`),
        fetchJson<{ engrams: MuninnEngram[] }>(
          `/api/muninn/engrams?vault=${v}&limit=500`,
        ),
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

      if (statsRes.status === "fulfilled") {
        setStats(statsRes.value);
      }
      if (engramsRes.status === "fulfilled") {
        setEngrams(engramsRes.value.engrams ?? []);
      }

      // If all failed, set error
      const allFailed = [statsRes, engramsRes].every(
        (r) => r.status === "rejected",
      );
      if (allFailed) {
        const firstError =
          statsRes.status === "rejected" ? statsRes.reason : null;
        setError(
          firstError instanceof Error
            ? firstError.message
            : "Failed to fetch vault health data",
        );
      } else {
        setLastUpdated(new Date());
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to fetch vault health data",
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
  const overview: VaultOverviewStats = stats
    ? {
        engram_count: stats.engram_count,
        vault_count: stats.vault_count,
        index_size: stats.index_size,
        storage_bytes: stats.storage_bytes,
      }
    : DEFAULT_OVERVIEW;

  const coherence = extractCoherence(stats);
  const typeBreakdown = buildTypeBreakdown(engrams);

  return {
    overview,
    coherence,
    typeBreakdown,
    loading,
    error,
    lastUpdated,
    refresh,
    configured,
  };
}
