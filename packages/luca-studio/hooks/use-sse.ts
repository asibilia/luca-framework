"use client";

import { useEffect, useRef } from "react";

import { useSetAtom } from "jotai";

import {
  compileStatusAtom,
  configAtom,
  configEtagAtom,
  stateAtom,
} from "~/stores/config-atoms";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Parsed payload for `file:changed` SSE events. */
interface FileChangedPayload {
  type: "add" | "change" | "unlink";
  path: string;
  timestamp: string;
}

/** Parsed payload for `compile:start` SSE events. */
interface CompileStartPayload {
  domain: string;
  name: string;
}

/** Parsed payload for `compile:complete` SSE events. */
interface CompileCompletePayload {
  domain: string;
  name: string;
}

/** Parsed payload for `compile:error` SSE events. */
interface CompileErrorPayload {
  domain: string;
  name: string;
  error: string;
}

/** Parsed payload for `state:transition` SSE events. */
interface StateTransitionPayload {
  event: string;
  [key: string]: unknown;
}

/** Parsed payload for `ledger:entry` SSE events. */
interface LedgerEntryPayload {
  [key: string]: unknown;
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

/**
 * Safely parse JSON from an SSE event's `data` field.
 *
 * @param raw - The raw string from `MessageEvent.data`.
 * @returns The parsed object, or `null` if parsing fails.
 */
function safeParseEventData<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Client-side hook that connects to the `/api/events` SSE endpoint and
 * dispatches typed event handlers for each SSE event type.
 *
 * Uses `EventSource` for automatic reconnection. Registers typed
 * `addEventListener` bindings for each known event type instead of a
 * generic `onmessage` handler:
 *
 * - `file:changed` -- re-fetch configAtom/configEtagAtom for config.json,
 *   re-fetch stateAtom for state files
 * - `state:transition` -- re-fetch stateAtom
 * - `compile:start` -- set compileStatusAtom to compiling
 * - `compile:complete` -- set compileStatusAtom to success
 * - `compile:error` -- set compileStatusAtom to error
 * - `ledger:entry` -- placeholder (console.log)
 * - `heartbeat` -- no-op
 *
 * Designed to be mounted once in a top-level provider component.
 * Returns `void` -- purely a side-effect hook.
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
  const setCompileStatus = useSetAtom(compileStatusAtom);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // Prevent duplicate connections in strict-mode double-mount.
    if (esRef.current) return;

    const es = new EventSource("/api/events");
    esRef.current = es;

    // -----------------------------------------------------------------
    // file:changed -- re-fetch atoms when relevant files change on disk
    // -----------------------------------------------------------------
    es.addEventListener("file:changed", (msg: MessageEvent<string>) => {
      const payload = safeParseEventData<FileChangedPayload>(msg.data);
      if (!payload) return;

      const { path } = payload;

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
    });

    // -----------------------------------------------------------------
    // state:transition -- re-fetch state atom
    // -----------------------------------------------------------------
    es.addEventListener("state:transition", (msg: MessageEvent<string>) => {
      const _payload = safeParseEventData<StateTransitionPayload>(msg.data);
      // Re-fetch state regardless of payload content
      void fetchJsonSafe("/api/state").then(({ data }) => {
        if (data) setState(data);
      });
    });

    // -----------------------------------------------------------------
    // compile:start -- set compile status to compiling
    // -----------------------------------------------------------------
    es.addEventListener("compile:start", (msg: MessageEvent<string>) => {
      const payload = safeParseEventData<CompileStartPayload>(msg.data);
      if (!payload) return;
      setCompileStatus({
        state: "compiling",
        domain: payload.domain,
        name: payload.name,
      });
    });

    // -----------------------------------------------------------------
    // compile:complete -- set compile status to success
    // -----------------------------------------------------------------
    es.addEventListener("compile:complete", (msg: MessageEvent<string>) => {
      const payload = safeParseEventData<CompileCompletePayload>(msg.data);
      if (!payload) return;
      setCompileStatus({
        state: "success",
        domain: payload.domain,
        name: payload.name,
      });
    });

    // -----------------------------------------------------------------
    // compile:error -- set compile status to error
    // -----------------------------------------------------------------
    es.addEventListener("compile:error", (msg: MessageEvent<string>) => {
      const payload = safeParseEventData<CompileErrorPayload>(msg.data);
      if (!payload) return;
      setCompileStatus({
        state: "error",
        domain: payload.domain,
        name: payload.name,
        error: payload.error ?? "Unknown compile error",
      });
    });

    // -----------------------------------------------------------------
    // ledger:entry -- placeholder
    // -----------------------------------------------------------------
    es.addEventListener("ledger:entry", (msg: MessageEvent<string>) => {
      const payload = safeParseEventData<LedgerEntryPayload>(msg.data);
      if (payload) {
        // eslint-disable-next-line no-console
        console.log("[SSE] ledger:entry", payload);
      }
    });

    // -----------------------------------------------------------------
    // heartbeat -- no-op (keeps connection alive)
    // -----------------------------------------------------------------
    es.addEventListener("heartbeat", () => {
      // Intentional no-op -- heartbeat events keep the connection alive.
    });

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [setConfig, setConfigEtag, setState, setCompileStatus]);
}
