# Phase 99 — Observer Foundation MVP: Research

## 1. Executive Summary

Phase 99 connects the observer dashboard to real data from the luca-framework state machine, session ledger, and harness verification system. The observer already has substantial scaffolding (Next.js app, 9 pages, SSE infrastructure, API routes, in-memory event store), but the Workflow, Harness, and Dashboard pages are stubs. The key architectural challenge is the **schema bridge**: luca-observer has zero runtime dependencies on luca-framework, and types are currently duplicated. Connecting them requires a shared types strategy that does not violate package isolation.

---

## 2. Observer Current State (`packages/luca-observer/`)

### 2.1 Architecture

- **Framework:** Next.js 15 with App Router, React 19, Tailwind v4
- **State management:** Jotai (sidebar, filters, session atoms)
- **Port:** 3456 (configurable via CLI)
- **Entry point:** `bin/luca-observer.js` (Bun shebang, spawns `bunx next dev`)
- **Path alias:** `~/` maps to `src/` in tsconfig

### 2.2 Pages (9 total)

| Page       | Path          | Status                         | Data Source                               |
| ---------- | ------------- | ------------------------------ | ----------------------------------------- |
| Dashboard  | `/`           | **Live** (real SSE events)     | `useEventStream()` + `useWorkflowState()` |
| Workflow   | `/workflow`   | **Stub** — "coming in Phase 2" | None                                      |
| Iterations | `/iterations` | **Stub** — "coming in Phase 3" | None                                      |
| Harness    | `/harness`    | **Stub** — "coming in Phase 3" | None                                      |
| Planning   | `/planning`   | **Stub** — "coming in Phase 4" | None                                      |
| Memory     | `/memory`     | **Stub** — "coming in Phase 4" | None                                      |
| Tribunal   | `/tribunal`   | **Stub** — "coming in Phase 5" | None                                      |
| Agents     | `/agents`     | **Stub** — "coming in Phase 5" | None                                      |
| Notes      | `/notes`      | **Live** (form + SSE refresh)  | `/api/notes` GET/POST                     |

### 2.3 API Routes (8 total)

| Route               | Method   | Purpose                                | Data Source                           |
| ------------------- | -------- | -------------------------------------- | ------------------------------------- |
| `/api/events`       | POST     | Ingest events from hooks/emitter       | In-memory store                       |
| `/api/stream`       | GET      | SSE real-time broadcast                | In-memory SSE clients                 |
| `/api/events-query` | GET      | Query stored events (filter, paginate) | In-memory store                       |
| `/api/sessions`     | GET      | List sessions                          | In-memory store                       |
| `/api/state`        | GET      | Read workflow state                    | `.planning/STATE.md` (filesystem)     |
| `/api/metrics`      | GET      | Read metrics.json                      | `.planning/metrics.json` (filesystem) |
| `/api/memory`       | GET      | Read BRAIN/MEMORY/WORKING.md           | `.planning/*.md` (filesystem)         |
| `/api/notes`        | GET/POST | Read/create developer notes            | `.planning/notes/` (filesystem)       |

### 2.4 Client Hooks

| Hook                 | Pattern                              | Interval  |
| -------------------- | ------------------------------------ | --------- |
| `useEventStream()`   | SSE via `EventSource("/api/stream")` | Real-time |
| `useWorkflowState()` | Polling `GET /api/state`             | 5s        |
| `useMetrics()`       | Polling `GET /api/metrics`           | 10s       |

### 2.5 Shared Components

- **Layout:** `PageContainer`, `SectionHeader`, `DetailLayout`, `Sidebar`, `Header`
- **Shared:** `EventBadge`, `JsonViewer`, `StatusIndicator`
- **Stores:** `sidebarOpenAtom`, `selectedSessionAtom`, `eventTypeFilterAtom`, `searchQueryAtom`

### 2.6 Type System (`lib/types.ts`)

Observer defines its own Zod schemas:

- `ObserverEventSchema` (API ingestion payload)
- `StoredEventSchema` (event + id + timestamp_ms)
- `SessionRecordSchema` (session tracking)
- `WorkflowSnapshotSchema` (parsed from STATE.md)
- `EventResponseSchema` (POST acknowledgment)

