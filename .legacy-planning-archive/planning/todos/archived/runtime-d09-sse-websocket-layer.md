---
title: "Runtime D09: SSE and WebSocket live update layer"
area: tooling
created: 2026-03-24
source: docs/runtime-architecture/research/dev-studio.md
depends_on: [D01, D02]
phase: runtime-d
estimated_files: 2
---

## Context

The SSE and WebSocket layer provides live updates to the browser. A single multiplexed SSE connection handles all live reload notifications (file changes, state transitions, eval completions). A WebSocket connection provides bidirectional state machine inspection.

Key constraint: Only one SSE connection per browser tab to avoid HTTP/1.1's 6-connection-per-domain limit (Pitfall 3 in research).

## Task

### 1. Create `packages/luca-studio/src/sse/reload.ts`

This module manages SSE client connections and provides typed broadcast functions.

```typescript
/**
 * SSE (Server-Sent Events) client management for Luca Studio.
 *
 * Provides a single multiplexed SSE stream for all live events:
 * - reload: source file changed, browser should refresh data
 * - state-change: state machine transitioned, update state views
 * - eval-complete: eval run finished, refresh eval results
 *
 * Uses a single connection per browser tab to avoid HTTP/1.1 6-connection limit.
 *
 * @module studio-sse
 */

import type { SseEvent } from "../__schemas/studio.schemas";

// ---------------------------------------------------------------------------
// Client management
// ---------------------------------------------------------------------------

/**
 * Get the global SSE client set from the server module.
 *
 * The client set lives in server.ts and is preserved across hot reloads
 * via globalThis.__studio_sse_clients. This module provides typed
 * broadcast functions that operate on that set.
 */
function getClients(): Set<ReadableStreamDefaultController> {
  return globalThis.__studio_sse_clients ?? new Set();
}

// ---------------------------------------------------------------------------
// Broadcast functions
// ---------------------------------------------------------------------------

/**
 * Broadcast a typed SSE event to all connected browser clients.
 *
 * @param event - The SSE event to broadcast
 */
export function broadcast(event: SseEvent): void {
  const message = `data: ${JSON.stringify(event)}\n\n`;
  const clients = getClients();
  for (const controller of clients) {
    try {
      controller.enqueue(message);
    } catch {
      clients.delete(controller);
    }
  }
}

/**
 * Broadcast a reload event when source files change.
 *
 * @param domains - Array of changed domain names (e.g., ["agents", "skills"])
 */
export function broadcastReload(domains: string[]): void {
  broadcast({
    type: "reload",
    domain: domains.join(","),
    data: { domains, timestamp: new Date().toISOString() },
  });
}

/**
 * Broadcast a state-change event when the workflow state machine transitions.
 *
 * @param fromState - Previous state name
 * @param toState - New state name
 * @param event - The event that triggered the transition
 */
export function broadcastStateChange(
  fromState: string,
  toState: string,
  event: string,
): void {
  broadcast({
    type: "state-change",
    data: {
      from: fromState,
      to: toState,
      event,
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Broadcast an eval-complete event when an evaluation run finishes.
 *
 * @param summary - Brief summary of the eval run
 */
export function broadcastEvalComplete(summary: string): void {
  broadcast({
    type: "eval-complete",
    data: { summary, timestamp: new Date().toISOString() },
  });
}
```

### 2. Create `packages/luca-studio/src/public/shared.js`

This is the shared client-side JavaScript loaded by ALL views. It establishes the SSE connection and handles auto-refresh.

