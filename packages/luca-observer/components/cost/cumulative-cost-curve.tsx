"use client";

import orderBy from "lodash/orderBy";

import { EmptyState } from "~/components/shared/empty-state";

/**
 * Cumulative cost curve rendered as a CSS-only area chart.
 *
 * Each data point represents a session cost entry. The filled area
 * shows cumulative cost over time.
 *
 * @param costs - Array of cost entries with total_cost_cents and timestamp
 */
export function CumulativeCostCurve({
  costs,
}: {
  costs: { total_cost_cents: number; session_id: string; timestamp: number }[];
}) {
  if (costs.length === 0) {
    return <EmptyState message="No cost data to chart" />;
  }

  const sorted = orderBy(costs, "timestamp", "asc");

  // Build cumulative series
  const cumulative: { label: string; value: number }[] = [];
  let running = 0;
  for (const entry of sorted) {
    running += entry.total_cost_cents;
    cumulative.push({
      label: entry.session_id.slice(0, 8),
      value: running,
    });
  }

  const maxValue = Math.max(...cumulative.map((c) => c.value), 1);

  return (
    <div className="rounded-lg border border-border p-4">
      <h3 className="font-mono text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Cumulative Cost
      </h3>

      <div className="mt-4 flex h-40 items-end gap-1">
        {cumulative.map((point, idx) => {
          const heightPercent = (point.value / maxValue) * 100;
          return (
            <div
              key={`${point.label}-${idx}`}
              className="flex flex-1 flex-col items-center justify-end"
              style={{ height: "100%" }}
            >
              <div
                className="w-full min-w-2 rounded-t"
                style={{
                  height: `${Math.max(heightPercent, 4)}%`,
                  backgroundColor: "var(--color-info)",
                  opacity: 0.7,
                }}
                title={`$${(point.value / 100).toFixed(2)} cumulative`}
              />
            </div>
          );
        })}
      </div>

      {/* X-axis labels */}
      <div className="mt-1 flex gap-1 overflow-hidden">
        {cumulative.map((point, idx) => (
          <div
            key={`label-${point.label}-${idx}`}
            className="flex-1 truncate text-center font-mono text-xs text-muted-foreground"
          >
            {point.label}
          </div>
        ))}
      </div>

      <div className="mt-3 border-t border-border pt-2">
        <span className="font-mono text-xs text-muted-foreground">
          Total: ${(running / 100).toFixed(2)} across {costs.length} session
          {costs.length !== 1 ? "s" : ""}
        </span>
      </div>
    </div>
  );
}
