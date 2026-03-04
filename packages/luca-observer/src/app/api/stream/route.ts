import { addSSEClient, removeSSEClient } from "~/lib/sse";

export const dynamic = "force-dynamic";

/**
 * GET /api/stream — SSE real-time event stream.
 *
 * Opens a Server-Sent Events connection. All events ingested via
 * POST /api/events are broadcast to connected clients in real-time.
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
