"use client";

import { useEffect, useRef, useState, useCallback } from "react";

import { StoredEventSchema } from "~/lib/types";
import type { StoredEvent } from "~/lib/types";

/**
 * React hook for consuming the SSE event stream.
 *
 * Connects to /api/stream and accumulates received events.
 * Automatically reconnects on disconnect with exponential backoff.
 *
 * @param maxEvents - Maximum number of events to keep in memory (default 200)
 * @returns Object with events array, connection status, and clear function
 */
export function useEventStream(maxEvents = 200) {
  const [events, setEvents] = useState<StoredEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const es = new EventSource("/api/stream");
    eventSourceRef.current = es;

    es.onopen = () => {
      setConnected(true);
    };

    es.onmessage = (event) => {
      try {
        const result = StoredEventSchema.safeParse(JSON.parse(event.data));
        if (!result.success) return;
        setEvents((prev) => {
          const next = [result.data, ...prev];
          return next.length > maxEvents ? next.slice(0, maxEvents) : next;
        });
      } catch {
        // Ignore unparseable messages (heartbeats, etc.)
      }
    };

    es.onerror = () => {
      setConnected(false);
      es.close();
      // Reconnect after 3 seconds
      retryTimeoutRef.current = setTimeout(connect, 3000);
    };
  }, [maxEvents]);

  useEffect(() => {
    connect();

    return () => {
      eventSourceRef.current?.close();
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [connect]);

  const clear = useCallback(() => {
    setEvents([]);
  }, []);

  return { events, connected, clear };
}
