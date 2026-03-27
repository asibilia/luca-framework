# Phase 208 — Wave 01 Summary: Server-Side Infrastructure

## Objective

Build the server-side pub/sub, SSE multiplexing, and error response infrastructure needed for Luca Studio's real-time capabilities.

## Tasks Completed

| #   | Task                                           | Commit     | Files                                                                                                    |
| --- | ---------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------- |
| 1   | Create compile-events pub/sub module           | `aa22afed` | `packages/luca-studio/lib/compile-events.ts` (new)                                                       |
| 2   | Wire compile route to publish compile events   | `1fd5a1f3` | `packages/luca-studio/app/api/compile/route.ts`                                                          |
| 3   | Upgrade SSE route to typed event multiplexing  | `960ca8bd` | `packages/luca-studio/app/api/events/route.ts`                                                           |
| 4   | Harden git publish 409 response                | `7b506027` | `packages/luca-studio/app/api/git/publish/route.ts`                                                      |
| 5   | Extend ETag 409 responses with current content | `5f64016f` | `packages/luca-studio/lib/config-section-handler.ts`, `packages/luca-studio/lib/entity-route-helpers.ts` |

## Key Implementation Details

### Compile Events Pub/Sub (Task 1)

- GlobalThis-based singleton following the same pattern as `file-watcher.ts`
- Uses `__luca_studio_compile_events__` as the globalThis key (PREMORTEM constraint #2)
- Exports `CompileEvent` discriminated union type, `publishCompileEvent()`, and `subscribeCompile()`
- Documented constraint: subscriptions MUST be registered inside `ReadableStream start()` callbacks only

### Compile Route Integration (Task 2)

- Publishes `compile:start` before sidecar fetch
- Publishes `compile:complete` on successful sidecar response
- Publishes `compile:error` on timeout, unreachable, sidecar error status, and unknown fetch errors

### SSE Event Multiplexing (Task 3)

- Path-based event type classification:
  - `state.json` or `STATE.md` in `.planning/` -> `state:transition`
  - `session-ledger.jsonl` in `.planning/` -> `ledger:entry`
  - All other file changes -> `file:changed`
- Compile events forwarded as SSE events with their type (`compile:start`, `compile:complete`, `compile:error`)
- Added `Content-Encoding: none` header
- Heartbeat changed to typed SSE format: `event: heartbeat\ndata: {}\n\n`
- Both file-watcher and compile-events subscriptions cleaned up on disconnect
- Compile subscription registered inside `ReadableStream start()` (PREMORTEM constraint #2)

### Git Publish 409 Hardening (Task 4)

- Extended 409 response with `non_studio_files: string[]` containing actual file paths (PREMORTEM constraint #3)

### ETag 409 Content Enrichment (Task 5)

- Config section handler: 409 now includes `current_content` (section data) and `current_etag`
- Entity route helpers: 409 now includes `current_content` (raw entity config text) and `current_etag`
- Migrated entity response from camelCase `currentEtag` to snake_case `current_etag` per API convention

## Deviations

None. All tasks completed as specified.

## Verification

- `bunx --bun tsc --noEmit` passes with zero errors after every task and after all tasks complete
- All 5 commits are atomic and sequential on branch `109--v8.3.0-studio-feature-suite`
