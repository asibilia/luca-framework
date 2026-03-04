# Luca Observer Architecture Overview

Technical architecture document for the luca-observer dashboard, covering data flow, component hierarchy, API routes, hooks, state management, and the relationship to the luca-framework.

## System Overview

Luca Observer is a read-only Next.js 15 dashboard that provides real-time observability into Luca workflow state. It reads structured data from a project's `.planning/` directory and streams updates to the browser via Server-Sent Events (SSE) and periodic polling.

The observer is a standalone Next.js application within the luca-framework monorepo at `packages/luca-observer/`. It has no runtime dependency on luca-framework -- all types are mirrored locally to maintain package isolation.

## Data Flow

```
Luca Hook Scripts (src/hooks/scripts/)
|
| emit events via HTTP POST to /api/events
| write files to .planning/ (ledger, state, checkpoints)
v
.planning/ Directory (project root)
|--- STATE.md              (workflow state: phase, complexity, branch)
|--- state.json            (typed state machine snapshot)
|--- session-ledger.jsonl  (state transition event log)
|--- harness-result.json   (latest verification result)
|--- metrics.json          (aggregated session metrics)
|--- session-plan.json     (WSJF-scored plan items)
|--- tribunal-result.json  (debate findings and rebuttals)
|--- BRAIN.md              (project identity)
|--- MEMORY.md             (long-term learnings)
|--- WORKING.md            (session working memory)
|--- checkpoints/
|    |--- *.json           (iteration convergence records)
|--- notes/
|    |--- *.md             (pending developer notes)
|    |--- done/
|         |--- *.md        (consumed developer notes)
v
Observer API Routes (packages/luca-observer/app/api/)
|
| file-watcher.ts: reads and parses .planning/ files
| db.ts: stores ingested events in-memory
| sse.ts: broadcasts events to connected clients
v
React Hooks (packages/luca-observer/hooks/)
|
| polling hooks: useWorkflowState, useLedger, useHarnessResult, etc.
| SSE hook: useEventStream (real-time event feed)
v
UI Components (packages/luca-observer/components/)
|
| layout/: sidebar, header, page-container
| dashboard/: overview-cards, recent-events, recent-transitions
| workflow/: state-diagram, transition-log, workflow-context-panel
| iteration/: convergence-chart, budget-gauge, error-classification
| harness/: harness-summary-banner, check-result-card, parsed-error-list
| planning/: session-plan-overview, wsjf-score-table, quality-zone-indicator
| memory/: brain-panel, memory-entries, working-sections, context-usage-bar
| tribunal/: tribunal-summary-banner, findings-table, disagreements, rebuttals
| agents/: agent-scorecard-table, agent-activity-log, agent-registry-panel
| shared/: status-indicator, event-badge, json-viewer, loading-skeleton
v
Pages (packages/luca-observer/app/*/page.tsx)
```

## Page Hierarchy

Each page is a client component (`"use client"`) that composes data hooks and UI components.

| Page       | Route         | Components                                                                     | Hooks                       | API Routes               |
| ---------- | ------------- | ------------------------------------------------------------------------------ | --------------------------- | ------------------------ |
| Dashboard  | `/`           | OverviewCards, RecentEvents, RecentTransitions                                 | useEventStream, useLedger   | /api/stream, /api/ledger |
| Workflow   | `/workflow`   | StateDiagram, TransitionLog, WorkflowContextPanel                              | useWorkflowState, useLedger | /api/state, /api/ledger  |
| Iterations | `/iterations` | ConvergenceChart, BudgetGauge, ErrorClassificationBreakdown, IterationTimeline | useIterationHistory         | /api/iterations          |
| Harness    | `/harness`    | HarnessSummaryBanner, CheckResultCard, ParsedErrorList                         | useHarnessResult            | /api/harness             |
| Planning   | `/planning`   | SessionPlanOverview, WSJFScoreTable, QualityZoneIndicator                      | usePlanning                 | /api/planning            |
| Memory     | `/memory`     | BrainPanel, MemoryEntries, WorkingSections, ContextUsageBar                    | useMemory                   | /api/memory              |
| Tribunal   | `/tribunal`   | TribunalSummaryBanner, FindingsTable, DisagreementsPanel, RebuttalTimeline     | useTribunal                 | /api/tribunal            |
| Agents     | `/agents`     | AgentScorecardTable, AgentActivityLog, AgentRegistryPanel                      | useAgentActivity            | /api/agents              |
| Notes      | `/notes`      | (inline in page.tsx)                                                           | useEventStream              | /api/notes               |

## API Route Architecture

