---
title: "SSE event stream + useSSE hook (chokidar, multiplexed events)"
area: api
created: 2026-03-25
source: docs/brainstorm/observer-studio-rework
depends_on: [studio-w2-new-dependencies, studio-w2-jotai-atom-model]
phase: studio-w7
estimated_size: M
priority: P2
---

## Context

The Studio needs live updates when files change on disk (e.g., another editor modifies config.json, or a Luca session writes to state.json). SSE provides a simple, Next.js-native way to push server events to the client without WebSocket complexity.

## Task

Implement the SSE server route and client hook:

**Server (`GET /api/events`):**

- Single multiplexed SSE endpoint using chokidar v5 to watch `.planning/`, `src/agents/`, `src/skills/`, `src/rules/`
- Seven event types via SSE `event:` field: `file:changed`, `state:transition`, `compile:start`, `compile:complete`, `compile:error`, `ledger:entry`, `heartbeat`
- Critical: set `Content-Encoding: none` to prevent compression buffering in `next start`
- `awaitWriteFinish` debounce at 150ms
- Heartbeat every 30s
- Clean up watcher on stream cancel

**Client (`useSSE` hook):**

- Opens EventSource to `/api/events`
- Dispatches events to Jotai server state atoms (invalidates on `file:changed`)
- Handles reconnection on disconnect
- Updates compile status atoms on `compile:*` events

See `docs/brainstorm/observer-studio-rework/4.technical-architecture.md` (SSE Architecture section) for the full event table and implementation code.

## Key Files

- New: `packages/luca-studio/app/api/events/route.ts`
- New: `packages/luca-studio/hooks/use-sse.ts`
- Modified: Jotai server state atoms (add invalidation callbacks)

## Verification

- `curl http://localhost:3000/api/events` returns SSE stream with heartbeat events
- File changes in `.planning/` trigger `file:changed` events
- Client `useSSE` hook receives and dispatches events to atoms
- Server state atoms refresh when `file:changed` fires
- Stream reconnects automatically after disconnect
