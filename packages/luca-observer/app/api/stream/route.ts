import { addSSEClient, removeSSEClient } from "~/lib/sse";

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
 * curl -N http://localhost:3456/api/stream
 * ```
 */
export async function GET() {
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
