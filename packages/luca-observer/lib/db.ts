import orderBy from "lodash/orderBy";

import type { StoredEvent, ObserverEvent, SessionRecord } from "./types";

/**
 * In-memory event store.
 *
 * ## Design
 *
 * Uses an in-memory JavaScript object on `globalThis` to survive Next.js
 * hot module replacement (HMR) during development. For Phase 1 we use this
 * in-memory store instead of SpacetimeDB; SpacetimeDB integration will be
 * added in a future phase once SDK compatibility with Next.js App Router is
 * verified.
 *
 * ## Thread-Safety Model
 *
 * Node.js (and Bun) run JavaScript on a single thread with an event loop.
 * All request handlers in Next.js run on the same thread. Therefore:
 * - Array mutations (`push`, `shift`) are NOT subject to data races
 * - Counter increments (`nextId++`, `total_events++`) are NOT subject to races
 * - No locking, mutexes, or atomic operations are needed
 *
 * **Limitation**: This store is process-local. If the observer is deployed
 * across multiple processes (e.g., PM2 cluster mode, multiple Kubernetes pods),
 * events are NOT shared between processes. For multi-process deployments, replace
 * the globalThis store with an external store (Redis, SpacetimeDB, etc.).
 *
 * ## Memory Management
 *
 * Events are capped at MAX_EVENTS (default 10,000, configurable via
 * LUCA_OBSERVER_MAX_EVENTS). Oldest events are evicted when the cap is exceeded.
 * Sessions are not evicted automatically.
 *
 * @see SpacetimeDB integration planned for a future phase
 */

/**
 * Maximum number of events retained in the in-memory store.
 *
 * Oldest events are evicted once the cap is reached to prevent
 * unbounded memory growth. Configurable via LUCA_OBSERVER_MAX_EVENTS
 * env var (minimum floor: 100).
 */
export const MAX_EVENTS: number = Math.max(
  100,
  Number(process.env.LUCA_OBSERVER_MAX_EVENTS) || 10_000,
);

interface EventStore {
  events: StoredEvent[];
  sessions: Map<string, SessionRecord>;
  nextId: number;
}

/**
 * Get or initialize the singleton event store.
 *
 * Uses globalThis to survive Next.js HMR — module-level variables are
 * re-initialized on each HMR reload, but globalThis persists for the
 * lifetime of the process.
 */
function getStore(): EventStore {
  const key = "__observer_event_store" as const;
  const g = globalThis as unknown as Record<string, EventStore | undefined>;
  if (!g[key]) {
    g[key] = {
      events: [],
      sessions: new Map(),
      nextId: 1,
    };
  }
  return g[key] as EventStore;
}

/**
 * Insert a new event into the store.
 *
 * @param event - The incoming observer event
 * @returns The stored event with auto-generated id and timestamp_ms
 */
export function insertEvent(event: ObserverEvent): StoredEvent {
  const store = getStore();
  const stored: StoredEvent = {
    ...event,
    id: store.nextId++,
    timestamp: event.timestamp ?? new Date().toISOString(),
    timestamp_ms: Date.now(),
  };
  store.events.push(stored);

  // Evict oldest events when cap is exceeded
  while (store.events.length > MAX_EVENTS) {
    store.events.shift();
  }

  // Update session event count
  if (event.session_id) {
    const session = store.sessions.get(event.session_id);
    if (session) {
      session.total_events++;
    }
  }

  // Auto-create session on session.start
  if (event.event_type === "session.start" && event.session_id) {
    upsertSession({
      id: event.session_id,
      started_at: event.timestamp ?? new Date().toISOString(),
      status: "active",
      complexity: event.complexity,
      total_events: 1,
      metadata: {},
    });
  }

  // Mark session ended on session.end
  if (event.event_type === "session.end" && event.session_id) {
    const session = store.sessions.get(event.session_id);
    if (session) {
      session.ended_at = event.timestamp ?? new Date().toISOString();
      session.status = "ended";
    }
  }

  return stored;
}

/**
 * Query events with optional filters.
 *
 * @param filters - Optional filter criteria
 * @returns Array of matching stored events
 */
export function queryEvents(filters?: {
  session_id?: string;
  event_type?: string;
  limit?: number;
  offset?: number;
  since_id?: number;
}): StoredEvent[] {
  const store = getStore();
  let result = store.events;

  if (filters?.session_id) {
    result = result.filter((e) => e.session_id === filters.session_id);
  }
  if (filters?.event_type) {
    result = result.filter((e) => e.event_type === filters.event_type);
  }
  if (filters?.since_id) {
    result = result.filter((e) => e.id > (filters.since_id ?? 0));
  }

  // Return newest first
  result = orderBy(result, "id", "desc");

  if (filters?.offset) {
    result = result.slice(filters.offset);
  }
  if (filters?.limit) {
    result = result.slice(0, filters.limit);
  }

  return result;
}

/**
 * Get the total count of stored events.
 */
export function getEventCount(): number {
  return getStore().events.length;
}

/**
 * Create or update a session record.
 */
export function upsertSession(session: SessionRecord) {
  const store = getStore();
  store.sessions.set(session.id, session);
}

/**
 * Get all sessions, newest first.
 */
export function getSessions(): SessionRecord[] {
  const store = getStore();
  return orderBy([...store.sessions.values()], "started_at", "desc");
}

/**
 * Get a specific session by ID.
 */
export function getSession(id: string): SessionRecord | undefined {
  return getStore().sessions.get(id);
}

/**
 * Get the most recent event ID (for SSE catch-up).
 */
export function getLatestEventId(): number {
  const store = getStore();
  return store.events.length > 0
    ? store.events[store.events.length - 1]!.id
    : 0;
}
