# SpacetimeDB Migration — DO NOT REVERT

**Priority: URGENT**
**Date: 2026-03-04**
**Branch: 44--v2.7.0-observability-verification**

## What Was Done

A SpacetimeDB real-time database integration was added to provide real-time observability for the luca-observer dashboard. This replaces polling + SSE with WebSocket subscriptions.

## Architecture Decision: Additive Only

SpacetimeDB is an **additive layer** — it receives copies of data for dashboard observability. Local JSON files (`state.json`, `brain.json`, `memory.json`, `working.json`, `session-ledger.jsonl`) remain the **authoritative source of truth** for the workflow engine and memory system.

**DO NOT remove JSON file writes from:**

- `packages/luca-framework/src/state/persistence.ts` — state.json writes are critical
- `packages/luca-framework/src/state/bridge.ts` — Bun.write + loadPersistedActor must stay
- `src/memory/__helpers/bridge.ts` — writeJsonFile calls must stay

## New Packages/Files

- `packages/luca-spacetime/` — SpacetimeDB module (16 tables, 19 reducers)
- `packages/luca-framework/src/state/__helpers/observer-emitter.ts` — fire-and-forget reducer calls
- `packages/luca-observer/` — rewritten hooks (polling → useTable), new observability UI

## Modified Files (SpacetimeDB sync added)

These files have fire-and-forget SpacetimeDB calls added AFTER existing JSON writes:

- `packages/luca-framework/src/state/bridge.ts` — callReducer after handleSetField/handleTransition/handleEnsureInit
- `packages/luca-framework/src/state/index.ts` — exports observer-emitter functions
- `src/memory/__helpers/bridge.ts` — syncMemoryToSpacetimeDB() after write operations
- `src/hooks/scripts/*.sh` (5 files) — SpacetimeDB ingest_event calls

## Key Convention

- SpacetimeDB reducers use **camelCase** parameters (eventType, sessionId, not snake_case)
- URL: `LUCA_SPACETIMEDB_URL` env var, defaults to `http://localhost:3000`
- HTTP API: `POST /database/luca-observer/call/{reducer_name}` with `{ "args": { ... } }`
- All calls use 2-second timeout and fire-and-forget pattern
