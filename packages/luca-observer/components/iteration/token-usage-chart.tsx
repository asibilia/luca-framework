"use client";

import { EmptyState } from "~/components/shared/empty-state";
import { useTokenUsage } from "~/hooks/use-token-usage";

/**
 * Per-turn token usage chart displayed as stacked vertical bars.
 *
 * Shows input and output token consumption per turn, aligned
 * alongside the convergence chart for correlation analysis.
 */
export function TokenUsageChart() {
  const { tokenUsage, totals, loading } = useTokenUsage();

  if (loading) {
    return <EmptyState message="Loading token data..." />;
  }

  if (tokenUsage.length === 0) {
    return <EmptyState message="No token usage data" />;
  }

  // Show most recent 20 turns in chronological order
  const recent = [...tokenUsage].reverse().slice(-20);
  const maxTokens = Math.max(
    ...recent.map((t) => t.input_tokens + t.output_tokens),
    1,
  );

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-mono text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Token Usage per Turn
        </h3>
        <span className="font-mono text-xs text-muted-foreground">
          {totals.total_tokens.toLocaleString()} total
        </span>
      </div>

      <div className="mt-4 flex h-40 items-end gap-1">
        {recent.map((turn, idx) => {
          const inputPercent = (turn.input_tokens / maxTokens) * 100;
          const outputPercent = (turn.output_tokens / maxTokens) * 100;
          const totalPercent = inputPercent + outputPercent;

          return (
            <div
              key={`turn-${turn.turn_number}-${idx}`}
              className="flex flex-1 flex-col items-center justify-end"
              style={{ height: "100%" }}
            >
              <div
                className="flex w-full min-w-1 flex-col justify-end overflow-hidden rounded-t"
                style={{ height: `${Math.max(totalPercent, 4)}%` }}
              >
                <div
                  className="w-full"
                  style={{
                    height: `${totalPercent > 0 ? (outputPercent / totalPercent) * 100 : 0}%`,
                    backgroundColor: "var(--color-warning)",
                    opacity: 0.8,
                  }}
                  title={`Output: ${turn.output_tokens.toLocaleString()}`}
                />
                <div
                  className="w-full"
                  style={{
                    height: `${totalPercent > 0 ? (inputPercent / totalPercent) * 100 : 0}%`,
                    backgroundColor: "var(--color-info)",
                    opacity: 0.8,
                  }}
                  title={`Input: ${turn.input_tokens.toLocaleString()}`}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-1 flex gap-1 overflow-hidden">
        {recent.map((turn, idx) => (
          <div
            key={`label-${turn.turn_number}-${idx}`}
            className="flex-1 text-center font-mono text-xs text-muted-foreground"
          >
            {turn.turn_number}
          </div>
        ))}
      </div>

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
