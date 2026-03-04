import type { StoredEvent } from "./types";

/**
 * In-memory SSE broadcaster with connection limits and heartbeat.
 *
 * Manages connected SSE clients and broadcasts events to all of them.
 * Uses a Map of ReadableStreamDefaultController to SSEClientMeta for
 * per-client tracking of heartbeat timers and idle timeouts.
 *
 * HMR-safe: uses globalThis to survive Next.js hot module replacement.
 */

type SSEController = ReadableStreamDefaultController<Uint8Array>;

/**
 * Per-client metadata for heartbeat and idle tracking.
 */
type SSEClientMeta = {
  controller: SSEController;
  lastActivityMs: number;
  heartbeatTimer: ReturnType<typeof setInterval>;
};

/**
 * Maximum number of concurrent SSE client connections.
 *
 * Returns 503 when the limit is reached to prevent connection exhaustion.
 * Configurable via LUCA_OBSERVER_MAX_SSE_CLIENTS env var (minimum floor: 5).
 */
export const MAX_SSE_CLIENTS: number = Math.max(
  5,
  Number(process.env.LUCA_OBSERVER_MAX_SSE_CLIENTS) || 50,
);

/**
 * Heartbeat interval in milliseconds.
 *
 * A `: heartbeat\n\n` comment is sent to each client at this interval
 * to keep the connection alive and detect zombies.
 */
export const HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * Idle timeout in milliseconds (5 minutes).
 *
 * Clients that have not received a broadcast event within this window
 * are disconnected to free resources.
 */
export const IDLE_TIMEOUT_MS = 300_000;

function getGlobalBroadcaster() {
  const key = "__observer_sse_broadcaster" as const;
  const g = globalThis as unknown as Record<
    string,
    Map<SSEController, SSEClientMeta> | undefined
  >;
  if (!g[key]) {
    g[key] = new Map<SSEController, SSEClientMeta>();
  }
  return g[key] as Map<SSEController, SSEClientMeta>;
}

/**
 * Check whether the broadcaster can accept another SSE client.
 *
 * @returns true if current client count is below MAX_SSE_CLIENTS
 */
export function canAcceptSSEClient(): boolean {
  return getGlobalBroadcaster().size < MAX_SSE_CLIENTS;
}

/**
 * Register a new SSE client controller.
 *
 * Starts a heartbeat interval that sends a keep-alive comment and
 * checks whether the client has exceeded the idle timeout.
 *
 * @param controller - The ReadableStream controller for the client connection
 */
export function addSSEClient(controller: SSEController) {
  const clients = getGlobalBroadcaster();
  const encoder = new TextEncoder();

  const heartbeatTimer = setInterval(() => {
    const meta = clients.get(controller);
    if (!meta) {
      clearInterval(heartbeatTimer);
      return;
    }

    // Check idle timeout
    if (Date.now() - meta.lastActivityMs > IDLE_TIMEOUT_MS) {
      try {
        controller.close();
      } catch {
        // already closed
      }
      removeSSEClient(controller);
      return;
    }

    // Send heartbeat keep-alive
    try {
      controller.enqueue(encoder.encode(": heartbeat\n\n"));
    } catch {
      // Client disconnected — clean up
      removeSSEClient(controller);
    }
  }, HEARTBEAT_INTERVAL_MS);

  clients.set(controller, {
    controller,
    lastActivityMs: Date.now(),
    heartbeatTimer,
  });
}

/**
 * Remove a disconnected SSE client controller.
 *
 * Clears the heartbeat timer and removes the client from the Map.
 *
 * @param controller - The ReadableStream controller to remove
 */
export function removeSSEClient(controller: SSEController) {
  const clients = getGlobalBroadcaster();
  const meta = clients.get(controller);
  if (meta) {
    clearInterval(meta.heartbeatTimer);
  }
  clients.delete(controller);
}

/**
 * Broadcast an event to all connected SSE clients.
 *
 * Encodes the event as an SSE message (`data: ...\n\n`) and pushes it to
 * all active controllers. Automatically removes disconnected clients.
 * Refreshes lastActivityMs for each client that successfully receives.
 *
 * @param event - The stored event to broadcast
 */
export function broadcastEvent(event: StoredEvent) {
  const clients = getGlobalBroadcaster();
  const encoder = new TextEncoder();
  const message = encoder.encode(`data: ${JSON.stringify(event)}\n\n`);

  for (const [controller, meta] of clients) {
    try {
      controller.enqueue(message);
      meta.lastActivityMs = Date.now();
    } catch {
      // Client disconnected — remove from map
      removeSSEClient(controller);
    }
  }
}

/**
 * Get the count of currently connected SSE clients.
 */
export function getSSEClientCount(): number {
  return getGlobalBroadcaster().size;
}
