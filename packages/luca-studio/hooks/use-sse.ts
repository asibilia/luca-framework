"use client";

import { useEffect, useRef } from "react";

import { useSetAtom } from "jotai";

import { configAtom, configEtagAtom, stateAtom } from "~/stores/config-atoms";

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

/** Result from a safe JSON fetch, including an optional ETag header. */
interface FetchJsonResult {
  data: Record<string, unknown> | null;
  etag: string | null;
}

/**
 * Fetch JSON from the given URL, returning `null` on any error.
 *
 * Also extracts the `ETag` response header when present.
 *
 * @param url - Absolute or relative URL to fetch.
 * @returns Parsed JSON and ETag, or nulls on failure.
 */
async function fetchJsonSafe(url: string): Promise<FetchJsonResult> {
  try {
    const res = await fetch(url);
    if (!res.ok) return { data: null, etag: null };
    const etag = res.headers.get("ETag");
    const data = (await res.json()) as Record<string, unknown>;
    return { data, etag };
  } catch {
    return { data: null, etag: null };
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

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
 * Safe to call multiple times -- a `useRef` guard ensures only one
 * `EventSource` connection is established per component lifecycle.
 *
 * The EventSource is closed on unmount (or HMR re-render) via the
 * effect cleanup function.
 *
 * @example
 * ```tsx
 * function SSESync() {
 *   useSSE();
 *   return null;
 * }
 * ```
 */
export function useSSE(): void {
  const setConfig = useSetAtom(configAtom);
  const setConfigEtag = useSetAtom(configEtagAtom);
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

      // config.json changed -> re-hydrate configAtom + configEtagAtom
      if (path.endsWith("config.json") && path.includes(".planning")) {
        void fetchJsonSafe("/api/config").then(({ data, etag }) => {
          if (data) setConfig(data);
          if (etag) setConfigEtag(etag);
        });
      }

      // state.json or STATE.md changed -> re-hydrate stateAtom
      if (
        (path.endsWith("state.json") || path.endsWith("STATE.md")) &&
        path.includes(".planning")
      ) {
        void fetchJsonSafe("/api/state").then(({ data }) => {
          if (data) setState(data);
        });
      }
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [setConfig, setConfigEtag, setState]);
}
