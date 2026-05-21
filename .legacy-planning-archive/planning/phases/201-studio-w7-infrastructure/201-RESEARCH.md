# Phase 201: Studio W7 Infrastructure (SSE, ETag, Undo) - Research

**Researched:** 2026-03-25
**Domain:** Next.js API routes, Jotai state management, file-watching, optimistic concurrency
**Confidence:** HIGH

## Summary

This phase adds three cross-cutting infrastructure features to `packages/luca-studio/`. Research focused on codebase analysis rather than external documentation because all three features build directly on existing patterns and already-installed libraries.

Key finding: **entity-atoms.ts already implements the full jotai-history undo/redo atom layer** (draft atoms + `withHistory` wrappers + `HISTORY_LIMIT = 50`). The history atoms are exported from the store barrel but are NOT consumed by any component or hook yet. Wave 3 (undo/redo) is primarily a wiring task -- connecting existing atoms to keyboard shortcuts and UI indicators -- not a build-from-scratch effort.

ETag infrastructure also partially exists: `lib/etag.ts` provides `computeETag()`, and entity detail routes already implement full If-Match/409 concurrency. Config section routes (`createConfigSectionHandler`) set ETag on responses but do NOT check `If-Match` on writes. The gap is config write concurrency and a missing config GET ETag-aware middleware.

SSE is entirely new -- no file-watching or event-stream code exists in the codebase. Chokidar v5.0.0 is already a dependency in package.json.

**Primary recommendation:** Implement SSE first (standalone), then ETag middleware (extends existing patterns), then undo wiring (atoms already exist).

## Standard Stack

### Core

| Library       | Version | Purpose                    | Why Standard                                                 |
| ------------- | ------- | -------------------------- | ------------------------------------------------------------ |
| chokidar      | 5.0.0   | File system watching       | Already in package.json, standard for Node.js file watching  |
| jotai         | ^2      | Client state management    | Already the app's state layer                                |
| jotai-history | 0.5.0   | Undo/redo history atoms    | Already in package.json, already imported in entity-atoms.ts |
| next          | ^15     | API routes + SSE streaming | App framework, API routes handle SSE via ReadableStream      |

### Supporting

| Library     | Version  | Purpose                         | When to Use                     |
| ----------- | -------- | ------------------------------- | ------------------------------- |
| node:crypto | built-in | SHA-256 ETag computation        | Already used by lib/etag.ts     |
| jotai/utils | ^2       | atomFamily for per-entity atoms | Already used in entity-atoms.ts |

### Alternatives Considered

| Instead of         | Could Use              | Tradeoff                                                                    |
| ------------------ | ---------------------- | --------------------------------------------------------------------------- |
| chokidar           | node:fs/promises watch | chokidar already installed, handles cross-platform edge cases, debouncing   |
| jotai-history      | Custom undo stack      | jotai-history already installed and integrated, no point hand-rolling       |
| ReadableStream SSE | WebSocket              | SSE is simpler, unidirectional (server-to-client), standard EventSource API |

**Installation:**
No new dependencies needed. All libraries are already in `package.json`.

## Architecture Patterns

### Recommended File Structure (new files only)

```
packages/luca-studio/
├── app/api/events/
│   └── route.ts               # NEW: GET /api/events SSE endpoint
├── lib/
│   ├── etag.ts                 # EXISTS: computeETag() -- no changes needed
│   ├── etag-middleware.ts      # NEW: withETag() higher-order handler wrapper
│   ├── file-watcher.ts         # NEW: singleton chokidar watcher module
│   └── config-section-handler.ts  # MODIFY: add If-Match checking
├── hooks/
│   ├── use-sse.ts              # NEW: useSSE hook with EventSource + atom invalidation
│   └── use-undo.ts             # NEW: useUndo hook wrapping history atom dispatch + keyboard
├── stores/
│   ├── entity-atoms.ts         # EXISTS: history atoms already defined -- no changes needed
│   └── config-atoms.ts         # MODIFY: add ETag tracking atoms
└── components/
    └── feedback/
        └── undo-indicator.tsx  # NEW: canUndo/canRedo toolbar badge (optional)
```

### Pattern 1: Singleton File Watcher

**What:** Module-scoped watcher instance with reference counting.
**When to use:** SSE route handler needs a persistent watcher across requests.

