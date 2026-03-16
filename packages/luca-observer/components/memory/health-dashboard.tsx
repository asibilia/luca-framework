"use client";

import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { EmptyState } from "~/components/shared/empty-state";
import { coherenceColor } from "~/lib/format";

import type { MemoryHealthData } from "~/hooks/use-memory-health";

/**
 * Format uptime seconds to a readable string.
 */
function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) return `${hours}h ${remainingMinutes}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

/**
 * Health Dashboard section for the memory page.
 *
 * Displays coherence subscores, entity count, contradiction count,
 * and DB health status. Consumes MemoryHealthData props.
 *
 * @param data - MemoryHealthData from the useMemoryHealth hook
 */
export function HealthDashboard({ data }: { data: MemoryHealthData }) {
  if (!data.health && data.coherence.length === 0) {
    return (
      <EmptyState
        title="Health Unavailable"
        message="MuninnDB health data is not available. Check connection settings."
      />
    );
  }

  const primaryCoherence = data.coherence[0] ?? null;
  const scorePercent =
    data.health_score !== null ? Math.round(data.health_score * 100) : null;
  const color =
    data.health_score !== null
      ? coherenceColor(data.health_score)
      : "muted-foreground";

  return (
    <Card role="region" aria-label="Memory health dashboard">
      <CardHeader className="border-b">
        <CardTitle className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
          Memory Health
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        {/* Header row: DB status + uptime */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              aria-hidden="true"
              className="h-2.5 w-2.5 rounded-full"
              style={{
                backgroundColor: data.health?.db_writable
                  ? "var(--color-success)"
                  : "var(--color-destructive)",
              }}
            />
            <span className="font-mono text-xs font-medium text-foreground">
              {data.health?.db_writable ? "Connected" : "Read-only"}
            </span>
          </div>
          {data.health && (
            <span className="font-mono text-xs text-muted-foreground">
              Uptime: {formatUptime(data.health.uptime_seconds)}
            </span>
          )}
        </div>

        {/* Coherence score bar */}
        {scorePercent !== null && (
          <div className="mt-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-muted-foreground">
                Coherence Score
              </span>
              <span
                className="rounded-sm px-1.5 py-0.5 font-mono text-xs font-medium"
                style={{
                  color: `var(--color-${color})`,
                  backgroundColor: `color-mix(in oklab, var(--color-${color}) 15%, transparent)`,
                }}
              >
                {scorePercent}%
              </span>
            </div>
            <div className="relative mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(scorePercent, 100)}%`,
                  backgroundColor: `var(--color-${color})`,
                }}
              />
            </div>
          </div>
        )}

        {/* Summary stats */}
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div
              aria-hidden="true"
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: "var(--color-info)" }}
            />
            <span className="font-mono text-xs text-muted-foreground">
              Engrams
            </span>
            <span className="font-mono text-xs font-medium text-foreground">
              {data.entity_count.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <div
              aria-hidden="true"
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: "var(--color-warning)" }}
            />
            <span className="font-mono text-xs text-muted-foreground">
              Contradictions
            </span>
            <span className="font-mono text-xs font-medium text-foreground">
              {data.contradiction_count}
            </span>
          </div>
        </div>

        {/* Coherence subscores (2x2 grid) */}
        {primaryCoherence && (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <SubScore
              label="Orphan Ratio"
              value={primaryCoherence.orphan_ratio}
              invertColor
            />
            <SubScore
              label="Contradiction"
              value={primaryCoherence.contradiction_density}
              invertColor
            />
            <SubScore
              label="Duplication"
              value={primaryCoherence.duplication_pressure}
              invertColor
            />
            <SubScore
              label="Temporal Var."
              value={primaryCoherence.temporal_variance}
              invertColor
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Single sub-score display for coherence breakdown.
 *
 * Renders a compact label + value with color-coded badge.
 * Uses inverted color logic (lower is better for sub-scores).
 */
function SubScore({
  label,
  value,
  invertColor,
}: {
  label: string;
  value: number;
  invertColor?: boolean;
}) {
  const percent = Math.round(value * 100);

  // For sub-scores, lower is better (inverted from coherence)
  let scoreColor: string;
  if (invertColor) {
    if (value <= 0.2) scoreColor = "success";
    else if (value <= 0.4) scoreColor = "info";
    else if (value <= 0.6) scoreColor = "warning";
    else scoreColor = "destructive";
  } else {
    scoreColor = coherenceColor(value);
  }

  return (
    <div className="flex items-center justify-between rounded-sm border border-border px-2 py-1.5">
      <span className="font-mono text-xs text-muted-foreground">{label}</span>
      <span
        className="rounded-sm px-1.5 py-0.5 font-mono text-xs font-medium"
        style={{
          color: `var(--color-${scoreColor})`,
          backgroundColor: `color-mix(in oklab, var(--color-${scoreColor}) 15%, transparent)`,
        }}
      >
        {percent}%
      </span>
    </div>
  );
}
