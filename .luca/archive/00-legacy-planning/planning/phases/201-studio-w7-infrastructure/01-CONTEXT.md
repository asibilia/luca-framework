# Phase 201: Studio W7 Infrastructure — Context

## Decisions

### 1. SSE Reconnection Strategy

[auto-resolved] Use standard EventSource auto-reconnection with:

- 5s initial reconnection delay
- Exponential backoff to 30s max
- No custom retry header (let browser handle natively)
- On reconnect, client re-subscribes — no event replay needed (server just sends fresh state)

### 2. ETag Scope

[auto-resolved] Apply ETag middleware to:

- Config read/write routes (`/api/config/*`)
- Entity CRUD routes (`/api/entities/*`)

Exclude from:

- Compile proxy routes (`/api/compile/*`) — sidecar handles its own state
- State/ledger read routes (`/api/state`, `/api/ledger`) — read-only, no write conflict possible

### 3. SSE + ETag Interaction

[auto-resolved] No explicit coupling needed. The architecture handles this naturally:

- SSE `file:changed` event → invalidates Jotai server state atoms → atoms re-fetch via GET → fresh ETag returned in response headers
- Client stores new ETag for subsequent PUT requests
- If a PUT fails with 409, SSE will also fire file:changed (external modification), keeping the system consistent

### 4. Undo/Save Interaction

[auto-resolved] Save does NOT clear undo history. The jotai-history wraps the draft atom independently of persistence:

- Undo after save reverts the local draft atom (UI shows previous state)
- The saved version persists on disk (user can "refresh" to reload)
- This matches standard editor behavior (VS Code, etc.)
- RESET action explicitly clears history (used on page navigation away)

### 5. Pre-existing lib/etag.ts

[auto-resolved] Check if packages/luca-studio/lib/etag.ts already has partial ETag implementation from v8.0.0. If it exists, extend it rather than rewrite. The middleware pattern should wrap route handlers as a higher-order function.

### 6. Wave Ordering

- Wave 1: SSE server route + useSSE hook (standalone, no deps on other W7 features)
- Wave 2: ETag middleware + route integration (can run in parallel with or after SSE)
- Wave 3: Undo/redo atoms + keyboard shortcuts (depends on entity-atoms being stable)

SSE and ETag could potentially run in parallel since they touch different files. But ETag's cross-cutting nature (modifies all read/write routes) suggests sequencing after SSE to avoid merge conflicts.

## Scope Boundary

- Only implement the 3 features listed in the ROADMAP phase
- Do NOT add new pages or components (that's Phase 202)
- Do NOT implement git rollback (that's Phase 203)
- If a feature requires UI beyond toolbar buttons, defer to Phase 202

## Deferred Ideas

None — scope tightly defined by W7 infrastructure todos.