```typescript
// lib/file-watcher.ts
import { watch, type FSWatcher } from "chokidar";
import { resolveProjectRoot } from "~/lib/project-root";

let watcher: FSWatcher | null = null;
let refCount = 0;

type FileEvent = {
  type: "add" | "change" | "unlink" | "addDir" | "unlinkDir";
  path: string;
  timestamp: number;
};

type Listener = (event: FileEvent) => void;
const listeners = new Set<Listener>();

export async function acquireWatcher(): Promise<() => void> {
  refCount++;
  if (!watcher) {
    const root = await resolveProjectRoot();
    watcher = watch(
      [".planning/", "src/agents/", "src/skills/", "src/rules/"],
      {
        cwd: root,
        ignoreInitial: true,
        depth: 3,
        ignored: ["**/node_modules/**", "**/.git/**", "**/*.tmp.*"],
      },
    );
    for (const evt of [
      "add",
      "change",
      "unlink",
      "addDir",
      "unlinkDir",
    ] as const) {
      watcher.on(evt, (path) => {
        const event: FileEvent = { type: evt, path, timestamp: Date.now() };
        for (const listener of listeners) listener(event);
      });
    }
  }
  return () => {
    refCount--;
    if (refCount <= 0 && watcher) {
      void watcher.close();
      watcher = null;
      refCount = 0;
    }
  };
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
```

### Pattern 2: Next.js SSE Route with ReadableStream

**What:** A GET route that returns `text/event-stream` using Web Streams API.
**When to use:** SSE endpoint at `/api/events`.

```typescript
// app/api/events/route.ts
import { subscribe, acquireWatcher } from "~/lib/file-watcher";

export async function GET(request: Request) {
  const releaseWatcher = await acquireWatcher();

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const send = (data: string) => {
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      };

      // Heartbeat to detect dead connections
      const heartbeat = setInterval(() => {
        send(JSON.stringify({ type: "heartbeat" }));
      }, 15000);

      const unsubscribe = subscribe((event) => {
        send(JSON.stringify(event));
      });

      // Cleanup on client disconnect
      request.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        unsubscribe();
        releaseWatcher();
        controller.close();
      });
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
```

### Pattern 3: ETag Middleware (Higher-Order Handler)

**What:** Wrap existing route handlers with automatic If-Match checking.
**When to use:** Config PUT routes that currently lack concurrency checks.

The config-section-handler already computes ETags for responses (line 182-183) but does NOT check If-Match on incoming requests. Rather than a separate middleware file, the simplest approach is to add If-Match checking directly inside `createConfigSectionHandler()` since it already reads the config file.

### Pattern 4: useSSE Hook with Jotai Invalidation

**What:** Client-side hook that opens EventSource and triggers atom refetches.
**When to use:** Mounted once in the root layout or providers.

```typescript
// hooks/use-sse.ts
import { useEffect, useRef } from "react";
import { useSetAtom } from "jotai";
import { configAtom, stateAtom } from "~/stores/config-atoms";

export function useSSE() {
  const setConfig = useSetAtom(configAtom);
  const setState = useSetAtom(stateAtom);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource("/api/events");
    esRef.current = es;

    es.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "heartbeat") return;

      // Invalidate relevant atoms based on file path
      if (data.path.includes(".planning/config.json")) {
        void fetch("/api/config")
          .then((r) => r.json())
          .then(setConfig);
      }
      if (data.path.includes(".planning/state.json")) {
        void fetch("/api/state")
          .then((r) => r.json())
          .then(setState);
      }
      // Entity changes: invalidate via page-level refresh callbacks
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [setConfig, setState]);
}
```

### Anti-Patterns to Avoid

- **Per-request watcher creation:** Never instantiate chokidar inside the route handler body. Use module-scoped singleton.
- **History-tracked server syncs:** When SSE triggers a re-fetch, bypass history tracking to avoid polluting undo stack.
- **Double ETag computation:** Entity routes already compute ETags -- middleware must detect and skip when handler already set the ETag header.

## Don't Hand-Roll

