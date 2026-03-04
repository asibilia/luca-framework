"use client";

/**
 * Horizontal bar breakdown of costs by session.
 *
 * Shows input vs output cost proportions per session
 * as stacked horizontal bars.
 *
 * @param costs - Array of cost entries with cost breakdowns
 */
export function CostBreakdown({
  costs,
}: {
  costs: {
    session_id: string;
    input_cost_cents: number;
    output_cost_cents: number;
    total_cost_cents: number;
  }[];
}) {
  if (costs.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center">
        <p className="font-mono text-sm text-muted-foreground">
          No cost breakdown data
        </p>
      </div>
    );
  }

  const maxCost = Math.max(...costs.map((c) => c.total_cost_cents), 1);

  return (
    <div className="rounded-lg border border-border p-4">
      <h3 className="font-mono text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Cost Breakdown
      </h3>

      <div className="mt-4 space-y-3">
        {costs.map((entry, idx) => {
          const inputPercent = (entry.input_cost_cents / maxCost) * 100;
          const outputPercent = (entry.output_cost_cents / maxCost) * 100;
          return (
            <div key={`${entry.session_id}-${idx}`}>
              <div className="mb-1 flex items-center justify-between">
                <span className="truncate font-mono text-xs text-foreground">
                  {entry.session_id.slice(0, 12)}
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  ${(entry.total_cost_cents / 100).toFixed(2)}
                </span>
              </div>
              <div className="flex h-4 w-full overflow-hidden rounded bg-muted/30">
                <div
                  className="h-full rounded-l"
                  style={{
                    width: `${inputPercent}%`,
                    backgroundColor: "var(--color-info)",
                    opacity: 0.8,
                  }}
                  title={`Input: $${(entry.input_cost_cents / 100).toFixed(2)}`}
                />
                <div
                  className="h-full"
                  style={{
                    width: `${outputPercent}%`,
                    backgroundColor: "var(--color-warning)",
                    opacity: 0.8,
                  }}
                  title={`Output: $${(entry.output_cost_cents / 100).toFixed(2)}`}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-3 flex items-center gap-4 border-t border-border pt-2">
        <span className="flex items-center gap-1 font-mono text-xs">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: "var(--color-info)" }}
          />
          <span className="text-muted-foreground">Input</span>
        </span>
        <span className="flex items-center gap-1 font-mono text-xs">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: "var(--color-warning)" }}
          />
          <span className="text-muted-foreground">Output</span>
        </span>
      </div>
    </div>
  );
}