All API routes live in `packages/luca-observer/app/api/`. Each route is a Next.js Route Handler with `export const dynamic = "force-dynamic"` to disable caching.

### Data Sources

Routes read data from two sources:

1. **File system** (via `lib/file-watcher.ts`): Most routes read JSON or markdown files from `.planning/`. The `file-watcher` module provides typed reader functions (`readWorkflowState`, `readLedgerEntries`, `readHarnessResult`, etc.) that validate data with Zod schemas on read.

2. **In-memory store** (via `lib/db.ts`): The events and agents routes read from an in-memory event store. Events are ingested via `POST /api/events` and stored in a globalThis-backed array that survives Next.js HMR.

### Validation

All file-based routes use `safeParse()` from Zod to validate data before returning it. Invalid data is silently dropped (for JSONL entries) or returns null (for single-file reads). This prevents malformed `.planning/` files from crashing the dashboard.

### Response Conventions

- All responses use `snake_case` field names per the project's API conventions
- Success responses return JSON with a 200 status
- Error responses return `{ error: "error_code_string" }` with a 500 status
- List endpoints include a `total_count` field alongside the data array

### Route Reference

| Route               | Method | Data Source                                     | Description                                                                                  |
| ------------------- | ------ | ----------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `/api/events`       | POST   | In-memory store                                 | Ingest events from hooks; validates with ObserverEventSchema, stores, and broadcasts via SSE |
| `/api/events-query` | GET    | In-memory store                                 | Query stored events with session_id, event_type, limit, offset, since_id filters             |
| `/api/state`        | GET    | `.planning/STATE.md`                            | Read and parse workflow state into WorkflowSnapshot                                          |
| `/api/ledger`       | GET    | `.planning/session-ledger.jsonl`                | Read ledger entries with session_id, event_type, tail, limit filters                         |
| `/api/harness`      | GET    | `.planning/harness-result.json`                 | Read latest harness verification result                                                      |
| `/api/iterations`   | GET    | `.planning/checkpoints/*.json`                  | Read all iteration checkpoints, sorted by iteration number                                   |
| `/api/planning`     | GET    | `.planning/session-plan.json`                   | Read WSJF-scored session plan                                                                |
| `/api/tribunal`     | GET    | `.planning/tribunal-result.json`                | Read latest tribunal debate result                                                           |
| `/api/agents`       | GET    | In-memory store                                 | Aggregate agent activity from event store by agent_name                                      |
| `/api/memory`       | GET    | `.planning/BRAIN.md`, `MEMORY.md`, `WORKING.md` | Read raw markdown content of memory files                                                    |
| `/api/metrics`      | GET    | `.planning/metrics.json`                        | Read aggregated session metrics                                                              |
| `/api/sessions`     | GET    | In-memory store                                 | List all tracked sessions, newest first                                                      |
| `/api/stream`       | GET    | SSE broadcaster                                 | Open Server-Sent Events connection for real-time event feed                                  |
| `/api/notes`        | GET    | `.planning/notes/`                              | Read pending and done developer notes with metadata                                          |
| `/api/notes`        | POST   | `.planning/notes/`                              | Create a new developer note file on disk                                                     |

### Project Directory Targeting

File-based routes accept an optional `?dir=<path>` query parameter to read from a different project directory. The `resolveProjectDir()` function validates the path to prevent traversal outside the working directory boundary.

## State Management