**None of these import from luca-framework.** Types are locally defined and use snake_case.

### 2.7 Data Store (`lib/db.ts`)

In-memory store using `globalThis` for HMR safety. Functions: `insertEvent()`, `queryEvents()`, `upsertSession()`, `getSessions()`, `getLatestEventId()`. No persistence to disk.

### 2.8 SSE System (`lib/sse.ts`)

Working SSE broadcaster using `ReadableStream` and `Set<SSEController>`. Broadcasts events to all connected clients. HMR-safe via `globalThis`.

### 2.9 Tests

Minimal: only `__tests__/utils/test-helpers.test.ts` (fetch mock, env var helpers). Test dirs `__tests__/api/` and `__tests__/hooks/` have `.gitkeep` files only.

---

## 3. Framework State Machine (`packages/luca-framework/src/state/`)

### 3.1 Machine Architecture

- **Engine:** XState v5 (`setup()` + `createMachine()`)
- **States:** idle, preflight, routing, discussing, planning, executing, verifying, learning, committing, complete, paused, suspended, failed (13 states)
- **Child actor:** `phaseActorMachine` (7 states: idle, wave_executing, wave_evaluating, phase_verifying, phase_fixing, phase_done, phase_blocked)
- **Context:** `WorkflowContext` with 30+ fields (identity, classification, execution tracking, budgets, cognitive, timestamps)
- **Events:** 19 event types in `workflowEventSchema` discriminated union
- **Guards:** `shouldRunDiscussion`, `shouldCaptureLearnings`, `canRetryVerification`, `hasMorePhases`

### 3.2 Bridge CLI (`bridge.ts`)

Shell-friendly interface outputting JSON to stdout. Key commands:

- `read-status` — Full state JSON (initialized, state, complexity, oversight, phase, session, etc.)
- `read-complexity`, `read-oversight`, `read-phase`
- `read-ledger` — Filter by session/event/since, tail/limit
- `transition` — Send events, persist, update STATE.md
- `ensure-init`, `snapshot`, `gate-check`, `suspend`, `resume-phase`

### 3.3 Session Ledger (`ledger.ts`)

Append-only JSONL file at `.planning/session-ledger.jsonl`. Schema:

```
LedgerEntry = TransitionRecord + {
  sequence_number: number,
  parent_id: number | null
}
```

TransitionRecord fields: `previous_state`, `current_state`, `event_type`, `event_data`, `actions_executed`, `context` (summary), `timestamp`, `session_id`.

Functions: `appendLedgerEntry()`, `readLedger(filters)`, `_resetSequenceCounter()`.

### 3.4 Observer Emitter (`observer-emitter.ts`)

Fire-and-forget HTTP POST to `LUCA_OBSERVER_URL/api/events`. Only fires when `LUCA_OBSERVER_URL` is set. Sends `{ event_type, timestamp, ...data }`. 2s timeout. Silently swallows errors. This is the mechanism that connects framework transitions to the observer.

### 3.5 Event Utilities (`events.ts`)

- `buildTransitionRecord()` — Creates structured transition records
- `extractContextSummary()` — Minimal context subset for logs
- `isSignificantTransition()` — Filters self-transitions
- `describeTransition()` — Human-readable format

### 3.6 Exported Public API (`index.ts`)

Barrel export of: machine, types, guards, actions, events, defaults, persistence, snapshot, bridge, suspend-checkpoint, ledger. Rich API surface for consumption.

---

## 4. Harness System (`src/harness/`)

### 4.1 Architecture

- **Runner:** `__helpers/runner.ts` — `runHarness(config, projectDir) -> HarnessResult`
- **Pipeline:** `__helpers/pipeline.ts` — `composePipeline()`, `resolveMiddleware()`, `buildMiddlewareResult()`
- **Parsers:** `parsers/` — bun-test, tsc, eslint, generic output parsers

### 4.2 Key Types