| Problem          | Don't Build                | Use Instead                                 | Why                                                         |
| ---------------- | -------------------------- | ------------------------------------------- | ----------------------------------------------------------- |
| File watching    | Custom fs.watch wrapper    | chokidar v5 (already installed)             | Handles macOS FSEvents, Linux inotify, debouncing, symlinks |
| Undo/redo state  | Custom history stack       | jotai-history `withHistory` (already wired) | Atoms already exist in entity-atoms.ts, just need UI wiring |
| ETag computation | Custom hash function       | `computeETag()` in lib/etag.ts              | Already used by all entity and config routes                |
| SSE reconnection | Custom WebSocket reconnect | Native EventSource auto-reconnect           | Browser handles reconnection with exponential backoff       |

**Key insight:** All three features extend existing infrastructure. Zero new dependencies needed.

## Common Pitfalls

### Pitfall 1: Chokidar Watcher Leak in Serverless Context

**What goes wrong:** Next.js API routes may be cold-started per request in production. Creating a new watcher per request leaks file descriptors.
**Why it happens:** No persistent module scope in truly serverless environments.
**How to avoid:** Module-scoped `let watcher` singleton with `acquireWatcher()`/release pattern. Hook into `request.signal` AbortSignal for cleanup on client disconnect. Note: In `next dev` mode, module scope persists across requests (same process), which is the primary use case for Luca Studio.
**Warning signs:** `EMFILE: too many open files` errors in console.

### Pitfall 2: ETag Mismatch Between Config and Entity Routes

**What goes wrong:** Config section handler computes ETag from JSON-serialized section data (`computeETag(sectionJson)` on line 183). Entity routes compute ETag from raw file contents (`computeETag(source)` on line 345). These are different inputs for the same function.
**Why it happens:** Config sections are part of a larger JSON file; entities are standalone .ts files.
**How to avoid:** This is intentional and correct -- each route uses the appropriate input for its domain. The key constraint: config routes must use the FULL config.json raw content (not section-only) for If-Match checking to avoid stale-read attacks. Currently `createConfigSectionHandler` computes ETag from section JSON alone (line 183) -- this needs to be changed to use the full config file content.
**Warning signs:** If-Match headers that never match because GET returns section-based ETag but the middleware checks file-based ETag.

### Pitfall 3: Undo Stack Pollution from SSE Re-fetches

**What goes wrong:** SSE `file:changed` triggers re-fetch, which calls `setDraft()`, which pushes a history entry. Next Cmd+Z undoes the server sync instead of the user's edit.
**Why it happens:** `agentDraftAtom(name)` is wrapped by `agentHistoryAtom(name)` -- all writes to the draft atom are tracked.
**How to avoid:** Create a separate "server sync" write path that resets history after updating. When SSE triggers a re-fetch: compare fetched data to current draft; if different, update draft then dispatch `RESET` on the history atom to clear stale entries.
**Warning signs:** Cmd+Z reverts to a state the user never explicitly set.

### Pitfall 4: Config PUT Race with Full-File ETag

**What goes wrong:** Two concurrent section PUTs both pass If-Match (they read the same ETag), but second write clobbers first because config.json is a single file with multiple sections.
**Why it happens:** If-Match only validates the initial read -- the read-modify-write in `createConfigSectionHandler` is not atomic across sections.
**How to avoid:** After reading config.json and before writing, re-compute ETag and compare to If-Match header. If they differ, return 409. The atomic write already prevents partial writes.
**Warning signs:** Section A's changes disappear after Section B is saved.

### Pitfall 5: CSP Blocking SSE Connections

**What goes wrong:** EventSource connection fails silently.
**Why it happens:** CSP `connect-src` restricts connection targets.
**How to avoid:** Already handled -- `next.config.ts` sets `connect-src 'self'` which allows SSE to the same origin. No change needed.
**Warning signs:** EventSource `onerror` fires immediately on connection attempt.

## Code Examples

### Existing: computeETag (lib/etag.ts)

```typescript
// Source: packages/luca-studio/lib/etag.ts (line 24-26)
export function computeETag(content: string): string {
  return createHash("sha256").update(content).digest("hex").substring(0, 16);
}
```

Already used by: config GET route, config section PUT response, entity detail GET/PUT.

### Existing: Entity ETag + If-Match Flow (lib/entity-route-helpers.ts)

