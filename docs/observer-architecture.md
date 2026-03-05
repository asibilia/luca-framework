# Luca Observer Architecture Overview

Technical architecture document for the luca-observer dashboard, covering data flow, real-time subscriptions, hooks, component hierarchy, and the relationship to the luca-framework.

## System Overview

Luca Observer is a read-only Next.js 15 dashboard that provides real-time observability into Luca workflow state. It connects to a SpacetimeDB instance via WebSocket and receives live table updates through subscriptions. There are no API routes, no polling, and no SSE — all data flows through SpacetimeDB's real-time subscription protocol.

The observer is a standalone Next.js application within the luca-framework monorepo at `packages/luca-observer/`. It has no runtime dependency on luca-framework — all types come from auto-generated SpacetimeDB module bindings.

## Data Flow

```
Luca Framework (packages/luca-framework/)
├── state/bridge.ts         — workflow state transitions
├── state/persistence.ts    — state load/save
├── state/ledger.ts         — append-only event log
├── state/suspend-checkpoint.ts — phase suspend/resume
└── state/__helpers/observer-emitter.ts — fire-and-forget reducer calls
    |
    | HTTP POST /v1/database/{db}/call/{reducer_name}
    | (fire-and-forget — errors silently swallowed)
    v
SpacetimeDB (packages/luca-spacetime/spacetimedb/)
├── 18 tables (workflow_state, observer_events, metrics, etc.)
├── 21 reducers (ingest_event, update_workflow_state, etc.)
└── WebSocket subscription protocol
    |
    | ws://host/v1/database/{db}/subscribe
    | (real-time table change notifications)
    v
Luca Observer (packages/luca-observer/)
├── module_bindings/     — auto-generated TypeScript client (spacetime generate)
├── hooks/               — React hooks using useTable() from spacetimedb/react
├── components/          — Tremor + Tailwind UI components
└── app/                 — Next.js App Router pages (11 routes)
```

Additional write sources:

- **Shell hooks** (`src/hooks/scripts/`): Emit events via `curl` to SpacetimeDB reducer endpoints
- **Memory bridge** (`src/memory/__helpers/bridge.ts`): Syncs BRAIN/MEMORY/WORKING/PROCEDURES to SpacetimeDB

## Page Hierarchy

Each page is a client component (`"use client"`) that composes `useTable()` hooks and UI components.

| Page       | Route         | Primary Tables                    | Key Components                                            |
| ---------- | ------------- | --------------------------------- | --------------------------------------------------------- |
| Dashboard  | `/`           | workflow_state, metrics, sessions | OverviewCards, RecentEvents, RecentTransitions            |
| Events     | `/events`     | observer_events                   | EventFeed, EventFilters, EventBadge                       |
| Iterations | `/iterations` | iteration_records                 | ConvergenceChart, BudgetGauge, IterationTimeline          |
| Harness    | `/harness`    | harness_results                   | HarnessSummaryBanner, CheckResultCard, ParsedErrorList    |
| Plan       | `/plan`       | session_plans                     | SessionPlanOverview, WSJFScoreTable, QualityZoneIndicator |
| Memory     | `/memory`     | memory_files                      | BrainPanel, MemoryEntries, WorkingSections                |
| Tribunal   | `/tribunal`   | tribunal_results                  | TribunalSummaryBanner, FindingsTable, RebuttalsPanel      |
| Cost       | `/cost`       | cost_tracking, token_usage        | CostBreakdown, TokenUsageTrends                           |
| Decisions  | `/decisions`  | decision_logs                     | DecisionTrail, DecisionCard                               |
| Context    | `/context`    | context_snapshots                 | ContextSnapshotViewer                                     |
| Notes      | `/notes`      | notes                             | NotesList, NoteCard                                       |

## Real-Time Data Architecture

### SpacetimeDB WebSocket Subscriptions

All data flows through SpacetimeDB's subscription protocol — no polling, no SSE, no REST API routes:

1. **Client connects**: The root layout wraps all pages in `<SpacetimeDBProvider>` with a memoized `DbConnection.builder()`. On mount, a WebSocket connection opens to `ws://{host}/v1/database/{db}/subscribe`.

2. **Subscription registered**: The provider calls `subscriptionBuilder().subscribeToAll()`, subscribing to all public tables.

3. **Data arrives**: SpacetimeDB pushes the full initial state of all tables, then sends incremental updates as reducers modify table rows.

4. **Hooks receive updates**: Each `useTable(tables.tableName)` hook returns `[rows, isLoading]`. When SpacetimeDB pushes a change, the hook triggers a React re-render with the updated data.

5. **No client-side caching**: The SpacetimeDB client SDK maintains an in-memory replica of all subscribed tables. Hooks read directly from this replica.

### React Hooks

All hooks follow the same pattern using `useTable()` from `spacetimedb/react`:

| Hook                      | Table                 | Returns                          |
| ------------------------- | --------------------- | -------------------------------- |
| `useWorkflowState()`      | `workflow_state`      | Current state, phase, complexity |
| `useObserverEvents()`     | `observer_events`     | Filtered, sorted event list      |
| `useIterationRecords()`   | `iteration_records`   | Per-iteration data for charts    |
| `useMetrics()`            | `metrics`             | Aggregated session metrics       |
| `useHarnessResults()`     | `harness_results`     | Verification pass/fail data      |
| `useTribunalResults()`    | `tribunal_results`    | Debate findings                  |
| `useMemoryFiles()`        | `memory_files`        | Memory tier contents             |
| `useCostTracking()`       | `cost_tracking`       | Session cost data                |
| `useTokenUsage()`         | `token_usage`         | Per-call token breakdown         |
| `useToolCalls()`          | `tool_calls`          | Tool invocation log              |
| `useDecisionLogs()`       | `decision_logs`       | Decision audit trail             |
| `useSessionPlans()`       | `session_plans`       | Plan items                       |
| `useContextSnapshots()`   | `context_snapshots`   | Context window data              |
| `useLedgerEntries()`      | `ledger_entries`      | State transition log             |
| `useSuspendCheckpoints()` | `suspend_checkpoints` | Checkpoint data                  |
| `useNotes()`              | `notes`               | Notes list                       |

Each hook returns `[rows, isLoading]` and automatically re-renders when SpacetimeDB pushes table updates.

## SpacetimeDB Module

### Tables (18)

| Table                 | Purpose                                | Key Fields                                                      |
| --------------------- | -------------------------------------- | --------------------------------------------------------------- |
| `sessions`            | Active workflow sessions               | sessionId, ticketId, branch, startedAt                          |
| `workflow_state`      | Current workflow state (singleton-ish) | workflowState, currentPhase, complexity, oversight, contextJson |
| `workflow_config`     | Workflow configuration                 | configJson                                                      |
| `observer_events`     | Raw event feed                         | eventType, source, payload, timestamp                           |
| `iteration_records`   | Per-iteration convergence data         | phaseId, iteration, qualityScore, tokensUsed                    |
| `metrics`             | Aggregated session metrics             | metricsJson                                                     |
| `harness_results`     | Verification harness output            | phaseId, passed, resultJson                                     |
| `tribunal_results`    | Debate/tribunal findings               | phaseId, resultJson                                             |
| `decision_logs`       | Decision audit trail                   | decisionType, description, rationale, outcome                   |
| `token_usage`         | Per-call token tracking                | model, inputTokens, outputTokens, cost                          |
| `tool_calls`          | Tool invocation log                    | toolName, args, result, durationMs                              |
| `cost_tracking`       | Session cost aggregation               | sessionId, totalCost, totalTokens                               |
| `memory_files`        | Memory tier contents                   | brainJson, memoryJson, workingJson, proceduresJson              |
| `session_plans`       | WSJF-scored plan items                 | planJson                                                        |
| `context_snapshots`   | Context window snapshots               | snapshotJson                                                    |
| `ledger_entries`      | Append-only state transition log       | sessionId, sequenceNumber, entryType, entryJson                 |
| `suspend_checkpoints` | Phase suspend/resume data              | phaseId, checkpointJson                                         |
| `notes`               | Structured notes                       | title, content, status                                          |

### Reducers (21)

| Reducer                   | Purpose                           |
| ------------------------- | --------------------------------- |
| `ingest_event`            | Ingest raw workflow events        |
| `update_workflow_state`   | Update workflow state             |
| `update_workflow_config`  | Update workflow configuration     |
| `append_iteration_record` | Add iteration convergence data    |
| `update_metrics`          | Update aggregated metrics         |
| `update_harness_result`   | Store harness verification result |
| `update_tribunal_result`  | Store tribunal debate result      |
| `update_cost`             | Update session cost tracking      |
| `log_token_usage`         | Log per-call token usage          |
| `log_tool_call`           | Log tool invocations              |
| `update_memory_files`     | Sync memory tier contents         |
| `snapshot_context`        | Store context window snapshot     |
| `update_session_plan`     | Update session plan               |
| `append_ledger_entry`     | Append to audit log               |
| `save_checkpoint`         | Save phase checkpoint             |
| `delete_checkpoint`       | Delete phase checkpoint           |
| `log_decision`            | Log decision with rationale       |
| `create_note`             | Create a note                     |
| `complete_note`           | Mark a note as done               |
| `export_to_json`          | Export data as JSON               |
| `export_to_md`            | Export data as markdown           |

## Component Design Patterns

### Layout System

The root layout (`app/layout.tsx`) defines a fixed sidebar + header shell wrapped in `<SpacetimeDBProvider>`:

- `Sidebar` (`components/layout/sidebar.tsx`): Collapsible navigation with page links.
- `Header` (`components/layout/header.tsx`): Top bar with session selector and connection status.
- `PageContainer` (`components/layout/page-container.tsx`): Standard page wrapper with title, subtitle, and optional action slot.

### Design Language

