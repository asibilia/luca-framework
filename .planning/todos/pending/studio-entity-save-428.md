---
title: "Fix entity save triggering PUT without ETag (428 error)"
area: ui
created: 2026-03-27
source: conversation
priority: P2
estimated_size: S
---

## Context

During Phase 208 live testing, selecting an agent in the Agents page triggered a 428 (Precondition Required) error. The `useEntitySave` hook at `hooks/use-entity-save.ts:71` sends a PUT request without the `If-Match` header when `etag` is null/undefined.

## Task

Investigate why save is being triggered on agent selection (should only trigger on explicit save action). Fix the root cause:

1. If save is being called before the entity is loaded (ETag not yet available), add a guard: don't call PUT if etag is null
2. If an auto-save mechanism is incorrectly triggering, fix the trigger condition
3. The save function at line 71 only adds If-Match when `etag` is truthy — this is correct, but the server rejects requests without If-Match (428). The client should prevent the save call entirely when no ETag is available.

## Notes

- Pre-existing issue, not introduced by Phase 208
- Error trace: `useEntitySave.useCallback[save]` at `hooks/use-entity-save.ts (89:13)`
- The 428 response is correct server behavior — the bug is on the client side