```typescript
HarnessResult {
  status: "passed" | "failed"
  checks: CheckResult[]
  totalErrors: number
  totalWarnings: number
  duration: number
  timestamp: string
}

CheckResult {
  name: string
  status: "passed" | "failed" | "skipped" | "timeout"
  exitCode: number
  errors: ParsedError[]
  warnings: ParsedError[]
  rawOutput: string
  duration: number
  middlewareResult?: MiddlewareResult
}

ParsedError {
  file: string
  line?: number
  column?: number
  message: string
  code?: string
  severity: "error" | "warning"
}

MiddlewareResult {
  pipelineDuration: number
  middlewareTiming: Record<string, number>
  metadata: Record<string, unknown>
  pipelineStatus: "completed" | "error" | "skipped"
  pipelineError?: string
}
```

### 4.3 Middleware (Phase 98)

Three middleware modules built:

- **timing** — Records startedAt/endedAt, duration
- **workspace-scope** — Scopes file paths to workspace
- **output-capture** — Captures raw output to temp files

### 4.4 Default Configuration

Enabled checks: test (bun test), typecheck (tsc --noEmit). Disabled: lint, build. Pipeline enabled with timing + workspace-scope + output-capture.

---

## 5. Schema Bridge Analysis

### 5.1 Current State: No Shared Types

- `luca-observer` package.json has **zero** dependency on `luca-framework`
- Types are duplicated: observer defines `WorkflowSnapshotSchema` locally, framework defines `workflowContextSchema`
- No shared types package exists
- The `observer-emitter.ts` sends data over HTTP (no compile-time type sharing)

### 5.2 Data Flow

```
luca-framework state machine
  -> bridge.ts persists to .planning/STATE.md
  -> observer-emitter.ts POSTs to /api/events (if LUCA_OBSERVER_URL set)

luca-observer:
  -> /api/state reads .planning/STATE.md (parseStateMd regex extraction)
  -> /api/events receives HTTP POSTs from emitter
  -> /api/stream broadcasts to SSE clients
  -> /api/events-query returns filtered in-memory events
```

### 5.3 Gap: No Ledger Access

The observer has **no route or mechanism to read the session ledger** (`session-ledger.jsonl`). The ledger contains the richest data for the workflow and harness pages (state transitions, context summaries, timestamps). Currently:

- `/api/state` reads STATE.md (current snapshot only, no history)
- `/api/events` stores in-memory events from emitter POSTs (volatile, lost on restart)
- The ledger file is never read by the observer

### 5.4 Gap: No Harness Results Access

The observer has **no route to read harness results**. The harness runner outputs `HarnessResult` JSON, but:

- Results are consumed by the skill/agent that invoked the harness
- No harness result is persisted to a well-known location
- The observer's `harness.result` event type exists in constants but no page consumes it
- The emitter could POST harness events, but the harness page needs structured `CheckResult[]` data

---

## 6. Approach Recommendations

### 6.1 Schema Bridge Strategy

**Recommended: File-based API routes (no direct dependency)**

Create new API routes in the observer that read luca-framework files from the filesystem:

1. **`/api/ledger`** — Read and filter `session-ledger.jsonl` (re-implement the filter logic using the same JSONL format, or shell out to `bun run bridge.ts read-ledger`)
2. **`/api/harness-results`** — Read the most recent harness result from a well-known location (requires framework to persist results, or read from ledger events)
3. **Shared Zod schemas** — Create a `packages/luca-shared-types/` package OR copy the critical schemas into observer's `lib/types.ts`

**Why not direct dependency?** The observer is a Next.js app running independently. Importing from luca-framework would pull in XState, Bun APIs, and filesystem dependencies that may conflict with Next.js bundling. The file-based approach matches the existing pattern (`/api/state` reads STATE.md, `/api/memory` reads markdown files).

**Alternative: Bridge CLI exec** — Observer API routes could exec `bun run packages/luca-framework/src/state/bridge.ts read-status` etc. This reuses the typed bridge but adds process spawn overhead (~200ms per call).

### 6.2 Dashboard Overview Page (Real Data)

The dashboard already works with SSE events. To enhance with real data:

1. **Wire `useWorkflowState()` data into OverviewCards** — Already done (reads `/api/state`)
2. **Add ledger-backed metrics** — Total transitions, phases completed, latest harness status (from new `/api/ledger` route)
3. **Add session duration, event count from ledger**

