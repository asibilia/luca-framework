/**
 * GET /api/events -- Server-Sent Events endpoint for live file-change notifications.
 *
 * Opens a long-lived `text/event-stream` connection. Each file change detected
 * by the singleton file watcher is forwarded as an SSE `message` event with a
 * JSON payload matching `FileChangeEvent`.
 *
 * A 15-second heartbeat keeps the connection alive through proxies and load
 * balancers. The watcher subscription is cleaned up when the client disconnects
 * (detected via `request.signal` abort).
 *
 * @example
 * ```
 * curl -N http://localhost:3456/api/events
 * ```
 */
import { subscribe } from "~/lib/file-watcher";

import type { FileChangeEvent } from "~/lib/file-watcher";

/** Heartbeat interval in milliseconds (15 seconds). */
const HEARTBEAT_MS = 15_000;

export async function GET(request: Request): Promise<Response> {
  // Localhost guard: restrict to local development server
  const host = request.headers.get("host") ?? "";
  if (
    !host.startsWith("localhost") &&
    !host.startsWith("127.0.0.1") &&
    !host.startsWith("[::1]")
  ) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // ---------------------------------------------------------------
      // 1. Subscribe to file-change events
      // ---------------------------------------------------------------
      const unsub = subscribe((event: FileChangeEvent) => {
        try {
          const payload = `data: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        } catch {
          // Controller may already be closed if the client disconnected
          // between event dispatch and enqueue -- safe to swallow.
        }
      });

      // ---------------------------------------------------------------
      // 2. Heartbeat to keep the connection alive
      // ---------------------------------------------------------------
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          // Same as above -- swallow if controller is closed.
        }
      }, HEARTBEAT_MS);

      // ---------------------------------------------------------------
      // 3. Cleanup on client disconnect
      // ---------------------------------------------------------------
      const cleanup = () => {
        clearInterval(heartbeat);
        unsub();
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
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
