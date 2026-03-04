"use client";

import { useMemo } from "react";

import { useTable } from "spacetimedb/react";

import { tables } from "~/module_bindings";

/**
 * React hook for real-time agent activity from SpacetimeDB.
 *
 * Subscribes to the observer_events table and derives agent activity
 * summaries from events with agent_name.
 *
 * @returns Object with agents array, loading state, and error
 */
export function useAgentActivity() {
  const [rows, isLoading] = useTable(tables.observerEvents);

  const agents = useMemo(() => {
    const agentMap = new Map<
      string,
      {
        invocationCount: number;
        lastInvokedAt: bigint;
        totalDurationMs: bigint;
        events: Array<{
          event_type: string;
          timestamp: string;
          duration_ms?: number;
          status?: string;
        }>;
      }
    >();

    for (const row of rows) {
      if (!row.agentName) continue;

      const existing = agentMap.get(row.agentName);
      const event = {
        event_type: row.eventType,
        timestamp: "",
        duration_ms: Number(row.durationMs),
      };

      if (existing) {
        existing.invocationCount += 1;
        if (row.timestamp > existing.lastInvokedAt) {
          existing.lastInvokedAt = row.timestamp;
        }
        existing.totalDurationMs += row.durationMs;
        existing.events.push(event);
      } else {
        agentMap.set(row.agentName, {
          invocationCount: 1,
          lastInvokedAt: row.timestamp,
          totalDurationMs: row.durationMs,
          events: [event],
        });
      }
    }

    return Array.from(agentMap.entries()).map(([name, data]) => ({
      agent_name: name,
      invocation_count: data.invocationCount,
      last_invoked_at: undefined as string | undefined,
      total_duration_ms: Number(data.totalDurationMs),
      events: data.events,
    }));
  }, [rows]);

  return { agents, loading: isLoading, error: null as string | null };
}