### 6.3 Workflow State Machine Page

Build the `/workflow` page with:

1. **State diagram** — Static SVG/component showing the 13 workflow states with the current state highlighted. Could use a hardcoded state graph (the machine topology is fixed).
2. **Transition log** — Table of recent transitions from the session ledger, showing `previous_state -> current_state`, event type, timestamp. Use the new `/api/ledger` route.
3. **Current context panel** — Display key context fields from `/api/state` (complexity, oversight, phase, session ID, verification attempts).
4. **Allowed events** — Show which events the machine currently accepts (from bridge `read-status`).

### 6.4 Harness/Verification Results Page

Build the `/harness` page with:

1. **Check result cards** — Show each check (test, typecheck, lint, build) with pass/fail status, error count, duration
2. **Error list** — Expandable ParsedError details with file, line, message, severity
3. **Middleware metadata** — Pipeline timing, workspace scope info
4. **Fix iteration history** — Show verification_attempts from state context

**Data source challenge:** The harness runner does not currently persist results to a file. Options:

- **(A)** Have the harness runner write results to `.planning/harness-result.json` (requires framework change)
- **(B)** Emit harness results via observer-emitter with full `HarnessResult` payload
- **(C)** Read from the ledger — the `HARNESS_COMPLETE` event in the state machine only records status + error count, not full `CheckResult[]`

**Recommendation:** Combine (A) and (B). Persist to `.planning/harness-result.json` for the observer to read via a new `/api/harness-results` route, and also emit via observer-emitter for real-time SSE updates.

### 6.5 SSE Event Stream Integration Tests

Tests needed:

1. **POST /api/events -> SSE broadcast** — POST an event, verify connected SSE client receives it
2. **Observer-emitter -> API -> SSE chain** — Verify the full path from framework emitter to observer display
3. **Reconnection** — SSE client reconnects on disconnect (already implemented in `useEventStream`)
4. **Filter/query** — Test `/api/events-query` with session_id, event_type, limit, offset, since_id filters

Testing approach: Use the existing `createFetchMock` helpers from `__tests__/utils/test-helpers.ts`. For SSE tests, may need to mock `EventSource` or test the server-side broadcast function directly.

---

## 7. Risks & Mitigations

| Risk                                 | Severity | Mitigation                                                                                                                                         |
| ------------------------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **No shared types between packages** | HIGH     | Create Zod schemas in observer that mirror framework schemas. Validate with integration tests. Consider extracting to shared package in Phase 100. |
| **Harness results not persisted**    | HIGH     | Add `.planning/harness-result.json` write in framework harness runner. Small, targeted change.                                                     |
| **Ledger file parsing in observer**  | MEDIUM   | Reuse the same JSONL parse + filter logic. The schema is simple (LedgerEntry). Use safeParse for resilience.                                       |
| **Observer process independence**    | LOW      | Observer reads files from filesystem. No direct import. Works even when framework is not running.                                                  |
| **SSE test complexity**              | MEDIUM   | Test the broadcast/store functions directly rather than full SSE client-server. EventSource is hard to mock in Node/Bun test env.                  |
| **Bridge CLI exec overhead**         | LOW      | Prefer direct file reads over CLI exec. Reserve CLI exec for complex operations like `read-status`.                                                |
| **In-memory event store volatility** | LOW      | Acceptable for MVP. SpacetimeDB or SQLite integration planned for later phase. Ledger provides persistent history.                                 |

---

## 8. Deliverable Breakdown

### D1: Schema Bridge (observer -> luca-framework state)

- [ ] New API route: `GET /api/ledger` — read session-ledger.jsonl with filters
- [ ] New API route: `GET /api/harness-results` — read `.planning/harness-result.json`
- [ ] Zod schemas in observer `lib/types.ts`: `LedgerEntrySchema`, `TransitionRecordSchema`, `HarnessResultSchema`, `CheckResultSchema`, `ParsedErrorSchema`
- [ ] New hook: `useLedger()` — poll or SSE-triggered refresh of ledger data
- [ ] New hook: `useHarnessResults()` — poll harness result file
- [ ] Framework change: persist harness results to `.planning/harness-result.json`

