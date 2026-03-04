# Plan 108-02: Event Store Eviction + SSE Hardening

## Status: COMPLETE

## Changes

### Task 108-02-1: Event Store Eviction Cap (`packages/luca-observer/lib/db.ts`)

- Added `MAX_EVENTS` constant (default 10,000, env-configurable via `LUCA_OBSERVER_MAX_EVENTS`, minimum floor 100)
- Added eviction logic in `insertEvent`: oldest events are shifted off when the cap is exceeded
- `nextId` continues incrementing and is never reset by eviction
- `MAX_EVENTS` exported for test access

### Task 108-02-2: SSE Connection Limit (`packages/luca-observer/lib/sse.ts`, `app/api/stream/route.ts`)

- Added `MAX_SSE_CLIENTS` constant (default 50, env-configurable via `LUCA_OBSERVER_MAX_SSE_CLIENTS`, minimum floor 5)
- Added `canAcceptSSEClient()` function that checks current count against limit
- Stream route returns 503 with `Retry-After: 30` header when at capacity

### Task 108-02-3: SSE Heartbeat + Idle Timeout (`packages/luca-observer/lib/sse.ts`)

- Added `HEARTBEAT_INTERVAL_MS` (30s) and `IDLE_TIMEOUT_MS` (5 min) constants
- Replaced `Set<SSEController>` with `Map<SSEController, SSEClientMeta>` for per-client metadata
- `SSEClientMeta` tracks `controller`, `lastActivityMs`, and `heartbeatTimer`
- `addSSEClient`: starts heartbeat interval that sends `: heartbeat\n\n` and checks idle timeout
- `broadcastEvent`: refreshes `lastActivityMs` for each client on successful delivery
- `removeSSEClient`: clears heartbeat timer before removing from Map
- Idle clients (no broadcast activity for 5 minutes) are automatically disconnected

## Verification

- `bunx --bun tsc --noEmit`: passed (zero errors)
- `bun test __tests__/packages/luca-observer/`: 20/20 tests pass

## Files Modified

| File                                             | Change                                              |
| ------------------------------------------------ | --------------------------------------------------- |
| `packages/luca-observer/lib/db.ts`               | MAX_EVENTS + eviction while-loop                    |
| `packages/luca-observer/lib/sse.ts`              | Set->Map, heartbeat, idle timeout, connection limit |
| `packages/luca-observer/app/api/stream/route.ts` | 503 gate via canAcceptSSEClient                     |
