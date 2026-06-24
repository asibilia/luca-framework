---
phase: 201
plan: 1
type: feature
autonomous: true
wave: 1
depends_on: []
---

# Phase 201 Plan 1: SSE Live File-Change Events

## Objective

Add real-time file-change notifications to Luca Studio so the UI automatically reflects external edits (CLI writes, git operations, other editors) without manual refresh.

> Appetite: Large (200K tokens, ~67K tokens remaining per wave at 60% context budget)

This is net-new infrastructure -- no existing watcher or SSE code exists in the codebase. Chokidar v5.0.0 is already installed as a dependency.

## Context

@packages/luca-studio/lib/project-root.ts (resolveProjectRoot for cwd)
@packages/luca-studio/app/providers.tsx (provider tree where useSSE mounts)
@packages/luca-studio/stores/config-atoms.ts (configAtom, stateAtom to invalidate)
@packages/luca-studio/hooks/use-config-hydration.ts (existing fetch pattern)
@.planning/phases/201-studio-w7-infrastructure/201-RESEARCH.md (architecture patterns)
@.planning/phases/201-studio-w7-infrastructure/01-PREMORTEM.md (watcher lifecycle risk)

## Tasks

### 1. Create singleton file watcher module

**Type:** auto
**TDD:** false
**Depends on:** none

Create `packages/luca-studio/lib/file-watcher.ts` implementing the singleton watcher pattern from research.

Key requirements:

- Module-scoped `let watcher` with reference counting via `acquireWatcher()` / release
- `globalThis.__luca_watcher` escape hatch for HMR persistence in `next dev`
- `subscribe(listener)` function returning an unsubscribe callback
- Watch paths: `.planning/`, `src/agents/`, `src/skills/`, `src/rules/`
- Ignore: `node_modules`, `.git`, `*.tmp.*`
- Emit typed `FileEvent` objects: `{ type, path, timestamp }`

**Files to create/edit:**

- `packages/luca-studio/lib/file-watcher.ts` (CREATE)

**Verification:**

- `bunx --bun tsc --noEmit` passes with no errors in file-watcher.ts
- Module exports `acquireWatcher`, `subscribe`, and `FileEvent` type

### 2. Create SSE API route

**Type:** auto
**TDD:** false
**Depends on:** 1

Create `packages/luca-studio/app/api/events/route.ts` implementing a GET handler that returns `text/event-stream` via Web Streams API.

Key requirements:

- Call `acquireWatcher()` on connection, release on `request.signal` abort
- Subscribe to file events and stream as SSE `data:` frames (JSON-encoded)
- 15-second heartbeat interval to detect dead connections
- Cleanup all resources (heartbeat interval, subscription, watcher ref) on disconnect
- Response headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`

**Files to create/edit:**

- `packages/luca-studio/app/api/events/route.ts` (CREATE)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Route exports a single `GET` function
- Manual test: `curl -N http://localhost:3000/api/events` shows heartbeat events

### 3. Create useSSE client hook

**Type:** auto
**TDD:** false
**Depends on:** 2

Create `packages/luca-studio/hooks/use-sse.ts` implementing an EventSource-based hook that invalidates Jotai atoms on file changes.

Key requirements:

- Open `EventSource("/api/events")` on mount, close on unmount
- On `file:changed` events where path includes `.planning/config.json`: re-fetch `/api/config` and update `configAtom`
- On `file:changed` events where path includes `.planning/state.json` or `STATE.md`: re-fetch `/api/state` and update `stateAtom`
- Ignore `heartbeat` events
- `useRef` for EventSource instance to avoid stale closure issues
- No undo history pollution -- this hook writes to server-state atoms (Layer 1), not draft atoms (Layer 2)

**Files to create/edit:**

- `packages/luca-studio/hooks/use-sse.ts` (CREATE)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Hook imports and uses `configAtom` and `stateAtom` from config-atoms
- Hook uses `useSetAtom` (not `useAtom`) for write-only access

### 4. Mount useSSE in provider tree

**Type:** auto
**TDD:** false
**Depends on:** 3

Add an `SSESync` component to `packages/luca-studio/app/providers.tsx` that calls `useSSE()`, mounted alongside the existing `ThemeSync`.

Key requirements:

- Create internal `SSESync` component (returns null, like ThemeSync)
- Mount inside `<JotaiProvider>` so Jotai context is available
- No props, no conditional logic -- always active

**Files to create/edit:**

- `packages/luca-studio/app/providers.tsx` (MODIFY)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- providers.tsx renders `<SSESync />` inside the JotaiProvider tree
- No new dependencies added

## Verification

1. Type check passes: `bunx --bun tsc --noEmit` (zero errors)
2. Dev server starts: `bun run dev` in luca-studio without crash
3. SSE endpoint accessible: `curl -N http://localhost:3000/api/events` returns event stream with heartbeat
4. File change propagation: Edit `.planning/config.json` externally, observe SSE event in curl output
5. No watcher leak: Connect and disconnect curl multiple times, no `EMFILE` errors

## Success Criteria

- GET `/api/events` returns a persistent `text/event-stream` connection
- File changes in watched directories produce SSE events within 1 second
- Client disconnect properly cleans up watcher references
- HMR in `next dev` does not create duplicate watchers (globalThis guard)
- Jotai server-state atoms (`configAtom`, `stateAtom`) auto-refresh on relevant file changes

## Output Specification

| Artifact               | Path                                           | Type     |
| ---------------------- | ---------------------------------------------- | -------- |
| File watcher singleton | `packages/luca-studio/lib/file-watcher.ts`     | New file |
| SSE API route          | `packages/luca-studio/app/api/events/route.ts` | New file |
| SSE client hook        | `packages/luca-studio/hooks/use-sse.ts`        | New file |
| Updated providers      | `packages/luca-studio/app/providers.tsx`       | Modified |
