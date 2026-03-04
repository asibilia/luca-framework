"use client";

import { useEffect, useState, useCallback } from "react";

/**
 * React hook for polling metrics from the API.
 *
 * Polls /api/metrics every 10 seconds.
 *
 * @param intervalMs - Polling interval in milliseconds (default 10000)
 * @returns Object with data, loading state, and error
 */
export function useMetrics(intervalMs = 10000) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    try {
      const res = await fetch("/api/metrics");
      if (!res.ok) throw new Error("Failed to fetch metrics");
      const json = await res.json();
      setData(json as Record<string, unknown>);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, intervalMs);
    return () => clearInterval(interval);
  }, [fetchMetrics, intervalMs]);

  return { data, loading, error };
}
