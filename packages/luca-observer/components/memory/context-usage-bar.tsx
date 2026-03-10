"use client";

import type { StatsResponse } from "~/hooks/use-memory";

/**
 * Resolve coherence score color based on value.
 *
 * Higher coherence is better:
 * - 0.8+: success (healthy)
 * - 0.5-0.8: info (moderate)
 * - 0.3-0.5: warning (low)
 * - <0.3: destructive (poor)
 */
function coherenceColor(score: number): string {
  if (score >= 0.8) return "success";
  if (score >= 0.5) return "info";
  if (score >= 0.3) return "warning";
  return "destructive";
}

/**
 * Stats bar showing MuninnDB vault statistics.
 *
 * Displays total engram count, coherence score as a colored badge,
 * vault count, and storage info. Shows a graceful "unavailable" state
 * when stats are null (MuninnDB not reachable).
 *
 * @param stats - MuninnDB StatsResponse or null if unavailable
 */
export function ContextUsageBar({ stats }: { stats: StatsResponse | null }) {
  if (!stats) {
    return (
      <div
        role="status"
        aria-label="MuninnDB statistics unavailable"
        className="rounded-lg border border-border bg-card p-4"
      >
        <div className="flex items-center justify-between">
          <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            MuninnDB Stats
          </p>
          <span
            className="rounded-sm px-1.5 py-0.5 font-mono text-xs font-medium"
            style={{
              color: "var(--color-muted-foreground)",
              backgroundColor:
                "color-mix(in oklab, var(--color-muted-foreground) 10%, transparent)",
            }}
          >
            Unavailable
          </span>
        </div>
        <p className="mt-2 font-mono text-xs text-muted-foreground">
          MuninnDB statistics are not available. Check connection settings.
        </p>
      </div>
    );
  }

  // Extract coherence score from the first vault (if available)
  const coherenceEntries = stats.coherence
    ? Object.entries(stats.coherence)
    : [];
  const firstEntry = coherenceEntries[0] ?? null;
  const primaryCoherence = firstEntry ? firstEntry[1] : null;
  const coherenceScore = primaryCoherence?.score ?? null;
  const vaultName = firstEntry ? firstEntry[0] : "default";

  const storageMb = (stats.storage_bytes / (1024 * 1024)).toFixed(2);

  return (
    <div
      role="status"
      aria-label="MuninnDB statistics"
      className="rounded-lg border border-border bg-card p-4"
    >
      <div className="flex items-center justify-between">
        <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
          MuninnDB Stats
        </p>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-muted-foreground">
            Vault: {vaultName}
          </span>
        </div>
      </div>

      {/* Stats row */}
      <div className="mt-3 flex flex-wrap items-center gap-4">
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
            {stats.engram_count.toLocaleString()}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <div
            aria-hidden="true"
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: "var(--color-success)" }}
          />
          <span className="font-mono text-xs text-muted-foreground">
            Vaults
          </span>
          <span className="font-mono text-xs font-medium text-foreground">
            {stats.vault_count}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <div
            aria-hidden="true"
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: "var(--color-warning)" }}
          />
          <span className="font-mono text-xs text-muted-foreground">
            Storage
          </span>
          <span className="font-mono text-xs font-medium text-foreground">
            {storageMb} MB
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <div
            aria-hidden="true"
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: "var(--color-chart-2)" }}
          />
          <span className="font-mono text-xs text-muted-foreground">Index</span>
          <span className="font-mono text-xs font-medium text-foreground">
            {stats.index_size.toLocaleString()}
          </span>
        </div>

        {coherenceScore !== null && (
          <span
            className="rounded-sm px-1.5 py-0.5 font-mono text-xs font-medium"
            style={{
              color: `var(--color-${coherenceColor(coherenceScore)})`,
              backgroundColor: `color-mix(in oklab, var(--color-${coherenceColor(coherenceScore)}) 15%, transparent)`,
            }}
          >
            Coherence: {(coherenceScore * 100).toFixed(0)}%
          </span>
        )}
      </div>
    </div>
  );
}
