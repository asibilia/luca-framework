"use client";

import type { IterationRecordSnapshot } from "~/lib/types";

/**
 * CSS-only bar chart plotting error count across iterations.
 *
 * Each bar's height represents the error count for that iteration.
 * Color indicates convergence status: green (improved), yellow (stalled),
 * red (regressed). Error delta is shown above each bar.
 *
 * @param iterations - Array of iteration record snapshots to chart
 */
export function ConvergenceChart({
  iterations,
}: {
  iterations: IterationRecordSnapshot[];
}) {
  if (iterations.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center">
        <p className="font-mono text-sm text-muted-foreground">
          No iteration data to chart
        </p>
      </div>
    );
  }

  const maxErrors = Math.max(...iterations.map((i) => i.error_count), 1);

  const statusColors: Record<string, string> = {
    improved: "success",
    stalled: "warning",
    regressed: "destructive",
  };

  return (
    <div className="rounded-lg border border-border p-4">
      <h3 className="font-mono text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Error Convergence
      </h3>

      <div className="mt-4 flex items-end gap-1" style={{ height: "160px" }}>
        {iterations.map((iter, idx) => {
          const heightPercent = (iter.error_count / maxErrors) * 100;
          const color =
            statusColors[iter.convergence_status] ?? "muted-foreground";
          const deltaLabel =
            iter.error_delta > 0
              ? `+${iter.error_delta}`
              : iter.error_delta === 0
                ? "0"
                : String(iter.error_delta);

          return (
            <div
              key={`${iter.tag}-${iter.iteration}-${idx}`}
              className="flex flex-1 flex-col items-center justify-end"
              style={{ height: "100%" }}
            >
              <span
                className="mb-1 font-mono text-xs font-medium"
                style={{ color: `var(--color-${color})` }}
              >
                {deltaLabel}
              </span>
              <div
                className="w-full min-w-2 rounded-t"
                style={{
                  height: `${Math.max(heightPercent, 4)}%`,
                  backgroundColor: `var(--color-${color})`,
                  opacity: 0.8,
                }}
                title={`Iteration ${iter.iteration}: ${iter.error_count} errors (${iter.convergence_status})`}
              />
            </div>
          );
        })}
      </div>

      {/* X-axis labels */}
      <div className="mt-1 flex gap-1">
        {iterations.map((iter, idx) => (
          <div
            key={`label-${iter.tag}-${iter.iteration}-${idx}`}
            className="flex-1 text-center font-mono text-xs text-muted-foreground"
          >
            {iter.iteration}
          </div>
        ))}
      </div>

      {/* Zero line indicator */}
      <div className="mt-3 flex items-center gap-2 border-t border-border pt-2">
        <span className="font-mono text-xs text-muted-foreground">
          Max: {maxErrors} errors
        </span>
        <span className="mx-1 text-muted-foreground/30">|</span>
        {Object.entries(statusColors).map(([status, color]) => (
          <span
            key={status}
            className="flex items-center gap-1 font-mono text-xs"
          >
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: `var(--color-${color})` }}
            />
            <span className="text-muted-foreground">{status}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
