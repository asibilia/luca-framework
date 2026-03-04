"use client";

import { z } from "zod";

import { usePollingFetch } from "./use-polling-fetch";

/**
 * Permissive schema for /api/metrics response.
 *
 * Metrics are a free-form key-value map; this schema validates the
 * shape without constraining individual metric keys.
 */
const MetricsResponseSchema = z.record(z.unknown());

/**
 * React hook for polling metrics from the API.
 *
 * Polls /api/metrics every 10 seconds.
 *
 * @param intervalMs - Polling interval in milliseconds (default 10000)
 * @returns Object with data, loading state, and error
 */
export function useMetrics(intervalMs = 10000) {
  return usePollingFetch("/api/metrics", MetricsResponseSchema, intervalMs);
}
