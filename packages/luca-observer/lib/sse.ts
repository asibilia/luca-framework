import type { StoredEvent } from "./types";

/**
 * In-memory SSE broadcaster.
 *
 * Manages a set of connected SSE clients and broadcasts events to all of them.
 * Uses a Set of ReadableStreamDefaultController instances to push data.
 *
 * HMR-safe: uses globalThis to survive Next.js hot module replacement.
 */

type SSEController = ReadableStreamDefaultController<Uint8Array>;

function getGlobalBroadcaster() {
  const key = "__observer_sse_broadcaster" as const;
  const g = globalThis as unknown as Record<
    string,
    Set<SSEController> | undefined
  >;
  if (!g[key]) {
    g[key] = new Set<SSEController>();
  }
  return g[key] as Set<SSEController>;
}

/**
 * Register a new SSE client controller.
 *
 * @param controller - The ReadableStream controller for the client connection
 */
export function addSSEClient(controller: SSEController) {
  const clients = getGlobalBroadcaster();
  clients.add(controller);
}

/**
 * Remove a disconnected SSE client controller.
 *
 * @param controller - The ReadableStream controller to remove
 */
export function removeSSEClient(controller: SSEController) {
  const clients = getGlobalBroadcaster();
  clients.delete(controller);
}

/**
 * Broadcast an event to all connected SSE clients.
 *
 * Encodes the event as an SSE message (`data: ...\n\n`) and pushes it to
 * all active controllers. Automatically removes disconnected clients.
 *
 * @param event - The stored event to broadcast
 */
export function broadcastEvent(event: StoredEvent) {
  const clients = getGlobalBroadcaster();
  const encoder = new TextEncoder();
  const message = encoder.encode(`data: ${JSON.stringify(event)}\n\n`);

  for (const controller of clients) {
    try {
      controller.enqueue(message);
    } catch {
      // Client disconnected — remove from set
      clients.delete(controller);
    }
  }
}

/**
 * Get the count of currently connected SSE clients.
 */
export function getSSEClientCount(): number {
  return getGlobalBroadcaster().size;
}
