---
title: "ETag-based optimistic locking middleware"
area: api
created: 2026-03-25
source: docs/brainstorm/observer-studio-rework
depends_on: [studio-w3-config-write-routes, studio-w3-entity-crud-routes]
phase: studio-w7
estimated_size: S
priority: P2
---

## Context

The real-world pattern is a single developer switching between their editor and Studio. Full locking is overkill, but the Studio needs to detect when files have been changed externally (e.g., by a Luca session or manual editor) since the last read. ETag-based optimistic locking provides this with minimal overhead.

## Task

Implement ETag middleware for all read/write routes:

- Every GET response includes `ETag: sha256(file_contents).substring(0, 16)`
- Every PUT/PATCH request must include `If-Match: <etag>` header
- Middleware reads current file, computes hash, rejects with `409 Conflict` if ETag doesn't match
- On 409, response includes the current file content so the UI can show a diff
- Implement as reusable middleware that wraps route handlers

Client-side handling:

- Store ETag from GET responses
- Send ETag with PUT requests
- On 409, show DiffPreview component with external changes
- Allow user to "merge" (overwrite) or "refresh" (reload external changes)

See `docs/brainstorm/observer-studio-rework/4.technical-architecture.md` (Concurrency Model section) for the ETag spec.

## Key Files

- New: `packages/luca-studio/lib/etag-middleware.ts`
- Modified: All GET routes (add ETag header)
- Modified: All PUT routes (check If-Match header)
- Modified: Client fetch utilities (send/receive ETags)

## Verification

- GET responses include ETag header
- PUT with correct ETag succeeds
- PUT with stale ETag returns 409 with current content
- UI shows diff on 409 conflict
- Overwrite and refresh flows work correctly
