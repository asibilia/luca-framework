"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAtomValue } from "jotai";

import { Activity } from "lucide-react";

import { vaultAtom } from "~/stores/vault";
import { coherenceColor, formatAge } from "~/lib/format";

const POLL_INTERVAL_MS = 30_000;

// -- Lightweight internal types (no hook import to avoid circular deps) ------

interface HealthData {
  healthScore: number | null;
  observationCount: number;
  checkpointAge: number | null;
}

/**
 * Compact memory health indicator for the observer header bar.
 *
 * Shows a colored dot (coherence score), observation count badge,
 * and checkpoint age. Self-contained — fetches its own data internally
 * with a 30s polling interval. Hides when no data is available.
 */
export function MemoryHealthIndicator() {
  const vault = useAtomValue(vaultAtom);
  const [data, setData] = useState<HealthData | null>(null);
  const fetchingRef = useRef(false);

  const fetchData = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    try {
      const v = encodeURIComponent(vault);
      const [statsRes, checkpointRes] = await Promise.allSettled([
        fetch(`/api/muninn/stats?vault=${v}`),
        fetch("/api/muninn/checkpoint"),
      ]);

      let healthScore: number | null = null;
      let observationCount = 0;
      let checkpointAge: number | null = null;

      // Extract coherence score from stats
      if (statsRes.status === "fulfilled" && statsRes.value.ok) {
        try {
          const stats = (await statsRes.value.json()) as {
            coherence?: Record<string, { score: number }>;
          };
          if (stats.coherence) {
            const entries = Object.values(stats.coherence);
            if (entries.length > 0) {
              healthScore = entries[0]!.score;
            }
          }
        } catch {
          /* parse error — ignore */
        }
      }

      // Extract checkpoint data
      if (checkpointRes.status === "fulfilled" && checkpointRes.value.ok) {
        try {
          const cp = (await checkpointRes.value.json()) as {
            observation_count?: number;
            checkpoint_age_seconds?: number | null;
          };
          observationCount = cp.observation_count ?? 0;
          checkpointAge = cp.checkpoint_age_seconds ?? null;
        } catch {
          /* parse error — ignore */
        }
      }

      // Only set data if we have at least one meaningful value
      if (
        healthScore !== null ||
        observationCount > 0 ||
        checkpointAge !== null
      ) {
        setData({ healthScore, observationCount, checkpointAge });
      }
    } catch {
      // Network error — silently fail
    } finally {
      fetchingRef.current = false;
    }
  }, [vault]);

  useEffect(() => {
    void fetchData();
    const id = setInterval(() => void fetchData(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchData]);

  // Hide when no data available
  if (!data) return null;

  const color =
    data.healthScore !== null
      ? coherenceColor(data.healthScore)
      : "muted-foreground";
  const scorePercent =
    data.healthScore !== null ? Math.round(data.healthScore * 100) : null;
  const ageText =
    data.checkpointAge !== null ? formatAge(data.checkpointAge) : null;

  const tooltip = [
    scorePercent !== null ? `Memory health: ${scorePercent}%` : null,
    data.observationCount > 0 ? `${data.observationCount} observations` : null,
    ageText ? `checkpoint ${ageText}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex items-center gap-1.5" title={tooltip || undefined}>
      <Activity
        className="size-3.5"
        style={{ color: `var(--color-${color})` }}
        aria-hidden="true"
      />
      {/* Colored dot */}
      <div
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: `var(--color-${color})` }}
        aria-label={`Memory health: ${scorePercent ?? "unknown"}%`}
      />
      {/* Observation count */}
      {data.observationCount > 0 && (
        <span className="font-mono text-xs text-muted-foreground">
          {data.observationCount} obs
        </span>
      )}
      {/* Checkpoint age */}
      {ageText && (
        <span className="font-mono text-xs text-muted-foreground/60">
          {ageText}
        </span>
      )}
    </div>
  );
}