- **font-mono throughout**: All text uses monospace fonts for a terminal/developer aesthetic.
- **Tremor components**: Charts, metrics cards, and data visualizations from the Tremor library.
- **CSS custom properties**: Colors are defined as CSS variables enabling theme switching.
- **Card-based layout**: Data sections are wrapped in styled cards with consistent border and padding.
- **Grid layouts**: Pages use responsive grid layouts for side-by-side panels.
- **Empty states**: All pages handle missing data with styled placeholder messages.
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
- **Type generation**: All types come from auto-generated SpacetimeDB module bindings (`module_bindings/`), not manually mirrored schemas.

### Communication Contract

The observer and framework communicate exclusively through **SpacetimeDB**:

1. **Writes**: The framework calls SpacetimeDB reducers via HTTP POST (fire-and-forget). Shell hooks also call reducers via `curl`.
2. **Reads**: The observer subscribes to SpacetimeDB tables via WebSocket. Table changes are pushed automatically.
3. **No direct communication**: The observer never reads from `.planning/` files. The framework never communicates directly with the observer.

### Connection Configuration

**File**: `packages/luca-observer/lib/spacetimedb-config.ts`

| Variable                         | Default               | Purpose              |
| -------------------------------- | --------------------- | -------------------- |
| `NEXT_PUBLIC_SPACETIMEDB_URI`    | `ws://localhost:3000` | WebSocket URI        |
| `NEXT_PUBLIC_SPACETIMEDB_MODULE` | `luca-observer`       | Module/database name |

## Directory Structure

```
packages/luca-observer/
├── app/                        # Next.js App Router pages
│   ├── layout.tsx              # Root layout (SpacetimeDBProvider + sidebar + header)
│   ├── providers.tsx           # SpacetimeDB connection provider
│   ├── globals.css             # Generated Tailwind CSS (do not edit)
│   ├── page.tsx                # Dashboard (/)
│   ├── events/page.tsx         # Events (/events)
│   ├── iterations/page.tsx     # Iterations (/iterations)
│   ├── harness/page.tsx        # Harness (/harness)
│   ├── plan/page.tsx           # Plan (/plan)
│   ├── memory/page.tsx         # Memory (/memory)
│   ├── tribunal/page.tsx       # Tribunal (/tribunal)
│   ├── cost/page.tsx           # Cost (/cost)
│   ├── decisions/page.tsx      # Decisions (/decisions)
│   ├── context/page.tsx        # Context (/context)
│   └── notes/page.tsx          # Notes (/notes)
├── components/                 # React UI components (organized by page)
│   ├── layout/                 # Sidebar, Header, PageContainer, etc.
│   ├── dashboard/              # OverviewCards, RecentEvents, RecentTransitions
│   ├── iteration/              # ConvergenceChart, BudgetGauge, ErrorClassification
│   ├── harness/                # HarnessSummaryBanner, CheckResultCard, ParsedErrorList
│   ├── memory/                 # BrainPanel, MemoryEntries, WorkingSections
│   └── shared/                 # StatusIndicator, EventBadge, JsonViewer, LoadingSkeleton
├── hooks/                      # React hooks for SpacetimeDB data
│   ├── use-workflow-state.ts   # useTable(tables.workflowState)
│   ├── use-observer-events.ts  # useTable(tables.observerEvents)
│   ├── use-iteration-records.ts # useTable(tables.iterationRecords)
│   ├── use-metrics.ts          # useTable(tables.metrics)
│   ├── use-harness-results.ts  # useTable(tables.harnessResults)
│   ├── use-tribunal-results.ts # useTable(tables.tribunalResults)
│   ├── use-memory-files.ts     # useTable(tables.memoryFiles)
│   ├── use-cost-tracking.ts    # useTable(tables.costTracking)
│   ├── use-token-usage.ts      # useTable(tables.tokenUsage)
│   ├── use-tool-calls.ts       # useTable(tables.toolCalls)
│   ├── use-decision-logs.ts    # useTable(tables.decisionLogs)
│   ├── use-session-plans.ts    # useTable(tables.sessionPlans)
│   ├── use-context-snapshots.ts # useTable(tables.contextSnapshots)
│   ├── use-ledger-entries.ts   # useTable(tables.ledgerEntries)
│   ├── use-suspend-checkpoints.ts # useTable(tables.suspendCheckpoints)
│   └── use-notes.ts            # useTable(tables.notes)
├── lib/                        # Core libraries
│   ├── spacetimedb-config.ts   # SpacetimeDB connection config
│   └── constants.ts            # Event types, workflow states, nav items, port
├── module_bindings/            # Auto-generated SpacetimeDB client (DO NOT EDIT)
│   ├── index.ts                # DbConnection, tables, reducers exports
│   ├── types/                  # Generated TypeScript types
│   └── *_table.ts, *_reducer.ts # Per-table and per-reducer type definitions
├── stores/                     # Jotai atoms for client-side UI state
│   ├── sidebar.ts              # Sidebar collapsed state
│   ├── session.ts              # Active session filter
│   ├── filters.ts              # Event type and search filters
│   └── theme.ts                # Dark/light theme preference
├── tailwind/
│   └── base.css                # Tailwind source (input to CSS build)
├── next.config.ts              # Next.js configuration
├── tsconfig.json               # TypeScript config (paths: ~/* -> ./*)
└── package.json                # Scripts, dependencies
```