Client-side state is managed with [Jotai](https://jotai.org/) atoms, stored in `packages/luca-observer/stores/`:

| Store        | Atoms                            | Purpose                                |
| ------------ | -------------------------------- | -------------------------------------- |
| `sidebar.ts` | Sidebar collapsed state          | Controls sidebar width/visibility      |
| `session.ts` | Active session ID                | Filters events by session across pages |
| `filters.ts` | Event type filters, search query | Controls event list filtering          |
| `theme.ts`   | Dark/light theme preference      | Theme toggle (defaults to dark)        |

Jotai was chosen for its minimal API, atomic granularity, and compatibility with React Server Components (atoms are only used in client components).

## Real-Time Updates

### SSE Stream Architecture

The real-time event feed uses Server-Sent Events (SSE):

1. **Client connects**: The `useEventStream` hook opens an `EventSource` to `GET /api/stream`.

2. **Server registers client**: The route handler creates a `ReadableStream`, registers its controller in a global `Set<SSEController>` (via `lib/sse.ts`), and sends an initial heartbeat.

3. **Events are ingested**: When `POST /api/events` receives an event, it stores it in the in-memory DB and calls `broadcastEvent()`.

4. **Broadcast to all clients**: `broadcastEvent()` iterates over all registered SSE controllers and enqueues the JSON-encoded event as an SSE `data:` frame. Disconnected clients are automatically removed.

5. **Client receives**: The `useEventStream` hook parses incoming SSE messages and appends them to a React state array, which triggers re-renders in the Dashboard and Notes pages.

### Polling Hooks

Pages that display file-based data use polling hooks with configurable intervals:

| Hook                  | API Route         | Default Interval | Purpose                       |
| --------------------- | ----------------- | ---------------- | ----------------------------- |
| `useWorkflowState`    | `/api/state`      | 5s               | Workflow state snapshot       |
| `useLedger`           | `/api/ledger`     | 10s              | State transition entries      |
| `useHarnessResult`    | `/api/harness`    | 10s              | Latest harness result         |
| `useIterationHistory` | `/api/iterations` | 10s              | Iteration checkpoints         |
| `usePlanning`         | `/api/planning`   | 15s              | Session plan with WSJF scores |
| `useTribunal`         | `/api/tribunal`   | 15s              | Tribunal debate result        |
| `useAgentActivity`    | `/api/agents`     | 10s              | Agent invocation summaries    |
| `useMemory`           | `/api/memory`     | 15s              | Memory file contents          |
| `useMetrics`          | `/api/metrics`    | 15s              | Aggregated metrics            |

Each hook returns `{ data, loading, error }` (or domain-specific variants) and handles fetch failures silently, retrying on the next interval.

## Component Design Patterns

### Layout System

The root layout (`app/layout.tsx`) defines a fixed sidebar + header shell:

- `Sidebar` (`components/layout/sidebar.tsx`): Collapsible navigation with page links from `lib/constants.ts`. Uses Jotai for collapsed state.
- `Header` (`components/layout/header.tsx`): Top bar with session selector and connection status.
- `PageContainer` (`components/layout/page-container.tsx`): Standard page wrapper with title, subtitle, and optional action slot.

### Design Language

- **font-mono throughout**: All text uses monospace fonts for a terminal/developer aesthetic.
- **CSS custom properties**: Colors are defined as CSS variables (e.g., `--foreground`, `--background`, `--accent`, `--destructive`) enabling theme switching.
- **Card-based layout**: Data sections are wrapped in `rounded-lg border border-border bg-card p-4` cards.
- **Grid layouts**: Pages use responsive `lg:grid-cols-2` or `lg:grid-cols-3` grids for side-by-side panels.
- **Empty states**: All pages handle missing data with styled placeholder messages explaining when data will appear.
- **Dark-first**: The HTML element has `className="dark"` by default.

### Shared Components

| Component         | Location                                 | Purpose                               |
| ----------------- | ---------------------------------------- | ------------------------------------- |
| `StatusIndicator` | `components/shared/status-indicator.tsx` | Colored dot + label for status values |
| `EventBadge`      | `components/shared/event-badge.tsx`      | Color-coded badge for event types     |
| `JsonViewer`      | `components/shared/json-viewer.tsx`      | Collapsible JSON object viewer        |
| `LoadingSkeleton` | `components/shared/loading-skeleton.tsx` | Animated placeholder during loading   |
| `PageError`       | `components/shared/page-error.tsx`       | Error boundary fallback UI            |
| `SectionHeader`   | `components/layout/section-header.tsx`   | Section title with optional actions   |
| `DetailLayout`    | `components/layout/detail-layout.tsx`    | Two-column detail/sidebar layout      |

## Relationship to luca-framework

### Strict Package Isolation

The observer has **zero imports** from `luca-framework` or `luca-state`. This is intentional:

- **Independent deployability**: The observer can be deployed without building the entire monorepo.
- **No circular dependencies**: The framework does not know about the observer; the observer does not depend on the framework.
- **Type mirroring**: All Zod schemas in `lib/types.ts` are local mirrors of their luca-framework counterparts (e.g., `HarnessResultSnapshotSchema` mirrors `HarnessResultSchema`). These schemas are kept in sync manually when the framework schemas change.

### Communication Contract

The observer and framework communicate through two mechanisms:

1. **File system**: The framework writes to `.planning/` files; the observer reads them. This is the primary data channel.

2. **HTTP**: Luca hooks can optionally POST events to `POST /api/events` for the real-time SSE feed. This is supplementary -- the observer works without it by polling files.

### Type Correspondence

| Observer Schema (lib/types.ts)  | Framework Source                      |
| ------------------------------- | ------------------------------------- |
| `WorkflowSnapshotSchema`        | STATE.md format / state machine       |
| `LedgerEntrySchema`             | `TransitionRecord` in luca-state      |
| `HarnessResultSnapshotSchema`   | `HarnessResult` in src/harness/       |
| `IterationRecordSnapshotSchema` | `IterationRecord` in src/iteration/   |
| `SessionPlanSnapshotSchema`     | `SessionPlan` in src/planner/         |
| `TribunalResultSnapshotSchema`  | `TribunalResult` in src/harness/      |
| `ObserverEventSchema`           | Custom event schema for SSE ingestion |

## Directory Structure

```
packages/luca-observer/
|--- app/                        # Next.js App Router pages and API routes
|    |--- layout.tsx             # Root layout (sidebar + header shell)
|    |--- providers.tsx          # Jotai Provider wrapper
|    |--- globals.css            # Generated Tailwind CSS (do not edit)
|    |--- page.tsx               # Dashboard (/)
|    |--- workflow/page.tsx      # Workflow (/workflow)
|    |--- iterations/page.tsx    # Iterations (/iterations)
|    |--- harness/page.tsx       # Harness (/harness)
|    |--- planning/page.tsx      # Planning (/planning)
|    |--- memory/page.tsx        # Memory (/memory)
|    |--- tribunal/page.tsx      # Tribunal (/tribunal)
|    |--- agents/page.tsx        # Agents (/agents)
|    |--- notes/page.tsx         # Notes (/notes)
|    |--- api/                   # API Route Handlers
|         |--- events/route.ts
|         |--- events-query/route.ts
|         |--- state/route.ts
|         |--- ledger/route.ts
|         |--- harness/route.ts
|         |--- iterations/route.ts
|         |--- planning/route.ts
|         |--- tribunal/route.ts
|         |--- agents/route.ts
|         |--- memory/route.ts
|         |--- metrics/route.ts
|         |--- sessions/route.ts
|         |--- stream/route.ts
|         |--- notes/route.ts
|--- bin/
|    |--- luca-observer.js       # CLI entry point
|--- components/                 # React UI components (organized by page)
|    |--- layout/                # Sidebar, Header, PageContainer, etc.
|    |--- dashboard/             # OverviewCards, RecentEvents, RecentTransitions
|    |--- workflow/              # StateDiagram, TransitionLog, WorkflowContextPanel
|    |--- iteration/             # ConvergenceChart, BudgetGauge, ErrorClassification
|    |--- harness/               # HarnessSummaryBanner, CheckResultCard, ParsedErrorList
|    |--- planning/              # SessionPlanOverview, WSJFScoreTable, QualityZone
|    |--- memory/                # BrainPanel, MemoryEntries, WorkingSections, ContextUsageBar
|    |--- tribunal/              # TribunalSummaryBanner, FindingsTable, Disagreements, Rebuttals
|    |--- agents/                # AgentScorecardTable, AgentActivityLog, AgentRegistryPanel
|    |--- shared/                # StatusIndicator, EventBadge, JsonViewer, LoadingSkeleton
|--- hooks/                      # React hooks for data fetching
|    |--- use-event-stream.ts    # SSE real-time event feed
|    |--- use-workflow-state.ts  # Polls /api/state
|    |--- use-ledger.ts          # Polls /api/ledger
|    |--- use-harness-result.ts  # Polls /api/harness
|    |--- use-iteration-history.ts # Polls /api/iterations
|    |--- use-planning.ts        # Polls /api/planning
|    |--- use-tribunal.ts        # Polls /api/tribunal
|    |--- use-agent-activity.ts  # Polls /api/agents
|    |--- use-memory.ts          # Polls /api/memory
|    |--- use-metrics.ts         # Polls /api/metrics
|    |--- use-media-query.ts     # Responsive breakpoint hook
|--- lib/                        # Core libraries
|    |--- types.ts               # Zod schemas and inferred types (local mirrors)
|    |--- db.ts                  # In-memory event store (globalThis-backed)
|    |--- sse.ts                 # SSE client registry and broadcaster
|    |--- file-watcher.ts        # .planning/ file readers with Zod validation
|    |--- constants.ts           # Event types, workflow states, nav items, port
|--- stores/                     # Jotai atoms for client-side state
|    |--- sidebar.ts             # Sidebar collapsed state
|    |--- session.ts             # Active session filter
|    |--- filters.ts             # Event type and search filters
|    |--- theme.ts               # Dark/light theme preference
|--- tailwind/
|    |--- base.css               # Tailwind source (input to CSS build)
|--- next.config.ts              # Next.js configuration
|--- tsconfig.json               # TypeScript config (paths: ~/* -> ./*)
|--- package.json                # Scripts, dependencies, bin entry
```