```typescript
// Source: packages/luca-studio/lib/entity-route-helpers.ts (lines 391-411)
// PUT handler already implements full If-Match concurrency:
const ifMatch = request.headers.get("If-Match");
if (!ifMatch) {
  return NextResponse.json(
    { error: "If-Match header is required for PUT operations" },
    { status: 428 },
  );
}
const currentSource = await readFile(filePath, "utf-8");
const currentEtag = computeETag(currentSource);
if (ifMatch !== currentEtag) {
  return NextResponse.json(
    {
      error: "Conflict: entity has been modified since last read",
      currentEtag,
    },
    { status: 409 },
  );
}
```

### Existing: jotai-history Atoms (stores/entity-atoms.ts)

```typescript
// Source: packages/luca-studio/stores/entity-atoms.ts (lines 82-102)
// Already fully implemented -- NOT consumed by any component yet.
export const agentHistoryAtom = atomFamily((name: string) =>
  withHistory(agentDraftAtom(name), HISTORY_LIMIT),
);
export const skillHistoryAtom = atomFamily((name: string) =>
  withHistory(skillDraftAtom(name), HISTORY_LIMIT),
);
export const ruleHistoryAtom = atomFamily((name: string) =>
  withHistory(ruleDraftAtom(name), HISTORY_LIMIT),
);
```

### Existing: Keyboard Shortcut Pattern (hooks/use-pipeline-save.ts)

```typescript
// Source: packages/luca-studio/hooks/use-pipeline-save.ts (lines 91-102)
// Cmd+S pattern -- reuse for Cmd+Z/Shift+Cmd+Z:
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      if (canSave) {
        void handleSave();
      }
    }
  };
  window.addEventListener("keydown", handler);
  return () => window.removeEventListener("keydown", handler);
}, [canSave, handleSave]);
```

### Existing: Agent Detail ETag Tracking (hooks/use-agent-detail.ts)

```typescript
// Source: packages/luca-studio/hooks/use-agent-detail.ts (lines 62-82)
// Already extracts ETag from GET response:
const res = await fetch(`/api/entities/agents/${encodeURIComponent(name)}`);
const etagHeader = res.headers.get("ETag");
setEtag(etagHeader);
```

## State of the Art

| Old Approach              | Current Approach            | When Changed | Impact                                                        |
| ------------------------- | --------------------------- | ------------ | ------------------------------------------------------------- |
| chokidar v3 (class-based) | chokidar v5 (same API, ESM) | 2024         | ESM-native, no breaking API changes                           |
| jotai-history v0.2        | jotai-history v0.5          | 2024         | `withHistory` renamed from `withUndoableHistory` in re-export |
| Express SSE middleware    | Next.js ReadableStream      | Next.js 13+  | Native Web Streams API, no middleware needed                  |

**Deprecated/outdated:**

- None. All installed versions are current.

## Route Inventory: ETag Status Matrix

### Config Routes

| Route                    | Method | ETag in Response  | If-Match Check  | Action Needed |
| ------------------------ | ------ | ----------------- | --------------- | ------------- |
| `/api/config`            | GET    | YES (line 35)     | N/A (read-only) | None          |
| `/api/config/workflow`   | PUT    | YES (via handler) | NO              | Add If-Match  |
| `/api/config/gates`      | PUT    | YES (via handler) | NO              | Add If-Match  |
| `/api/config/complexity` | PUT    | YES (via handler) | NO              | Add If-Match  |
| `/api/config/lu`         | PUT    | YES (via handler) | NO              | Add If-Match  |
| `/api/config/planner`    | PUT    | YES (via handler) | NO              | Add If-Match  |
| `/api/config/harness`    | PUT    | YES (via handler) | NO              | Add If-Match  |

All 6 config PUT routes use `createConfigSectionHandler()`. Adding If-Match there covers all of them.

### Entity Routes

| Route                         | Method | ETag in Response | If-Match Check | Action Needed |
| ----------------------------- | ------ | ---------------- | -------------- | ------------- |
| `/api/entities/agents`        | GET    | NO               | N/A (list)     | None          |
| `/api/entities/agents/[name]` | GET    | YES              | N/A (read)     | None          |
| `/api/entities/agents/[name]` | PUT    | YES              | YES (428/409)  | None          |
| `/api/entities/skills`        | GET    | NO               | N/A (list)     | None          |
| `/api/entities/skills/[name]` | GET    | YES              | N/A (read)     | None          |
| `/api/entities/skills/[name]` | PUT    | YES              | YES (428/409)  | None          |
| `/api/entities/rules`         | GET    | NO               | N/A (list)     | None          |
| `/api/entities/rules/[name]`  | GET    | YES              | N/A (read)     | None          |
| `/api/entities/rules/[name]`  | PUT    | YES              | YES (428/409)  | None          |

