"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { MuninnEngram, MuninnEntityEngram } from "~/lib/muninn-types";

// -- Types -------------------------------------------------------------------

/** Parsed decision metadata extracted from a decision engram. */
export interface DecisionInfo {
  /** Decision identifier (concept suffix, e.g., "use-bun-runtime"). */
  decision_id: string;
  /** Display name derived from concept suffix. */
  name: string;
  /** Full engram content (the decision rationale). */
  content: string;
  /** Engram confidence score. */
  confidence: number;
  /** Engram tags. */
  tags: string[];
  /** Created timestamp (epoch seconds). */
  created_at: number;
  /** Full concept string from the engram. */
  concept: string;
  /** Memory type classification (should be "decision"). */
  memory_type: string;
}

/** Data returned by the useDecisionTrail hook. */
export interface DecisionTrailData {
  /** Parsed decision list, sorted by created_at descending. */
  decisions: DecisionInfo[];
  /** Loading state -- true during initial fetch or refresh. */
  loading: boolean;
  /** Error message if the last fetch failed. */
  error: string | null;
  /** Manual refresh trigger (no polling). */
  refresh: () => void;
  /** Timestamp of last successful fetch. */
  lastUpdated: Date | null;
  /** Fetch detail engrams for a specific decision concept. */
  fetchDecisionDetail: (concept: string) => Promise<MuninnEntityEngram[]>;
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

// -- Parsing helpers ----------------------------------------------------------

/**
 * Parse a decision engram into a DecisionInfo object.
 *
 * Decision engrams use concepts like "decision:use-bun-runtime". The concept
 * suffix becomes the decision_id and display name.
 */
function parseDecisionEngram(engram: MuninnEngram): DecisionInfo {
  // Extract decision ID from concept (e.g., "decision:use-bun-runtime" -> "use-bun-runtime")
  const colonIdx = engram.concept.indexOf(":");
  const conceptSuffix =
    colonIdx > 0 ? engram.concept.slice(colonIdx + 1).trim() : engram.concept;

  return {
    decision_id: conceptSuffix,
    name: conceptSuffix,
    content: engram.content,
    confidence: engram.confidence,
    tags: engram.tags ?? [],
    created_at: engram.created_at,
    concept: engram.concept,
    memory_type: engram.memory_type ?? "decision",
  };
}

// -- Hook --------------------------------------------------------------------

/**
 * React hook for MuninnDB decision trail data.
 *
 * Fetches decision engrams from /api/muninn/engrams filtered by decision
 * type. Parses decision metadata from engram fields and sorts by created_at
 * descending. Follows the useSessionExplorer pattern: fetchingRef,
 * Promise.allSettled, manual refresh, no polling.
 *
 * @returns DecisionTrailData with decisions, refresh(), and loading state
 */
export function useDecisionTrail(): DecisionTrailData {
  const [decisions, setDecisions] = useState<DecisionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Prevent double-fetch in React strict mode
  const fetchingRef = useRef(false);

  const fetchAll = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const [decisionRes] = await Promise.allSettled([
        fetchJson<{ engrams: MuninnEngram[] }>(
          "/api/muninn/engrams?limit=200&type=decision",
        ),
      ]);

      // Check for 503 (MuninnDB not configured) -- degrade gracefully
      const notConfigured =
        decisionRes.status === "rejected" &&
        decisionRes.reason instanceof Error &&
        decisionRes.reason.name === "NotConfiguredError";

      if (notConfigured) {
        // Not an error state -- just empty results
        setDecisions([]);
        setLastUpdated(new Date());
      } else if (decisionRes.status === "fulfilled") {
        const engrams = decisionRes.value.engrams ?? [];

        // Filter to decision-prefixed concepts
        const decisionEngrams = engrams.filter((e) =>
          e.concept.startsWith("decision:"),
        );

        // Parse and sort by created_at descending (most recent first)
        const parsed = decisionEngrams
          .map(parseDecisionEngram)
          .sort((a, b) => b.created_at - a.created_at);

        setDecisions(parsed);
        setLastUpdated(new Date());
      } else {
        // Fetch failed for non-503 reason
        const reason = decisionRes.reason;
        setError(
          reason instanceof Error
            ? reason.message
            : "Failed to fetch decision data",
        );
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch decision data",
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

  const fetchDecisionDetail = useCallback(
    async (decisionConcept: string): Promise<MuninnEntityEngram[]> => {
      try {
        const response = await fetchJson<{ engrams: MuninnEntityEngram[] }>(
          "/api/muninn/find-by-entity",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ entity_name: decisionConcept }),
          },
        );
        return response.engrams ?? [];
      } catch {
        // Silently degrade -- return empty on failure
        return [];
      }
    },
    [],
  );

  return {
    decisions,
    loading,
    error,
    refresh,
    lastUpdated,
    fetchDecisionDetail,
  };
}
