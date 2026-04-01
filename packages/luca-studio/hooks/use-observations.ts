"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAtomValue } from "jotai";
import type { MuninnEngram } from "~/lib/muninn-types";
import {
  deriveHitRateFromObservations,
  derivePrecisionFromObservations,
} from "~/lib/observation-helpers";
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

// -- Types -------------------------------------------------------------------

/** Data returned by the useObservations hook. */
export interface ObservationsData {
  /** Recent session:observation-* engrams. */
  observations: MuninnEngram[];
  /** Recent metric:* engrams. */
  metrics: MuninnEngram[];
  /** Derived recall hit rate from metric engrams (null when unavailable). */
  hit_rate: number | null;
  /** Derived recall precision from metric engrams (null when unavailable). */
  precision: number | null;
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

// -- Metric extraction -------------------------------------------------------

/**
 * Extract a numeric metric value from metric engrams by concept name.
 *
 * Scans metric engrams for a concept matching the given prefix and
 * attempts to parse a numeric value from the content field.
 */
function extractMetricValue(
  metrics: MuninnEngram[],
  conceptPrefix: string,
): number | null {
  const match = metrics.find((m) =>
    m.concept.toLowerCase().includes(conceptPrefix.toLowerCase()),
  );
  if (!match) return null;

  // Try to extract a number from the content
  const numMatch = match.content.match(/(\d+(?:\.\d+)?)/);
  if (numMatch) {
    const val = parseFloat(numMatch[1]!);
    // If the value is between 0 and 1, treat as a ratio; otherwise as percentage
    return val <= 1 ? val : val / 100;
  }
  return null;
}

// -- Hook -------------------------------------------------------------------

/**
 * React hook for MuninnDB observations and metric engrams.
 *
 * Fetches from /api/muninn/observations and /api/muninn/metrics in parallel
 * using Promise.allSettled. No polling interval — manual refresh only.
 *
 * @returns ObservationsData with observations, metrics, and derived values
 */
export function useObservations(): ObservationsData {
  const vault = useAtomValue(vaultAtom);
  const [observations, setObservations] = useState<MuninnEngram[]>([]);
  const [metrics, setMetrics] = useState<MuninnEngram[]>([]);
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
      const [obsRes, metRes] = await Promise.allSettled([
        fetchJson<{ observations: MuninnEngram[] }>(
          `/api/muninn/observations?vault=${v}&limit=50`,
        ),
        fetchJson<{ metrics: MuninnEngram[] }>(
          `/api/muninn/metrics?vault=${v}&limit=50`,
        ),
      ]);

      // Check for 503 (not configured)
      const notConfigured = [obsRes, metRes].some(
        (r) =>
          r.status === "rejected" &&
          r.reason instanceof Error &&
          r.reason.name === "NotConfiguredError",
      );
      if (notConfigured) {
        setConfigured(false);
      }

      if (obsRes.status === "fulfilled") {
        setObservations(obsRes.value.observations ?? []);
      }
      if (metRes.status === "fulfilled") {
        setMetrics(metRes.value.metrics ?? []);
      }

      // If all failed, set error
      const allFailed = [obsRes, metRes].every((r) => r.status === "rejected");
      if (allFailed) {
        const firstError = obsRes.status === "rejected" ? obsRes.reason : null;
        setError(
          firstError instanceof Error
            ? firstError.message
            : "Failed to fetch observations data",
        );
      } else {
        setLastUpdated(new Date());
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to fetch observations data",
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

  // Derive hit rate and precision from metric engrams (original logic)
  const hitRate = extractMetricValue(metrics, "recall-hit-rate");
  const precisionVal = extractMetricValue(metrics, "recall-precision");

  // If formal metrics don't exist, derive from observation data
  const derivedHitRate = hitRate ?? deriveHitRateFromObservations(observations);
  const derivedPrecision =
    precisionVal ?? derivePrecisionFromObservations(observations);

  return {
    observations,
    metrics,
    hit_rate: derivedHitRate,
    precision: derivedPrecision,
    loading,
    error,
    lastUpdated,
    refresh,
    configured,
  };
}