### D2: Dashboard Overview Page (Real Data)

- [ ] Add ledger-backed metrics to `OverviewCards` (total transitions, harness status)
- [ ] Session info section (session ID, start time, branch, ticket)
- [ ] Harness status mini-card (pass/fail, error count)
- [ ] Wire real data through existing `useWorkflowState()` + new `useLedger()`

### D3: Workflow State Machine Page

- [ ] State diagram component (SVG or div-based, 13 states, arrows for valid transitions)
- [ ] Current state highlight + allowed events display
- [ ] Transition log table from ledger (timestamp, from->to, event, context summary)
- [ ] Context panel showing key fields (complexity, oversight, phase, session)

### D4: Harness/Verification Results Page

- [ ] Check result cards (name, status badge, error/warning count, duration)
- [ ] Error/warning list with expandable details (file, line, message, code)
- [ ] Middleware metadata display (pipeline timing, status)
- [ ] Fix iteration tracker (current attempt / max attempts)

### D5: SSE Event Stream Integration Tests

- [ ] Test: `insertEvent()` + `broadcastEvent()` — verify store + broadcast mechanics
- [ ] Test: POST `/api/events` returns stored event with id
- [ ] Test: `/api/events-query` filters work correctly (session_id, event_type, limit, since_id)
- [ ] Test: `/api/ledger` route reads and filters JSONL correctly
- [ ] Test: `/api/harness-results` returns parsed harness result or empty default
- [ ] Test: observer-emitter integration (verify event shape matches ObserverEventSchema)

---

## 9. File Inventory

### Files to Create (Observer)

| File                                          | Purpose                           |
| --------------------------------------------- | --------------------------------- |
| `src/app/api/ledger/route.ts`                 | New API route for session ledger  |
| `src/app/api/harness-results/route.ts`        | New API route for harness results |
| `src/hooks/use-ledger.ts`                     | Hook for ledger data              |
| `src/hooks/use-harness-results.ts`            | Hook for harness results          |
| `src/components/workflow/state-diagram.tsx`   | State machine visualization       |
| `src/components/workflow/transition-log.tsx`  | Transition history table          |
| `src/components/workflow/context-panel.tsx`   | Current context display           |
| `src/components/harness/check-card.tsx`       | Individual check result card      |
| `src/components/harness/error-list.tsx`       | Parsed error list                 |
| `src/components/harness/middleware-panel.tsx` | Middleware metadata               |
| `__tests__/api/events.test.ts`                | SSE and events API tests          |
| `__tests__/api/ledger.test.ts`                | Ledger route tests                |
| `__tests__/api/harness-results.test.ts`       | Harness results route tests       |

### Files to Modify (Observer)

| File                                          | Change                                                                             |
| --------------------------------------------- | ---------------------------------------------------------------------------------- |
| `src/lib/types.ts`                            | Add LedgerEntry, TransitionRecord, HarnessResult, CheckResult, ParsedError schemas |
| `src/app/workflow/page.tsx`                   | Replace stub with real workflow page                                               |
| `src/app/harness/page.tsx`                    | Replace stub with real harness page                                                |
| `src/app/page.tsx`                            | Enhance with ledger-backed metrics                                                 |
| `src/components/dashboard/overview-cards.tsx` | Add harness status, session info                                                   |

### Files to Modify (Framework)

| File                              | Change                                                    |
| --------------------------------- | --------------------------------------------------------- |
| `src/harness/__helpers/runner.ts` | Write result to `.planning/harness-result.json` after run |

---

## 10. Dependencies and Sequencing

```
D1 (Schema Bridge) ──> D2 (Dashboard) ──> D5 (Tests)
  |                       |
  |                       v
  +──────────────────> D3 (Workflow Page)
  |
  +──────────────────> D4 (Harness Page)
```

D1 must be completed first as D2-D4 all depend on the new API routes and types. D5 can run in parallel with D3/D4 after D1 completes.

Estimated total effort: 8-12 hours of implementation across 5 deliverables.
