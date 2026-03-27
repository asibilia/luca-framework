/**
 * GET /api/events -- Server-Sent Events endpoint for live notifications.
 *
 * Opens a long-lived `text/event-stream` connection that multiplexes two
 * event sources:
 *
 * 1. **File-change events** from the singleton file watcher, classified into
 *    typed SSE event names:
 *    - `state:transition` -- `.planning/state.json` or `.planning/STATE.md`
 *    - `ledger:entry`     -- `.planning/session-ledger.jsonl`
 *    - `file:changed`     -- all other file changes
 *
 * 2. **Compile lifecycle events** from the compile-events pub/sub:
 *    - `compile:start`
 *    - `compile:complete`
 *    - `compile:error`
 *
 * A 15-second heartbeat keeps the connection alive through proxies and load
 * balancers. Both subscriptions are cleaned up when the client disconnects
 * (detected via `request.signal` abort).
 *
 * @example
 * ```
 * curl -N http://localhost:3456/api/events
 * ```
 */
import { subscribeCompile } from "~/lib/compile-events";
import { subscribe } from "~/lib/file-watcher";
import { isLocalhostRequest } from "~/lib/request-guards";

import type { CompileEvent } from "~/lib/compile-events";
import type { FileChangeEvent } from "~/lib/file-watcher";

/** Heartbeat interval in milliseconds (15 seconds). */
const HEARTBEAT_MS = 15_000;

// ---------------------------------------------------------------------------
// Event type classification
// ---------------------------------------------------------------------------

/**
 * Classify a file-change event path into a typed SSE event name.
 *
 * - `state.json` or `STATE.md` inside `.planning/` -> `state:transition`
 * - `session-ledger.jsonl` inside `.planning/`      -> `ledger:entry`
 * - Everything else                                  -> `file:changed`
 *
 * @param path - Relative path from the file-change event (forward-slash separated).
 * @returns The SSE event type name.
 */
function classifyFileEvent(path: string): string {
  // Normalize: remove leading ./ or / if present
  const normalized = path.replace(/^\.?\//, "");

  if (
    normalized === ".planning/state.json" ||
    normalized === ".planning/STATE.md"
  ) {
    return "state:transition";
  }

  if (normalized === ".planning/session-ledger.jsonl") {
    return "ledger:entry";
  }

  return "file:changed";
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(request: Request): Promise<Response> {
  // Localhost guard: restrict to local development server
  if (!isLocalhostRequest(request)) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // ---------------------------------------------------------------
      // 1. Subscribe to file-change events (typed multiplexing)
      // ---------------------------------------------------------------
      const unsubFile = subscribe((event: FileChangeEvent) => {
        try {
          const eventType = classifyFileEvent(event.path);
          const payload = `event: ${eventType}\ndata: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        } catch {
          // Controller may already be closed if the client disconnected
          // between event dispatch and enqueue -- safe to swallow.
        }
      });

      // ---------------------------------------------------------------
      // 2. Subscribe to compile lifecycle events
      //    (registered inside ReadableStream start() per PREMORTEM #2)
      // ---------------------------------------------------------------
      const unsubCompile = subscribeCompile((event: CompileEvent) => {
        try {
          const payload = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        } catch {
          // Same as above -- swallow if controller is closed.
        }
      });

      // ---------------------------------------------------------------
      // 3. Heartbeat to keep the connection alive
      // ---------------------------------------------------------------
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode("event: heartbeat\ndata: {}\n\n"));
        } catch {
          // Same as above -- swallow if controller is closed.
        }
      }, HEARTBEAT_MS);

      // ---------------------------------------------------------------
      // 4. Cleanup on client disconnect (both subscriptions)
      // ---------------------------------------------------------------
      const cleanup = () => {
        clearInterval(heartbeat);
        unsubFile();
        unsubCompile();
        try {
          controller.close();
        } catch {
          // Already closed -- safe to ignore.
        }
      };

      request.signal.addEventListener("abort", cleanup, { once: true });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Content-Encoding": "none",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
