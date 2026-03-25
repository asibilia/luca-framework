---
title: "Runtime D02: Dev server core with Bun.serve() routing"
area: tooling
created: 2026-03-24
source: docs/runtime-architecture/research/dev-studio.md
depends_on: [D01]
phase: runtime-d
estimated_files: 2
---

## Context

Set up the core Bun.serve() dev server in `packages/luca-studio/src/server.ts`. This is the main entrypoint that handles all routing: HTML page routes, JSON API endpoints, SSE endpoint, WebSocket upgrade, and static file serving. All other D-phase tasks plug into this server via imported handler functions.

## Task

### 1. Create `packages/luca-studio/src/server.ts`

This is the main server entrypoint. It uses Bun.serve() with manual routing in the `fetch` handler (not Bun 1.3 HTML imports, since we need full control over API endpoints and SSE).

```typescript
#!/usr/bin/env bun
/**
 * Luca Studio — lightweight Bun-native dev server for framework visualization.
 *
 * Provides browser-based visual tooling: DAG visualization, agent browser,
 * state machine inspector, eval results viewer. Uses Bun.serve() with
 * vanilla HTML/CSS/JS — no React, no SPA, no framework dependencies.
 *
 * Start: bun --hot packages/luca-studio/src/server.ts
 * Default port: 4040 (override with --port=N or STUDIO_PORT env var)
 *
 * @module luca-studio-server
 */
import { resolve, join, extname } from "path";

import { StudioConfigSchema } from "./__schemas/studio.schemas";

import type { StudioConfig } from "./__schemas/studio.schemas";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Parse CLI flags and environment variables into StudioConfig.
 *
 * Priority: CLI flags > env vars > schema defaults.
 *
 * @returns Validated StudioConfig
 */
function parseConfig(): StudioConfig {
  const args = process.argv.slice(2);

  const portArg = args.find((a) => a.startsWith("--port="));
  const portValue = portArg
    ? parseInt(portArg.split("=")[1]!, 10)
    : process.env.STUDIO_PORT
      ? parseInt(process.env.STUDIO_PORT, 10)
      : undefined;

  const noOpen = args.includes("--no-open");
  const noWatch = args.includes("--no-watch");

  const raw: Record<string, unknown> = {};
  if (portValue !== undefined && !isNaN(portValue)) raw.port = portValue;
  if (noOpen) raw.open = false;
  if (noWatch) raw.watch = false;

  const result = StudioConfigSchema.safeParse(raw);
  if (!result.success) {
    console.error("Invalid studio config:", result.error.issues);
    process.exit(1);
  }
  return result.data;
}

const config = parseConfig();

// ---------------------------------------------------------------------------
// Path constants
// ---------------------------------------------------------------------------

const STUDIO_ROOT = resolve(import.meta.dir, "..");
const PUBLIC_DIR = resolve(import.meta.dir, "public");
const VIEWS_DIR = resolve(import.meta.dir, "views");

// ---------------------------------------------------------------------------
// Content-type map for static files
// ---------------------------------------------------------------------------

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

// ---------------------------------------------------------------------------
// SSE client management (populated by D09)
// ---------------------------------------------------------------------------

/** Set of active SSE stream controllers for broadcasting reload events. */
const sseClients: Set<ReadableStreamDefaultController> = new Set();

// Preserve SSE clients across hot reloads
if (globalThis.__studio_sse_clients) {
  // Notify existing clients to reload
  for (const controller of globalThis.__studio_sse_clients as Set<ReadableStreamDefaultController>) {
    try {
      controller.enqueue('data: {"type":"reload"}\n\n');
    } catch {
      // Client already disconnected
    }
  }
}
globalThis.__studio_sse_clients = sseClients;

/**
 * Broadcast an SSE event to all connected browser clients.
 *
 * @param eventJson - JSON string to send as SSE data
 */
export function broadcastSse(eventJson: string): void {
  const message = `data: ${eventJson}\n\n`;
  for (const controller of sseClients) {
    try {
      controller.enqueue(message);
    } catch {
      sseClients.delete(controller);
    }
  }
}

// ---------------------------------------------------------------------------
// HTML page serving
// ---------------------------------------------------------------------------

const PAGE_ROUTES: Record<string, string> = {
  "/": "index.html",
  "/dag": "dag/dag.html",
  "/agents": "agents/agents.html",
  "/state": "state/state.html",
  "/evals": "evals/evals.html",
};

/**
 * Serve an HTML view file with proper content-type.
 *
 * @param viewPath - Relative path within VIEWS_DIR
 * @returns Response with HTML content
 */
async function serveView(viewPath: string): Promise<Response> {
  const filePath = join(VIEWS_DIR, viewPath);
  const file = Bun.file(filePath);
  if (await file.exists()) {
    return new Response(file, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
  return new Response("View not found", { status: 404 });
}

/**
 * Serve a static file from the public directory.
 *
 * @param pathname - URL pathname (e.g., "/styles.css")
 * @returns Response with the file content, or 404
 */
async function serveStatic(pathname: string): Promise<Response> {
  const filePath = join(PUBLIC_DIR, pathname);
  const file = Bun.file(filePath);
  if (await file.exists()) {
    const ext = extname(pathname);
    const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";
    return new Response(file, {
      headers: { "Content-Type": contentType },
    });
  }
  return new Response("Not found", { status: 404 });
}

// ---------------------------------------------------------------------------
// API routing (handlers are stubs — populated by D03)
// ---------------------------------------------------------------------------

/**
 * Handle JSON API requests. Returns null if the path is not an API route,
 * allowing the caller to fall through to other handlers.
 *
 * @param pathname - URL pathname
 * @returns JSON Response or null
 */
async function handleApi(pathname: string): Promise<Response | null> {
  // Stub responses — replaced by real data layer in D03
  if (pathname === "/api/agents") {
    return Response.json({ agents: [] });
  }
  if (pathname.startsWith("/api/agents/")) {
    const name = pathname.slice("/api/agents/".length);
    return Response.json({ name, error: "not_implemented" });
  }
  if (pathname === "/api/dag") {
    return Response.json({ nodes: [], edges: [], current_state: null });
  }
  if (pathname === "/api/state") {
    return Response.json({
      current_state: "unknown",
      context: {},
      event_log: [],
    });
  }
  if (pathname === "/api/evals") {
    return Response.json({
      total_checks: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      results: [],
      last_run_at: null,
    });
  }
  return null;
}

// ---------------------------------------------------------------------------
// SSE endpoint handler
// ---------------------------------------------------------------------------

/**
 * Create an SSE Response that keeps the connection open for live reload events.
 *
 * @returns SSE Response with text/event-stream content type
 */
function createSseResponse(): Response {
  const stream = new ReadableStream({
    start(controller) {
      sseClients.add(controller);
      // Send initial connection confirmation
      controller.enqueue('data: {"type":"connected"}\n\n');
    },
    cancel(controller) {
      sseClients.delete(controller);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = Bun.serve({
  port: config.port,
  development: true,

  async fetch(req, server) {
    const url = new URL(req.url);
    const pathname = url.pathname;

    // --- SSE endpoint ---
    if (pathname === "/__studio_reload") {
      return createSseResponse();
    }

    // --- WebSocket upgrade for state machine inspection ---
    if (pathname === "/ws/state") {
      const upgraded = server.upgrade(req);
      if (upgraded) return undefined as unknown as Response;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    // --- API endpoints ---
    if (pathname.startsWith("/api/")) {
      const apiResponse = await handleApi(pathname);
      if (apiResponse) return apiResponse;
    }

    // --- HTML page routes ---
    const viewFile = PAGE_ROUTES[pathname];
    if (viewFile) {
      return serveView(viewFile);
    }

    // --- Parameterized agent route: /agents/:name ---
    if (pathname.startsWith("/agents/") && pathname !== "/agents/") {
      return serveView("agents/agents.html");
    }

    // --- Static files from public/ ---
    return serveStatic(pathname);
  },

  websocket: {
    open(ws) {
      // Stub — populated by D06/D09 with real state machine data
      ws.send(JSON.stringify({ type: "connected", state: "unknown" }));
    },
    message(ws, msg) {
      // Stub — handle state queries in D06/D09
      ws.send(JSON.stringify({ type: "ack" }));
    },
    close(ws) {
      // Cleanup handled automatically
    },
  },
});

console.log(`\nLuca Studio running at http://localhost:${server.port}\n`);
console.log("  Views:");
console.log("    /         Homepage");
console.log("    /dag      Workflow DAG visualization");
console.log("    /agents   Agent browser");
console.log("    /state    State machine inspector");
console.log("    /evals    Eval results viewer");
console.log("");
console.log("  API:");
console.log("    /api/agents    Agent definitions");
console.log("    /api/dag       Workflow graph data");
console.log("    /api/state     State machine snapshot");
console.log("    /api/evals     Eval results");
console.log("");
console.log("  Live:");
console.log("    /__studio_reload   SSE live reload");
console.log("    /ws/state          WebSocket state updates");
console.log("");

