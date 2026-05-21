# Phase 208: Pre-Mortem Risk Brief

## Risk Summary

| #   | Risk                                                                       | Severity | Mitigation                                                                |
| --- | -------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------- |
| 1   | SSE `onmessage` vs `addEventListener` coexistence breaks atom invalidation | HIGH     | Atomic migration — remove `onmessage`, add typed listeners in same commit |
| 2   | `globalThis` compile-event emitter leaks across HMR cycles                 | MEDIUM   | Register subscriptions inside `ReadableStream start()` callback only      |
| 3   | Per-file revert leaves dirty working tree → 409 self-deadlock on publish   | MEDIUM   | Include `non_studio_files` array in 409 response body                     |

## Detailed Scenarios

### 1. SSE Event Type Collision

The existing `use-sse.ts` dispatches via `es.onmessage`, which only fires for unnamed `message` events. Adding 7 typed event types using the SSE `event:` field means `onmessage` will NOT fire for typed events, and `addEventListener('file:changed', ...)` will NOT fire for untyped events. Partial migration = silent atom staleness.

**Constraint:** Remove `es.onmessage` and add typed `addEventListener` calls in the same commit. No intermediate state where both dispatch paths coexist.

### 2. globalThis Compile-Event Emitter HMR Leak

The compile-events pub/sub on `globalThis` (mirroring file-watcher pattern) will leak listeners if subscriptions are registered at module scope. Each HMR reload stacks a new listener without cleanup, causing duplicate SSE frames.

**Constraint:** All compile-event subscriptions must be registered inside the `ReadableStream start(controller)` callback. Use a distinct `globalThis` key (`__luca_studio_compile_events__`). Cleanup must call both file-watcher and compile-events `unsub()` on disconnect.

### 3. Per-File Revert 409 Self-Deadlock

`git checkout <sha> -- <file>` auto-stages the file. If the user then has external dirty files, `publish` returns 409 with no recovery path visible in the UI.

**Constraint:** Update `publish/route.ts` 409 response to include `non_studio_files` array (not just `file_count`). Config History UI must surface "blocked by N external changes" warning with filenames.

## Plan Constraints (for lu-planner)

1. The `use-sse.ts` `onmessage` handler must be removed in the same commit that adds typed `addEventListener` bindings
2. `lib/compile-events.ts` must document the `globalThis` key constant and require subscriptions inside SSE stream lifecycle callbacks
3. `POST /api/git/publish` 409 response body must include `non_studio_files` array before Config History UI is built
