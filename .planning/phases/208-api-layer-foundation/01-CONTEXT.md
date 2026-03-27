# Phase 208: API Layer Foundation — Context

## Phase Goal

Build foundational API infrastructure (event streaming, concurrency control, git safety) required by all downstream Studio pages.

## Complexity

COMPLEX — 3 cross-cutting API infrastructure features, 8+ files, HIGH architectural risk.

## Gray Area Decisions

### 1. SSE Event Multiplexing Strategy [researched]

**Decision:** Extend the existing `GET /api/events` route and `useSSE` hook to support typed SSE events via the standard `event:` field.

**Current state:** The SSE route (`app/api/events/route.ts`) already emits file change events using `data:` lines. The `useSSE` hook (`hooks/use-sse.ts`) uses `EventSource` with basic path-based dispatch to atoms.

**Implementation approach:**

- Use the SSE `event:` field to distinguish event types (not just `data:` with inline type)
- Seven event types: `file:changed`, `state:transition`, `compile:start`, `compile:complete`, `compile:error`, `ledger:entry`, `heartbeat`
- The file watcher singleton (`lib/file-watcher.ts`) already watches `.planning/`, `src/agents/`, `src/skills/`, `src/rules/` — extend path matching to emit typed events:
  - `state.json` or `STATE.md` changes → `state:transition`
  - `session-ledger.jsonl` changes → `ledger:entry`
  - Other `.planning/` or `src/` changes → `file:changed`
- Compile events: The sidecar process is separate — use an in-process event emitter (simple pub/sub on `globalThis`) that the compile route writes to and the SSE route subscribes to
- Client `useSSE` hook: Use `EventSource.addEventListener(type, handler)` per event type instead of generic `onmessage`
- `Content-Encoding: none` header to prevent compression buffering in `next start`
- Heartbeat: already at 15s, keep as-is (todo says 30s — 15s is better for detecting disconnects)
- `awaitWriteFinish` debounce: already implemented in watcher, verify 150ms setting

**Rationale:** This builds on the existing singleton watcher and EventSource patterns rather than introducing new infrastructure.

### 2. ETag Middleware Consolidation [researched]

**Decision:** The existing ETag infrastructure is sufficient. Do NOT extract a separate middleware — consolidate and verify coverage instead.

**Current state:**

- `lib/etag.ts` has `computeETag(content)` (16-char hex SHA-256 prefix)
- `lib/config-section-handler.ts` already enforces If-Match on PUT, returns 409 with current content on mismatch, returns 428 if If-Match is missing
- `lib/entity-route-helpers.ts` (`createEntityDetailHandler`) already implements ETag on GET and If-Match validation on PUT
- All config section routes and entity CRUD routes use these factories

**What remains:**

- Audit all writable routes to ensure ETag coverage (git routes, compile routes may not have it)
- Ensure 409 responses include the current file content (for client-side diff)
- Client-side: verify `configEtagAtom` and entity ETags are properly stored/sent
- Add a `DiffPreview` component for conflict resolution (shows external changes vs local draft)

**Rationale:** Extracting a standalone middleware would duplicate what the factories already do. The factory pattern is the project's established approach.

### 3. Git Rollback UX [researched]

**Decision:** Extend existing git route infrastructure with history listing and per-file revert.

**Current state:**

- `app/api/git/publish/route.ts` exists — commits changed files with studio prefix
- `app/api/git/revert/route.ts` exists — basic revert functionality
- Uses `Bun.$` shell commands (project convention)

**Implementation approach:**

- `GET /api/git/history` — `git log --grep="[studio-edit]" --format=...` returning commit timeline
- `POST /api/git/revert` — `git checkout <sha> -- <file>` for per-file rollback with confirmation
- Config History component: timeline list with commit message, date, file count
- Diff preview before revert: `git diff <sha> -- <file>` to show what will change
- Edge cases: check for uncommitted changes before revert (abort with 409 if dirty working tree), handle detached HEAD gracefully

**Rationale:** Git operations stay server-side via `Bun.$` (established pattern). No new dependencies.

### 4. Compile Event Integration [researched]

**Decision:** Use an in-process pub/sub event emitter to bridge compile routes to the SSE stream.

**Implementation approach:**

- Create `lib/compile-events.ts` with a simple pub/sub on `globalThis` (survives HMR, same pattern as file watcher)
- Compile route (`POST /api/compile`): publish `compile:start` before forwarding to sidecar, `compile:complete` or `compile:error` after response
- SSE route: subscribe to compile events alongside file watcher events
- Client-side: `useSSE` hook listens for `compile:*` events and updates compile status atoms

**Rationale:** The sidecar is a separate Bun process — we can't directly push events from it. But the Next.js compile route proxies all sidecar calls, so it's the natural place to emit events.

## Scope Guardrails

- Phase 208 extends EXISTING infrastructure only — no new frameworks or dependencies
- The file watcher singleton, ETag factories, and git utilities already exist
- DiffPreview component is the only significant new UI component
- All other features are API route extensions and hook enhancements

## Deferred Ideas

- WebSocket upgrade for SSE (defer to future — EventSource is sufficient and simpler)
- Real-time collaborative editing (out of scope — single developer workflow)
- Git branch management UI (defer — rollback is sufficient for v8.3.0)
