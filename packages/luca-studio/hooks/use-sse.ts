"use client";

/**
 * Client-side hook that connects to the `/api/events` SSE endpoint and
 * invalidates Jotai atoms when relevant files change on disk.
 *
 * Uses `EventSource` for automatic reconnection. On each file-change
 * message the hook inspects the path and re-fetches the appropriate
 * server-state atom:
 *
 * - `config.json` changes -> re-fetch and set `configAtom`
 * - `state.json` / `STATE.md` changes -> re-fetch and set `stateAtom`
 *
 * Designed to be mounted once in a top-level provider component (similar
 * to `ThemeSync`). Returns `null` -- purely a side-effect hook.
 *
 * @example
 * ```tsx
 * function SSESync() {
 *   useSSE();
 *   return null;
 * }
 * ```
 */
import { useEffect, useRef } from "react";

import { useSetAtom } from "jotai";

import { configAtom, stateAtom } from "~/stores/config-atoms";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shape of the SSE event data sent by `GET /api/events`. */
interface SSEFileChangeEvent {
  type: "add" | "change" | "unlink";
  path: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Fetch JSON from the given URL, returning `null` on any error.
 *
 * @param url - Absolute or relative URL to fetch.
 * @returns Parsed JSON or `null`.
 */
async function fetchJsonSafe(
  url: string,
): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Connect to the SSE file-change stream and invalidate atoms on changes.
 *
 * Safe to call multiple times -- a `useRef` guard ensures only one
 * `EventSource` connection is established per component lifecycle.
 *
 * The EventSource is closed on unmount (or HMR re-render) via the
 * effect cleanup function.
 */
export function useSSE(): void {
  const setConfig = useSetAtom(configAtom);
  const setState = useSetAtom(stateAtom);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // Prevent duplicate connections in strict-mode double-mount.
    if (esRef.current) return;

    const es = new EventSource("/api/events");
    esRef.current = es;

    es.onmessage = (msg: MessageEvent<string>) => {
      let event: SSEFileChangeEvent;
      try {
        event = JSON.parse(msg.data) as SSEFileChangeEvent;
      } catch {
        // Malformed event -- ignore.
        return;
      }

      const { path } = event;

      // config.json changed -> re-hydrate configAtom
      if (path.endsWith("config.json") && path.includes(".planning")) {
        void fetchJsonSafe("/api/config").then((data) => {
          if (data) setConfig(data);
        });
      }

      // state.json or STATE.md changed -> re-hydrate stateAtom
      if (
        (path.endsWith("state.json") || path.endsWith("STATE.md")) &&
        path.includes(".planning")
      ) {
        void fetchJsonSafe("/api/state").then((data) => {
          if (data) setState(data);
        });
      }
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [setConfig, setState]);
}
