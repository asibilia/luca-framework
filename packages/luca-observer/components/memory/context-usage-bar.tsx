"use client";

import { Card, CardContent } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { coherenceColor } from "~/lib/format";

import type { StatsResponse } from "~/hooks/use-memory";

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
      <Card>
        <CardContent role="status" aria-label="MuninnDB statistics unavailable">
          <div className="flex items-center justify-between">
            <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              MuninnDB Stats
            </p>
            <Badge variant="secondary" className="font-mono text-xs">
              Unavailable
            </Badge>
          </div>
          <p className="mt-2 font-mono text-xs text-muted-foreground">
            MuninnDB statistics are not available. Check connection settings.
          </p>
        </CardContent>
      </Card>
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
    <Card>
      <CardContent role="status" aria-label="MuninnDB statistics">
        <div className="flex items-center justify-between">
          <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            MuninnDB Stats
          </p>
          <span className="font-mono text-xs text-muted-foreground">
            Vault: {vaultName}
          </span>
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
            <span className="font-mono text-xs text-muted-foreground">
              Index
            </span>
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
      </CardContent>
    </Card>
  );
}
