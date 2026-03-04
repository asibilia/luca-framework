---
id: "108-02"
title: "Event store eviction cap + SSE connection hardening"
phase: 108
wave: 1
complexity: MODERATE
depends_on: []
tasks:
  - id: "108-02-1"
    title: "Add event store eviction cap to db.ts"
    goal: "Prevent unbounded memory growth by capping stored events at MAX_EVENTS with oldest-first eviction"
    verify: "After inserting MAX_EVENTS+1 events, store.events.length === MAX_EVENTS; oldest event was evicted; event IDs remain monotonically increasing"
  - id: "108-02-2"
    title: "Add SSE connection limit to stream route"
    goal: "Prevent connection exhaustion by capping concurrent SSE clients"
    verify: "Connection beyond MAX_SSE_CLIENTS limit returns 503; existing connections continue working"
  - id: "108-02-3"
    title: "Add SSE heartbeat interval and idle timeout"
    goal: "Detect stale connections and prevent zombie clients from accumulating"
    verify: "Heartbeat comments are sent every 30s; connections idle for 5 minutes are closed and removed from broadcaster"
---

# 108-02: Event Store Eviction + SSE Hardening

## Goal

Prevent two denial-of-service vectors: (1) unbounded memory growth in the in-memory event store, and (2) SSE connection exhaustion from unlimited concurrent clients or zombie connections.

## Context

@packages/luca-observer/lib/db.ts -- In-memory event store, no size cap
@packages/luca-observer/lib/sse.ts -- SSE broadcaster, no connection limit or heartbeat
@packages/luca-observer/app/api/stream/route.ts -- SSE endpoint, sends one initial heartbeat only

**Current state:**

- `db.ts`: Events are pushed to an array with no eviction. A long-running observer session will accumulate events indefinitely until the process runs out of memory.
- `sse.ts`: The broadcaster `Set<SSEController>` has no size limit. Any number of clients can connect.
- `stream/route.ts`: Sends a single `: heartbeat\n\n` on connect but has no recurring heartbeat. Disconnected clients are only detected when `controller.enqueue()` throws -- but if no events are broadcast, the zombie client is never cleaned up.

**DoS vectors:**

- Memory exhaustion: A malicious or buggy hook that emits events in a tight loop will fill memory
- Connection exhaustion: Opening many SSE connections will consume server resources
- Zombie connections: Clients that disconnect without proper close will accumulate

## Tasks

### Task 108-02-1: Add Event Store Eviction Cap

**File to modify:** `packages/luca-observer/lib/db.ts`

Add a `MAX_EVENTS` constant and oldest-first eviction in `insertEvent`:

```typescript
/**
 * Maximum number of events to retain in the in-memory store.
 *
 * When exceeded, the oldest events are evicted (FIFO).
 * Configurable via LUCA_OBSERVER_MAX_EVENTS env var.
 * Default: 10,000 events (~2-5 MB depending on payload size).
 */
const MAX_EVENTS = Math.max(
  100,
  parseInt(process.env.LUCA_OBSERVER_MAX_EVENTS ?? "10000", 10) || 10000,
);
```

In the `insertEvent` function, after `store.events.push(stored)`, add eviction:

```typescript
// Evict oldest events when store exceeds capacity
while (store.events.length > MAX_EVENTS) {
  store.events.shift();
}
```

**Key decisions:**

- Default cap of 10,000 events is generous for a local dev tool (~2-5 MB)
- Configurable via env var for users with different needs
- Minimum floor of 100 to prevent misconfiguration
- `shift()` is O(n) but acceptable because eviction is rare (only when at capacity) and the array is in-memory
- `nextId` continues incrementing (never resets) -- eviction removes the StoredEvent but does not affect ID generation. This preserves `since_id` query semantics.
- Session event counts are NOT decremented on eviction -- they represent total events ever emitted, not retained events

**Also export MAX_EVENTS** for use in tests:

```typescript
export { MAX_EVENTS };
```

### Task 108-02-2: Add SSE Connection Limit

