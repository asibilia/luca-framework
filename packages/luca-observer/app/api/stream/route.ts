import { requireApiKey } from "~/lib/auth";
import { addSSEClient, removeSSEClient, canAcceptSSEClient } from "~/lib/sse";

export const dynamic = "force-dynamic";

/**
 * GET /api/stream -- SSE real-time event stream.
 *
 * Opens a Server-Sent Events (SSE) connection. The server registers
 * the client's ReadableStream controller in the global SSE broadcaster.
 * All events subsequently ingested via POST /api/events are broadcast
 * to this client in real-time as SSE `data:` frames containing JSON.
 *
 * An initial heartbeat comment (`: heartbeat`) is sent immediately
 * upon connection to confirm the stream is live. Disconnected clients
 * are automatically cleaned up when their controller throws on enqueue.
 *
 * Returns 401 Unauthorized when LUCA_OBSERVER_API_KEY is set and the
 * request omits or provides an incorrect X-API-Key header.
 *
 * Returns 503 Service Unavailable with Retry-After: 30 when the
 * maximum number of concurrent SSE connections has been reached.
 *
 * Response headers:
 *   Content-Type: text/event-stream
 *   Cache-Control: no-cache, no-transform
 *   Connection: keep-alive
 *   X-Accel-Buffering: no
 *
 * SSE message format:
 *   data: {"id":1,"event_type":"session.start","timestamp":"...","timestamp_ms":...}\n\n
 *
 * Uses snake_case for API compatibility.
 *
 * @example
 * ```bash
 * curl -N -H "X-API-Key: secret" http://localhost:3456/api/stream
 * ```
 */
export async function GET(request: Request) {
  const authError = requireApiKey(request);
  if (authError) return authError;

  if (!canAcceptSSEClient()) {
    return new Response("SSE connection limit reached", {
      status: 503,
      headers: {
        "Retry-After": "30",
      },
    });
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      addSSEClient(controller);

      // Send initial heartbeat
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(": heartbeat\n\n"));
    },
    cancel(controller) {
      removeSSEClient(
        controller as ReadableStreamDefaultController<Uint8Array>,
      );
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
