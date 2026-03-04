"use client";

/**
 * Token usage trends displayed as grouped vertical bars.
 *
 * Shows input, output, and cache token counts per turn as
 * grouped bars with color-coded segments.
 *
 * @param tokenUsage - Array of per-turn token usage records
 */
export function TokenUsageTrends({
  tokenUsage,
}: {
  tokenUsage: {
    turn_number: number;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
  }[];
}) {
  if (tokenUsage.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center">
        <p className="font-mono text-sm text-muted-foreground">
          No token usage data
        </p>
      </div>
    );
  }

  // Show at most 20 recent turns
  const recent = tokenUsage.slice(0, 20);
  const maxTokens = Math.max(
    ...recent.map((t) => t.input_tokens + t.output_tokens),
    1,
  );

  return (
    <div className="rounded-lg border border-border p-4">
      <h3 className="font-mono text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Token Usage Trends
      </h3>

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

      {/* X-axis labels */}
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
        <span className="font-mono text-xs text-muted-foreground">
          Max: {maxTokens.toLocaleString()} tokens
        </span>
      </div>
    </div>
  );
}