Entity routes are fully covered. No work needed.

### Excluded Routes (per CONTEXT.md)

| Route            | Reason                                |
| ---------------- | ------------------------------------- |
| `/api/compile/*` | Sidecar handles its own state         |
| `/api/state`     | Read-only, no write conflict possible |
| `/api/ledger`    | Read-only, no write conflict possible |
| `/api/muninn/*`  | External service, not file-based      |

## File Change Matrix: What Each Feature Touches

### Wave 1: SSE

| File                      | Action | Description                                      |
| ------------------------- | ------ | ------------------------------------------------ |
| `lib/file-watcher.ts`     | CREATE | Singleton chokidar watcher with ref counting     |
| `app/api/events/route.ts` | CREATE | GET handler returning text/event-stream          |
| `hooks/use-sse.ts`        | CREATE | Client hook with EventSource + atom invalidation |
| `app/providers.tsx`       | MODIFY | Mount useSSE hook in provider tree               |

### Wave 2: ETag Middleware

| File                            | Action | Description                                          |
| ------------------------------- | ------ | ---------------------------------------------------- |
| `lib/config-section-handler.ts` | MODIFY | Add If-Match header check before write (lines 88-97) |
| `hooks/use-config-hydration.ts` | MODIFY | Track ETag from GET /api/config response             |
| `stores/config-atoms.ts`        | MODIFY | Add `configEtagAtom` for tracking current ETag       |

### Wave 3: Undo/Redo Wiring

| File                     | Action    | Description                                               |
| ------------------------ | --------- | --------------------------------------------------------- |
| `hooks/use-undo.ts`      | CREATE    | useUndo hook: Cmd+Z/Shift+Cmd+Z dispatch to history atoms |
| `app/agents/page.tsx`    | MODIFY    | Wire useUndo to agentHistoryAtom                          |
| `app/skills/page.tsx`    | MODIFY    | Wire useUndo to skillHistoryAtom                          |
| `app/rules/page.tsx`     | MODIFY    | Wire useUndo to ruleHistoryAtom                           |
| `stores/entity-atoms.ts` | NO CHANGE | History atoms already complete                            |

## Open Questions

1. **Config section ETag base content**
   - What we know: Config GET returns ETag from full raw file. Config section PUT returns ETag from section JSON only. These will mismatch.
   - What's unclear: Should we change config GET to return per-section ETags, or change section PUT to use full-file ETags?
   - Recommendation: Use full-file ETag for both. Config GET already uses raw file content. Section handler should read raw file, compute ETag from it, and check If-Match against that. This is simpler and catches any concurrent write to any section.

2. **SSE + Next.js dev mode hot reload**
   - What we know: `next dev` uses HMR which may restart API routes. Module-scoped singleton watcher would be recreated.
   - What's unclear: Does Next.js 15 preserve module scope across HMR in API routes?
   - Recommendation: Add a `globalThis.__luca_watcher` escape hatch for dev mode to persist the watcher across HMR reloads. Common Next.js pattern.

## Sources

### Primary (HIGH confidence)

- Codebase analysis of packages/luca-studio/ (all files listed in this document)
- chokidar v5.0.0 type definitions (`node_modules/chokidar/index.d.ts`)
- jotai-history v0.5.0 type definitions (`node_modules/jotai-history/dist/`)

### Secondary (MEDIUM confidence)

- Next.js App Router API route streaming (common pattern, verified by `next.config.ts` showing App Router usage)

### Tertiary (LOW confidence)

- None. All findings are from direct codebase inspection.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - All libraries already installed and partially integrated
- Architecture: HIGH - Patterns directly derived from existing codebase conventions
- Pitfalls: HIGH - Identified from actual code analysis (ETag mismatch verified in source)

**Research date:** 2026-03-25
**Valid until:** 2026-04-25 (stable -- no fast-moving dependencies)
