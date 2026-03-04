"use client";

import type { IterationRecordSnapshot } from "~/lib/types";

/**
 * Stacked horizontal bars showing per-iteration error counts
 * broken down by classification (transient, correctable, permanent).
 *
 * Includes a legend and summary totals across all iterations.
 *
 * @param iterations - Array of iteration record snapshots
 */
export function ErrorClassificationBreakdown({
  iterations,
}: {
  iterations: IterationRecordSnapshot[];
}) {
  if (iterations.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center">
        <p className="font-mono text-sm text-muted-foreground">
          No error classification data
        </p>
      </div>
    );
  }

  const classifications = [
    {
      key: "transient" as const,
      label: "Transient",
      color: "info",
      description: "Self-resolving or environment-dependent",
    },
    {
      key: "correctable" as const,
      label: "Correctable",
      color: "warning",
      description: "Fixable by the agent in subsequent iterations",
    },
    {
      key: "permanent" as const,
      label: "Permanent",
      color: "destructive",
      description: "Requires human intervention or architectural change",
    },
  ];

  const iterationData = iterations.map((iter) => ({
    iteration: iter.iteration,
    transient: iter.transient_errors.length,
    correctable: iter.correctable_errors.length,
    permanent: iter.permanent_errors.length,
    total:
      iter.transient_errors.length +
      iter.correctable_errors.length +
      iter.permanent_errors.length,
  }));

  const maxTotal = Math.max(...iterationData.map((d) => d.total), 1);

  const totals = {
    transient: iterationData.reduce((sum, d) => sum + d.transient, 0),
    correctable: iterationData.reduce((sum, d) => sum + d.correctable, 0),
    permanent: iterationData.reduce((sum, d) => sum + d.permanent, 0),
  };

  return (
    <div className="rounded-lg border border-border p-4">
      <h3 className="font-mono text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Error Classification
      </h3>

      {/* Stacked bars */}
      <div className="mt-4 space-y-2">
        {iterationData.map((data, idx) => {
          const barWidthPercent = (data.total / maxTotal) * 100;

          return (
            <div
              key={`iter-${data.iteration}-${idx}`}
              className="flex items-center gap-3"
            >
              <span className="w-8 text-right font-mono text-xs text-muted-foreground">
                #{data.iteration}
              </span>
              <div className="flex-1">
                <div
                  className="flex h-5 overflow-hidden rounded"
                  style={{ width: `${Math.max(barWidthPercent, 5)}%` }}
                >
                  {data.transient > 0 && (
                    <div
                      className="h-full"
                      style={{
                        width: `${(data.transient / data.total) * 100}%`,
                        backgroundColor: "var(--color-info)",
                        opacity: 0.8,
                      }}
                      title={`${data.transient} transient`}
                    />
                  )}
                  {data.correctable > 0 && (
                    <div
                      className="h-full"
                      style={{
                        width: `${(data.correctable / data.total) * 100}%`,
                        backgroundColor: "var(--color-warning)",
                        opacity: 0.8,
                      }}
                      title={`${data.correctable} correctable`}
                    />
                  )}
                  {data.permanent > 0 && (
                    <div
                      className="h-full"
                      style={{
                        width: `${(data.permanent / data.total) * 100}%`,
                        backgroundColor: "var(--color-destructive)",
                        opacity: 0.8,
                      }}
                      title={`${data.permanent} permanent`}
                    />
                  )}
                </div>
              </div>
              <span className="w-8 font-mono text-xs text-muted-foreground">
                {data.total}
              </span>
            </div>
          );
        })}
      </div>

      {/* Legend and totals */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <div className="flex flex-wrap gap-4">
          {classifications.map((cls) => (
            <span
              key={cls.key}
              className="flex items-center gap-1.5 font-mono text-xs"
              title={cls.description}
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{
                  backgroundColor: `var(--color-${cls.color})`,
                  opacity: 0.8,
                }}
              />
              <span className="text-muted-foreground">{cls.label}</span>
              <span className="text-foreground">({totals[cls.key]})</span>
            </span>
          ))}
        </div>
        <span className="font-mono text-xs text-muted-foreground">
          {totals.transient + totals.correctable + totals.permanent} total
          across {iterations.length} iterations
        </span>
      </div>
    </div>
  );
}
