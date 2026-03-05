"use client";

import { useMemo, useCallback, useState } from "react";

import orderBy from "lodash/orderBy";
import { useTable } from "spacetimedb/react";

import { tables } from "~/module_bindings";

/**
 * React hook for real-time event stream from SpacetimeDB.
 *
 * Subscribes to the observer_events table and returns the most recent
 * events.
 *
 * @param maxEvents - Maximum number of events to keep (default 200)
 * @returns Object with events array, connection status, and clear function
 */
export function useEventStream(maxEvents = 200) {
  const [rows, isLoading] = useTable(tables.observerEvents);
  const [cleared, setCleared] = useState(false);
  const [clearTimestamp, setClearTimestamp] = useState<bigint>(0n);

  const events = useMemo(() => {
    if (cleared && rows.length === 0) return [];

    const filtered = cleared
      ? rows.filter((r) => r.timestamp > clearTimestamp)
      : rows;

    const mapped = filtered.map((row) => ({
      id: Number(row.id),
      event_type: row.eventType,
      session_id: row.sessionId ?? undefined,
      timestamp: undefined as string | undefined,
      timestamp_ms: Number(row.timestamp),
      payload: undefined as Record<string, unknown> | undefined,
      agent_name: row.agentName ?? undefined,
      tool_name: row.toolName ?? undefined,
      file_path: row.filePath ?? undefined,
      duration_ms: Number(row.durationMs) || undefined,
    }));

    const sorted = orderBy(mapped, "timestamp_ms", "desc");
    return sorted.slice(0, maxEvents);
  }, [rows, maxEvents, cleared, clearTimestamp]);

  const clear = useCallback(() => {
    const maxTs =
      rows.length > 0
        ? rows.reduce((max, r) => (r.timestamp > max ? r.timestamp : max), 0n)
        : 0n;
    setClearTimestamp(maxTs);
    setCleared(true);
  }, [rows]);

  // SpacetimeDB subscription is always "connected" once loaded
  const connected = !isLoading;

  return { events, connected, clear };
}
