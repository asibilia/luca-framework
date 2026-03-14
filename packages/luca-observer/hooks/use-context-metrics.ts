"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { z } from "zod";

const POLL_INTERVAL_MS = 10_000;

/**
 * Zod schema for context window metrics from the API response.
 *
 * Single source of truth for the ContextMetrics type shape. Validates
 * API responses at runtime via safeParse instead of unsafe casting.
 * Uses snake_case for API-facing fields per project convention.
 */
const ContextMetricsSchema = z.object({
  zone: z.enum(["peak", "good", "degrading", "stop"]),
  usage_percent: z.number().min(0).max(100),
  transcript_bytes: z.number().int().min(0),
  checked_at: z.string(),
  thresholds: z.object({
    warn_bytes: z.number(),
    alert_bytes: z.number(),
    critical_bytes: z.number(),
  }),
});

/**
 * Context window metrics parsed from .planning/.context-metrics.json.
 *
 * Matches the shape returned by GET /api/context-metrics.
 * Inferred from ContextMetricsSchema as single source of truth.
 */
export type ContextMetrics = z.infer<typeof ContextMetricsSchema>;

/**
 * Hook for polling context window metrics via the /api/context-metrics endpoint.
 *
 * Polls every 10 seconds for updated context usage data written by the
 * context-monitor hook. Uses a ref guard to prevent concurrent fetches.
 * Gracefully handles 404 (no active session) by setting metrics to null
 * without treating it as an error.
 *
 * @returns metrics (null when unavailable), loading, error, and a refresh function
 */
export function useContextMetrics() {
  const [metrics, setMetrics] = useState<ContextMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchingRef = useRef(false);

  const fetchMetrics = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const res = await fetch("/api/context-metrics");
      if (!res.ok) {
        setMetrics(null);
        setError(null); // 404 is expected when no session active
        return;
      }
      const raw: unknown = await res.json();
      const result = ContextMetricsSchema.safeParse(raw);
      if (result.success) {
        setMetrics(result.data);
        setError(null);
      }
    } catch {
      setError("Fetch failed");
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    void fetchMetrics();
    const id = setInterval(() => void fetchMetrics(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchMetrics]);

  return { metrics, loading, error, refresh: fetchMetrics };
}
