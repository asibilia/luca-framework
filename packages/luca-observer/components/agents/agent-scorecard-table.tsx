"use client";

import { SectionHeader } from "~/components/layout/section-header";
import type { AgentActivitySnapshot } from "~/lib/types";

/**
 * Format milliseconds as a human-readable duration string.
 *
 * @param ms - Duration in milliseconds
 * @returns Formatted string (e.g., "2.5s", "1m 30s", "< 1s")
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return ms === 0 ? "0s" : "< 1s";
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

/**
 * Format an ISO timestamp as a relative time string.
 *
 * @param iso - ISO 8601 timestamp string
 * @returns Formatted relative time (e.g., "5 min ago", "2 hr ago")
 */
function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} hr ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

/**
 * Per-agent scorecard table showing invocation metrics.
 *
 * Columns: agent name, invocation count, total duration, avg duration,
 * last invoked. Sorted by invocation count (most active first).
 * Supports row selection for cross-filtering with the activity log.
 *
 * @param agents - Array of agent activity snapshots from the API
 * @param onSelectAgent - Callback when an agent row is clicked
 * @param selectedAgent - Currently selected agent name (highlights row)
 */
export function AgentScorecardTable({
  agents,
  onSelectAgent,
  selectedAgent,
}: {
  agents: AgentActivitySnapshot[];
  onSelectAgent?: (agentName: string) => void;
  selectedAgent?: string;
}) {
  const sorted = [...agents].sort(
    (a, b) => b.invocation_count - a.invocation_count,
  );

  return (
    <div className="flex flex-col gap-3">
      <SectionHeader title="Agent Scorecard" />

      {sorted.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="font-mono text-sm text-muted-foreground">
            No agent activity recorded yet.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left font-mono text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-2 font-semibold text-muted-foreground">
                  Agent
                </th>
                <th className="px-4 py-2 text-right font-semibold text-muted-foreground">
                  Invocations
                </th>
                <th className="px-4 py-2 text-right font-semibold text-muted-foreground">
                  Total Duration
                </th>
                <th className="px-4 py-2 text-right font-semibold text-muted-foreground">
                  Avg Duration
                </th>
                <th className="px-4 py-2 text-right font-semibold text-muted-foreground">
                  Last Invoked
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((agent) => {
                const isSelected = selectedAgent === agent.agent_name;
                const avgMs =
                  agent.invocation_count > 0
                    ? agent.total_duration_ms / agent.invocation_count
                    : 0;

                return (
                  <tr
                    key={agent.agent_name}
                    onClick={() => onSelectAgent?.(agent.agent_name)}
                    className={`cursor-pointer border-b border-border transition-colors hover:bg-muted/30 ${
                      isSelected ? "bg-accent/10" : ""
                    }`}
                  >
                    <td className="px-4 py-2 font-semibold">
                      {agent.agent_name}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {agent.invocation_count}
                    </td>
                    <td className="px-4 py-2 text-right text-muted-foreground">
                      {formatDuration(agent.total_duration_ms)}
                    </td>
                    <td className="px-4 py-2 text-right text-muted-foreground">
                      {formatDuration(Math.round(avgMs))}
                    </td>
                    <td className="px-4 py-2 text-right text-muted-foreground">
                      {agent.last_invoked_at
                        ? formatRelativeTime(agent.last_invoked_at)
                        : "--"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
