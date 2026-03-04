"use client";

import orderBy from "lodash/orderBy";

import { useToolCalls } from "~/hooks/use-tool-calls";

/**
 * Horizontal bar chart showing tool call frequency and average duration.
 *
 * Aggregates tool calls by tool name and displays invocation count
 * as bars, with average duration shown beside each bar.
 */
export function ToolCallAnalytics() {
  const { toolCalls, loading } = useToolCalls();

  if (loading) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center">
        <p className="font-mono text-sm text-muted-foreground">
          Loading tool analytics...
        </p>
      </div>
    );
  }

  if (toolCalls.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center">
        <p className="font-mono text-sm text-muted-foreground">
          No tool call data
        </p>
      </div>
    );
  }

  // Aggregate by tool name
  const aggregated = new Map<
    string,
    { count: number; totalDuration: number }
  >();
  for (const call of toolCalls) {
    const existing = aggregated.get(call.tool_name) ?? {
      count: 0,
      totalDuration: 0,
    };
    existing.count += 1;
    existing.totalDuration += call.duration_ms;
    aggregated.set(call.tool_name, existing);
  }

  const entries = orderBy(
    Array.from(aggregated.entries()).map(([name, stats]) => ({
      tool_name: name,
      count: stats.count,
      avg_duration_ms: Math.round(stats.totalDuration / stats.count),
    })),
    "count",
    "desc",
  );

  const maxCount = Math.max(...entries.map((e) => e.count), 1);

  return (
    <div className="rounded-lg border border-border p-4">
      <h3 className="font-mono text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Tool Call Analytics
      </h3>

      <div className="mt-4 space-y-2">
        {entries.map((entry) => {
          const widthPercent = (entry.count / maxCount) * 100;
          return (
            <div key={entry.tool_name}>
              <div className="mb-1 flex items-center justify-between">
                <span className="truncate font-mono text-xs text-foreground">
                  {entry.tool_name}
                </span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  {entry.count}x &middot; avg {entry.avg_duration_ms}ms
                </span>
              </div>
              <div className="h-3 w-full rounded bg-muted/30">
                <div
                  className="h-full rounded"
                  style={{
                    width: `${Math.max(widthPercent, 2)}%`,
                    backgroundColor: "var(--color-accent)",
                    opacity: 0.7,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 border-t border-border pt-2">
        <span className="font-mono text-xs text-muted-foreground">
          {toolCalls.length} total calls across {entries.length} tool
          {entries.length !== 1 ? "s" : ""}
        </span>
      </div>
    </div>
  );
}