// Open browser on startup (unless --no-open)
if (config.open) {
  const openUrl = `http://localhost:${server.port}`;
  if (process.platform === "darwin") {
    Bun.spawn(["open", openUrl]);
  } else if (process.platform === "linux") {
    Bun.spawn(["xdg-open", openUrl]);
  }
}

// Declare global type for hot reload SSE client preservation
declare global {
  // eslint-disable-next-line no-var
  var __studio_sse_clients: Set<ReadableStreamDefaultController> | undefined;
}
```

### 2. Add root package.json script

Add to root `package.json` `scripts`:

```json
"studio": "bun --hot packages/luca-studio/src/server.ts"
```

## Verification

```bash
# Server starts without error (start then kill after 2s)
timeout 3 bun packages/luca-studio/src/server.ts --no-open || true

# TypeScript compiles
cd packages/luca-studio && bunx --bun tsc --noEmit

# Routes return responses (test manually):
# curl http://localhost:4040/api/agents -> {"agents":[]}
# curl http://localhost:4040/api/dag -> {"nodes":[],"edges":[],"current_state":null}
# curl http://localhost:4040/api/state -> JSON with current_state
# curl http://localhost:4040/api/evals -> JSON with total_checks
```

## Notes

- The `fetch` handler uses manual routing instead of Bun 1.3 `routes` config because we need full control over SSE and WebSocket upgrade in the same handler.
- SSE clients are stored in `globalThis.__studio_sse_clients` so they survive `bun --hot` soft reloads. On hot reload, existing clients get a `reload` event before the client set is replaced.
- API handlers are stubs that return empty data. D03 replaces them with real data extraction.
- WebSocket handlers are stubs. D06/D09 populate them with real state machine data.
- The `development: true` flag enables Bun's built-in HMR, source maps, and disables minification.