**File to modify:** `packages/luca-observer/lib/sse.ts`

Add a connection limit constant:

```typescript
/**
 * Maximum concurrent SSE client connections.
 *
 * Prevents connection exhaustion on the observer server.
 * Configurable via LUCA_OBSERVER_MAX_SSE_CLIENTS env var.
 * Default: 50 clients (generous for local dev tool).
 */
const MAX_SSE_CLIENTS = Math.max(
  5,
  parseInt(process.env.LUCA_OBSERVER_MAX_SSE_CLIENTS ?? "50", 10) || 50,
);
```

Add a function to check capacity:

```typescript
/**
 * Check if another SSE client can be accepted.
 *
 * @returns true if below the connection limit
 */
export function canAcceptSSEClient(): boolean {
  return getGlobalBroadcaster().size < MAX_SSE_CLIENTS;
}
```

Export `MAX_SSE_CLIENTS` for testing.

**File to modify:** `packages/luca-observer/app/api/stream/route.ts`

Add capacity check before creating the stream:

```typescript
import { addSSEClient, removeSSEClient, canAcceptSSEClient } from "~/lib/sse";

export async function GET() {
  if (!canAcceptSSEClient()) {
    return new Response(
      JSON.stringify({
        error: "too_many_connections",
        message: "SSE connection limit reached",
      }),
      {
        status: 503,
        headers: { "Content-Type": "application/json", "Retry-After": "30" },
      },
    );
  }

  // ... existing stream creation code
}
```

### Task 108-02-3: Add SSE Heartbeat Interval and Idle Timeout

**File to modify:** `packages/luca-observer/lib/sse.ts`

Add heartbeat and idle timeout tracking. Since we are using functional patterns (no classes), we track per-client metadata in a parallel Map:

```typescript
/**
 * SSE heartbeat interval in milliseconds.
 * Sends `: heartbeat\n\n` comment to keep connection alive.
 */
const HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * SSE idle timeout in milliseconds.
 * Connections with no activity for this duration are closed.
 */
const IDLE_TIMEOUT_MS = 300_000; // 5 minutes

interface SSEClientMeta {
  controller: SSEController;
  lastActivityMs: number;
  heartbeatTimer: ReturnType<typeof setInterval>;
}
```

Refactor the global broadcaster to use a `Map<SSEController, SSEClientMeta>` instead of a `Set<SSEController>`. Update `addSSEClient` to:

1. Record `lastActivityMs = Date.now()`
2. Start a heartbeat interval that sends `: heartbeat\n\n` every 30s
3. On each heartbeat, check if `Date.now() - lastActivityMs > IDLE_TIMEOUT_MS` and close if so

Update `broadcastEvent` to refresh `lastActivityMs` for each client that receives data.

Update `removeSSEClient` to clear the heartbeat interval timer.

**Key decisions:**

- 30s heartbeat keeps firewalls and proxies from closing idle connections
- 5-minute idle timeout catches zombie clients that heartbeat cannot reach
- Per-client timers ensure each connection is independently managed
- The heartbeat comment (`: heartbeat\n\n`) is a valid SSE comment and is ignored by EventSource clients
- `lastActivityMs` is updated on both heartbeat sends and event broadcasts

**File to modify:** `packages/luca-observer/app/api/stream/route.ts`

Remove the manual initial heartbeat from `start()` callback since the heartbeat interval will handle it. Or keep the initial one for immediate feedback and let the interval handle the rest.

## Exit Criteria

1. Event store never exceeds `MAX_EVENTS` entries
2. `insertEvent` correctly evicts oldest events when at capacity
3. Event IDs remain monotonically increasing after eviction
4. SSE endpoint returns 503 when `MAX_SSE_CLIENTS` is reached
5. SSE clients receive `: heartbeat\n\n` every 30 seconds
6. Idle SSE connections (no event flow) are closed after 5 minutes
7. `removeSSEClient` properly cleans up heartbeat timers
8. `getSSEClientCount()` returns accurate count
9. `bunx --bun tsc --noEmit` passes
10. `bun test` passes
