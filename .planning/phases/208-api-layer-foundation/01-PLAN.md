---
phase: 208
plan: 1
type: feature
autonomous: true
wave: 1
depends_on: []
---

# Phase 208 Plan 1: Server-Side Infrastructure

## Objective

Upgrade the SSE event stream to typed event multiplexing, create the compile-events pub/sub bridge, and harden the git publish route's 409 response — all server-side changes that downstream client work (Wave 02) depends on.

> Appetite: Large (200K tokens remaining of 200K ceiling)

## Context

@packages/luca-studio/app/api/events/route.ts
@packages/luca-studio/lib/file-watcher.ts
@packages/luca-studio/app/api/compile/route.ts
@packages/luca-studio/app/api/git/publish/route.ts
@packages/luca-studio/lib/etag.ts
@packages/luca-studio/lib/config-section-handler.ts
@packages/luca-studio/lib/entity-route-helpers.ts
@.planning/phases/208-api-layer-foundation/01-CONTEXT.md
@.planning/phases/208-api-layer-foundation/01-PREMORTEM.md

## Tasks

### 1. Create compile-events pub/sub module

**Type:** auto
**TDD:** false
**Depends on:** none

Create `packages/luca-studio/lib/compile-events.ts` — a globalThis-based pub/sub for compile lifecycle events, following the same singleton pattern as `lib/file-watcher.ts`.

The module must:

- Use `__luca_studio_compile_events__` as the globalThis key (PREMORTEM constraint #2)
- Export `CompileEvent` type with discriminated union: `{ type: 'compile:start' | 'compile:complete' | 'compile:error'; domain: string; name: string; timestamp: string; error?: string }`
- Export `publishCompileEvent(event: CompileEvent): void` for the compile route to call
- Export `subscribeCompile(listener: (event: CompileEvent) => void): () => void` returning an unsubscribe function
- Document that subscriptions MUST be registered inside `ReadableStream start()` callbacks only (PREMORTEM constraint #2)
- No cleanup/ref-count needed (unlike file-watcher) since the SSE route manages its own lifecycle

**Files to create:**

- `packages/luca-studio/lib/compile-events.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Module exports `publishCompileEvent`, `subscribeCompile`, and `CompileEvent` type

### 2. Wire compile route to publish compile events

**Type:** auto
**TDD:** false
**Depends on:** 1

Extend `packages/luca-studio/app/api/compile/route.ts` to publish compile lifecycle events via the new pub/sub module.

Changes:

- Import `publishCompileEvent` from `~/lib/compile-events`
- Publish `compile:start` event immediately before the sidecar fetch call
- Publish `compile:complete` event on successful sidecar response (include the domain/name)
- Publish `compile:error` event on sidecar error (include error message)
- Events must be published in all code paths: timeout, unreachable, unknown error

**Files to edit:**

- `packages/luca-studio/app/api/compile/route.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Compile route imports and calls `publishCompileEvent` in all success/error paths

### 3. Upgrade SSE route to typed event multiplexing

**Type:** auto
**TDD:** false
**Depends on:** 1

Extend `packages/luca-studio/app/api/events/route.ts` to emit SSE events with the `event:` field for typed dispatch, and subscribe to compile events alongside file watcher events.

Changes to the SSE route:

- Import `subscribeCompile` from `~/lib/compile-events`
- Add path-based event type classification function:
  - `state.json` or `STATE.md` in `.planning/` -> event type `state:transition`
  - `session-ledger.jsonl` in `.planning/` -> event type `ledger:entry`
  - All other file changes -> event type `file:changed`
- Change the `data:` emission format to include SSE `event:` field:
  ```
  event: file:changed\ndata: {"path":"...","timestamp":"..."}\n\n
  ```
- Subscribe to compile events INSIDE the `ReadableStream start()` callback (PREMORTEM constraint #2)
- Forward compile events as SSE events with their type (`compile:start`, `compile:complete`, `compile:error`)
- Add `Content-Encoding: none` header to prevent compression buffering in `next start`
- Clean up BOTH file-watcher and compile-events subscriptions on disconnect
- Change heartbeat to use `event: heartbeat\ndata: {}\n\n` format (typed event, not SSE comment)

**Files to edit:**

- `packages/luca-studio/app/api/events/route.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- SSE route emits events with `event:` field for all 7 event types
- Both file-watcher and compile-events subscriptions are cleaned up on abort

### 4. Harden git publish 409 response with non_studio_files array

**Type:** auto
**TDD:** false
**Depends on:** none

Update `packages/luca-studio/app/api/git/publish/route.ts` to include the `non_studio_files` array in the 409 conflict response (PREMORTEM constraint #3).

Changes:

- The 409 response currently returns `{ error, file_count }` — extend to also include `non_studio_files: string[]` with the actual file paths
- This enables the Config History UI (Wave 02) to show "blocked by N external changes" with filenames

**Files to edit:**

- `packages/luca-studio/app/api/git/publish/route.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- The 409 JSON response body includes `non_studio_files` array alongside existing `error` and `file_count` fields

### 5. Extend ETag 409 responses to include current content

**Type:** auto
**TDD:** false
**Depends on:** none

Audit and extend ETag conflict (409) responses in `config-section-handler.ts` and `entity-route-helpers.ts` to include the current server content, enabling client-side diff display.

Changes to `lib/config-section-handler.ts`:

- The 409 response currently returns `{ error: "Conflict: config has been modified..." }` — extend to also include `current_content` (the current raw config section data) and `current_etag` (the fresh ETag)

Changes to `lib/entity-route-helpers.ts`:

- The 409 response currently returns `{ error, currentEtag }` — extend to also include `current_content` with the current `rawConfigText` value (requires reading the entity file on conflict)

**Files to edit:**

- `packages/luca-studio/lib/config-section-handler.ts`
- `packages/luca-studio/lib/entity-route-helpers.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Both factories return `current_content` and `current_etag` in 409 responses

## Verification

1. `bunx --bun tsc --noEmit` passes across the entire `packages/luca-studio/` package
2. The SSE route emits all 7 event types: `file:changed`, `state:transition`, `compile:start`, `compile:complete`, `compile:error`, `ledger:entry`, `heartbeat`
3. Compile events flow from compile route -> pub/sub -> SSE route
4. Git publish 409 includes `non_studio_files` array
5. ETag 409 responses include current content for client-side diffing

## Success Criteria

- All server-side API routes are upgraded for typed SSE events, compile event bridging, and enriched conflict responses
- No breaking changes to existing EventSource clients (they will simply stop receiving events until Wave 02 migrates `useSSE`)
- Wave 02 client work can proceed with confidence that all server contracts are in place

## Output Specification

- `packages/luca-studio/lib/compile-events.ts` (new)
- `packages/luca-studio/app/api/events/route.ts` (modified)
- `packages/luca-studio/app/api/compile/route.ts` (modified)
- `packages/luca-studio/app/api/git/publish/route.ts` (modified)
- `packages/luca-studio/lib/config-section-handler.ts` (modified)
- `packages/luca-studio/lib/entity-route-helpers.ts` (modified)