```javascript
/**
 * Shared client-side utilities for Luca Studio.
 *
 * Loaded by every view page. Provides:
 * - SSE connection for live reload
 * - Auto-refresh on source changes
 * - Utility functions used across views
 */

// ---------------------------------------------------------------------------
// SSE connection for live reload
// ---------------------------------------------------------------------------

(function () {
  var eventSource = null;
  var reconnectTimer = null;

  function connectSse() {
    if (eventSource) {
      eventSource.close();
    }

    eventSource = new EventSource("/__studio_reload");

    eventSource.onmessage = function (event) {
      try {
        var data = JSON.parse(event.data);

        if (data.type === "reload") {
          // Source files changed — reload the page to get fresh data
          console.log(
            "[studio] Source changed, reloading...",
            data.domains || data.domain || "",
          );
          location.reload();
        }

        if (data.type === "state-change") {
          // State machine transitioned — refresh state views without full reload
          console.log("[studio] State changed:", data.data);
          if (typeof window.onStudioStateChange === "function") {
            window.onStudioStateChange(data.data);
          } else {
            // Fallback: reload page if no handler registered
            if (location.pathname === "/state") {
              location.reload();
            }
          }
        }

        if (data.type === "eval-complete") {
          // Eval run finished — refresh eval view
          console.log("[studio] Eval complete:", data.data);
          if (typeof window.onStudioEvalComplete === "function") {
            window.onStudioEvalComplete(data.data);
          } else {
            if (location.pathname === "/evals") {
              location.reload();
            }
          }
        }
      } catch (e) {
        // Ignore parse errors (e.g., initial "connected" message)
      }
    };

    eventSource.onerror = function () {
      eventSource.close();
      eventSource = null;
      // Reconnect after 2 seconds
      reconnectTimer = setTimeout(connectSse, 2000);
    };
  }

  connectSse();

  // Cleanup on page unload
  window.addEventListener("beforeunload", function () {
    if (eventSource) eventSource.close();
    if (reconnectTimer) clearTimeout(reconnectTimer);
  });
})();
```

### 3. Wire WebSocket state updates in server.ts

Update the WebSocket handlers in `packages/luca-studio/src/server.ts` to provide real state data:

```typescript
  websocket: {
    async open(ws) {
      // Send current state snapshot on connection
      try {
        const { getStateSnapshot } = await import("./data/state");
        const snapshot = await getStateSnapshot();
        ws.send(JSON.stringify({ type: "state-snapshot", ...snapshot }));
      } catch {
        ws.send(JSON.stringify({ type: "connected", state: "unknown" }));
      }
    },
    message(ws, msg) {
      // Handle state queries from the client
      try {
        const request = JSON.parse(String(msg));
        if (request.type === "refresh") {
          // Client requested a state refresh
          import("./data/state").then(async ({ getStateSnapshot }) => {
            const snapshot = await getStateSnapshot();
            ws.send(JSON.stringify({ type: "state-snapshot", ...snapshot }));
          }).catch(() => {
            ws.send(JSON.stringify({ type: "error", message: "Failed to read state" }));
          });
        } else {
          ws.send(JSON.stringify({ type: "ack" }));
        }
      } catch {
        ws.send(JSON.stringify({ type: "error", message: "Invalid request" }));
      }
    },
    close() {
      // Cleanup handled automatically
    },
  },
```

## Verification

```bash
# TypeScript compiles
cd packages/luca-studio && bunx --bun tsc --noEmit

# Start server, open browser dev tools Network tab
# Navigate to any page -> Verify single SSE connection to /__studio_reload
# Verify "connected" event received on SSE stream

# Edit a file in src/ -> Verify "reload" event appears in SSE stream
# Verify browser auto-reloads

# Open /state view -> Verify WebSocket connection to /ws/state
# Verify state snapshot received on WebSocket open

# Open 3 Studio tabs simultaneously
# All should receive SSE events (single connection per tab)
```

## Notes

- The SSE connection uses a single `EventSource` per browser tab. Event types are multiplexed on the same stream using the `type` field in the JSON payload.
- The shared.js auto-reload behavior differs by event type: `reload` does a full page reload, `state-change` calls a view-specific handler (or falls back to reload on /state), `eval-complete` calls a view-specific handler (or falls back to reload on /evals).
- Views can register handlers via `window.onStudioStateChange` and `window.onStudioEvalComplete` for targeted updates without full page reload. This is optional -- the fallback is page reload.
- The SSE reconnect uses a 2-second delay. The WebSocket in D06's state-inspector.js uses a 3-second delay. These are intentionally different to avoid reconnection storms.
