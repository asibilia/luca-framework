# Phase 201: Studio W7 Infrastructure — Pre-Mortem Risk Brief

**Complexity:** COMPLEX | **Appetite:** Large (200K tokens, 60% context)

## Risk Scenarios

### 1. Chokidar SSE Stream Leak in Next.js API Routes

Next.js serverless lifecycle disposes API route handlers between requests, but chokidar watcher + SSE ReadableStream require persistent state. Watcher may be instantiated per-request, leaking file descriptors.

**Mitigation:** Create singleton watcher module with module-scoped `let watcher` and reference counting. SSE route hooks into `request.signal` (AbortSignal) to decrement ref count on disconnect. Close watcher when last client disconnects.

### 2. ETag Scope Mismatch Between Config and Entity Handlers

config-section-handler.ts computes ETags from section JSON, entity-route-helpers.ts from raw file contents. Middleware wrapper will produce double-ETag or mismatched ETags. Partial-protection window during development.

**Mitigation:** Audit all 8 config + 6 entity routes for existing ETag behavior. Middleware skips header injection when handler already set one. Add If-Match checking in config-section-handler.ts itself rather than relying solely on external middleware.

### 3. jotai-history Atom Identity Drift with SSE Re-fetches

SSE file:changed → re-fetch → setDraft() pushes a new history entry, making next Cmd+Z undo the re-fetch rather than the user's last edit.

**Mitigation:** When SSE triggers re-fetch, compare fetched data to current draft. Only call setDraft() if values differ. If they do, dispatch RESET on history atom to clear stale history. Use a separate "server-state-sync" write path that bypasses history tracking.

## Plan Constraints

- Wave 1 (SSE): Validate watcher lifecycle with multi-client connect/disconnect before proceeding
- Wave 2 (ETag): Produce route compatibility matrix before writing middleware — reconcile config-section-handler vs entity-route-helpers ETag strategies
- Wave 3 (Undo): Define clear boundary between "user edits" (tracked) and "server-state syncs" (untracked) at atom layer
- Do NOT run `bun run build:all` — verify with `bunx --bun tsc --noEmit` only
