"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { z } from "zod";

const POLL_INTERVAL_MS = 30_000;

// -- Zod schemas for response validation ------------------------------------

const CheckpointSchema = z.object({
  zone: z.string().nullable().optional(),
  usage_percent: z.number().nullable().optional(),
  checked_at: z.string().nullable().optional(),
  observation_count: z.number().optional(),
  checkpoint_age_seconds: z.number().nullable().optional(),
});

const ZoneHistoryEntrySchema = z.object({
  zone: z.string(),
  usage_percent: z.number(),
  checked_at: z.string(),
});

const ZoneHistorySchema = z.object({
  entries: z.array(ZoneHistoryEntrySchema.passthrough()),
  total: z.number(),
});

// -- Types -------------------------------------------------------------------

/** A single zone history entry. */
export interface ZoneHistoryEntry {
  zone: string;
  usage_percent: number;
  checked_at: string;
}

/** Data returned by the useCheckpoint hook. */
export interface CheckpointData {
  /** Current context zone (e.g., "peak", "good", "degrading", "stop"). */
  zone: string | null;
  /** Current context usage percentage (0-100). */
  usage_percent: number | null;
  /** Number of observations in the current checkpoint. */
  observation_count: number;
  /** Seconds since the last checkpoint was created. */
  checkpoint_age_seconds: number | null;
  /** History of zone transitions. */
  zone_history: ZoneHistoryEntry[];
  /** Whether data is currently being fetched. */
  loading: boolean;
  /** Error message if the last fetch failed. */
  error: string | null;
  /** Timestamp of last successful fetch. */
  lastUpdated: Date | null;
  /** Manual refresh trigger. */
  refresh: () => void;
}

// -- Hook -------------------------------------------------------------------

/**
 * React hook for context checkpoint and zone history data.
 *
 * Fetches from /api/muninn/checkpoint and /api/muninn/zone-history in
 * parallel with a 30s polling interval (matches context metrics cadence).
 * Uses Zod safeParse for response validation.
 *
 * @returns CheckpointData with zone, usage, observation count, and zone history
 */
export function useCheckpoint(): CheckpointData {
  const [zone, setZone] = useState<string | null>(null);
  const [usagePercent, setUsagePercent] = useState<number | null>(null);
  const [observationCount, setObservationCount] = useState(0);
  const [checkpointAge, setCheckpointAge] = useState<number | null>(null);
  const [zoneHistory, setZoneHistory] = useState<ZoneHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Prevent double-fetch in React strict mode
  const fetchingRef = useRef(false);

  const fetchAll = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    try {
      const [checkpointRes, historyRes] = await Promise.allSettled([
        fetch("/api/muninn/checkpoint"),
        fetch("/api/muninn/zone-history"),
      ]);

      let hasData = false;

      // Parse checkpoint response
      if (checkpointRes.status === "fulfilled" && checkpointRes.value.ok) {
        const raw: unknown = await checkpointRes.value.json();
        const result = CheckpointSchema.safeParse(raw);
        if (result.success) {
          setZone(result.data.zone ?? null);
          setUsagePercent(result.data.usage_percent ?? null);
          setObservationCount(result.data.observation_count ?? 0);
          setCheckpointAge(result.data.checkpoint_age_seconds ?? null);
          hasData = true;
        }
      }

      // Parse zone history response
      if (historyRes.status === "fulfilled" && historyRes.value.ok) {
        const raw: unknown = await historyRes.value.json();
        const result = ZoneHistorySchema.safeParse(raw);
        if (result.success) {
          setZoneHistory(result.data.entries as ZoneHistoryEntry[]);
          hasData = true;
        }
      }

      if (hasData) {
        setLastUpdated(new Date());
        setError(null);
      } else {
        // Both failed but this is not an error — just no data yet
        setError(null);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch checkpoint data",
      );
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, []);

  // Initial fetch + polling interval
  useEffect(() => {
    void fetchAll();
    const id = setInterval(() => void fetchAll(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchAll]);

  const refresh = useCallback(() => {
    void fetchAll();
  }, [fetchAll]);

  return {
    zone,
    usage_percent: usagePercent,
    observation_count: observationCount,
    checkpoint_age_seconds: checkpointAge,
    zone_history: zoneHistory,
    loading,
    error,
    lastUpdated,
    refresh,
  };
}
