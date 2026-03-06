# Luca Framework — Comprehensive Architecture Overview

> **Purpose**: End-to-end reference for agents verifying, testing, and improving the Luca platform.
> Covers every package, data flow, integration point, and the SpacetimeDB real-time observability layer.

---

## 1. Vision

Luca is an **agentic development platform** designed to be installed into any application via npm and used with Claude Code. It provides:

- **Context management** — structured memory tiers (BRAIN/MEMORY/WORKING/PROCEDURES) that prevent context rot and improve accuracy
- **Workflow orchestration** — spec-driven development with complexity gating, verification harnesses, and cognitive pre-flight
- **Cost optimization** — token budgets, compression, and context-tier resolution to minimize API spend
- **Real-time observability** — a live dashboard (luca-observer) backed by SpacetimeDB so users always know what their agent team is doing

---

## 2. Repository Structure

```
luca-framework/                         # Monorepo root
├── packages/
│   ├── luca-framework/                 # Core framework (state machine, bridges, ledger)
│   │   └── src/state/                  # XState v5 state machine + bridge CLI
│   │       ├── __helpers/
│   │       │   ├── spacetimedb-client.ts   # HTTP SQL query client for SpacetimeDB reads
│   │       │   └── observer-emitter.ts     # Fire-and-forget reducer calls for SpacetimeDB writes
│   │       ├── persistence.ts              # State load/save (SpacetimeDB-primary, JSON fallback)
│   │       ├── bridge.ts                   # CLI bridge with 15 subcommands
│   │       ├── ledger.ts                   # Append-only event ledger
│   │       ├── suspend-checkpoint.ts       # Phase suspend/resume checkpoints
│   │       └── machine.ts                  # XState v5 state machine definition
│   │
│   ├── luca-observer/                  # Next.js 15 real-time dashboard
│   │   ├── app/                        # App Router pages (11 routes)
│   │   ├── hooks/                      # React hooks (16 hooks using useTable())
│   │   ├── components/                 # UI components (Tremor + Tailwind)
│   │   ├── lib/spacetimedb-config.ts   # Connection config
│   │   └── module_bindings/            # Auto-generated SpacetimeDB TypeScript client
│   │
│   └── luca-spacetime/                 # SpacetimeDB module + config
│       ├── spacetimedb/
│       │   └── src/
│       │       ├── schema.ts           # 18 tables with indexes
│       │       └── index.ts            # 21 reducers + lifecycle hooks
│       ├── spacetime.json              # Server config (maincloud)
│       └── spacetime.local.json        # Local dev config
│
├── src/                                # Domain source (13 domains across 4 tiers)
│   ├── agents/                         # T2 Entity — agent definitions
│   ├── skills/                         # T2 Entity — skill definitions
│   ├── rules/                          # T2 Entity — rule definitions
│   ├── memory/                         # T1 Core — memory system
│   │   └── __helpers/bridge.ts         # Memory bridge (SpacetimeDB reads/writes)
│   ├── context/                        # T1 Core — context tier resolution
│   ├── planner/                        # T1 Core — cost model, scheduler, WSJF scoring
│   ├── iteration/                      # T1 Core — budget, convergence, checkpoint
│   ├── harness/                        # T1 Core — verification runner
│   ├── observability/                  # T1 Core — agent scorecard engine
│   ├── shared/                         # T0 Foundation — cross-cutting utilities
│   ├── complexity/                     # T0 Foundation — complexity gating matrix
│   ├── compilers/                      # T3 Build — TS → markdown compilers
│   └── hooks/                          # T3 Build — hook registry + generators
│
├── .planning/                          # Per-project workflow state
│   ├── STATE.md                        # Human-readable state snapshot
│   ├── state.json                      # Typed state machine snapshot
│   ├── config.json                     # Workflow configuration
│   ├── ROADMAP.md                      # Phase roadmap
│   ├── BRAIN.md                        # Project identity
│   ├── MEMORY.md                       # Long-term learnings
│   └── WORKING.md                      # Session working memory
│
└── .claude/                            # Generated output (never edit directly)
    ├── agents/                         # Compiled agent definitions
    ├── skills/                         # Compiled skill definitions
    ├── rules/                          # Compiled rule definitions
    └── hooks/                          # Compiled hook scripts
```

### Dependency Tiers

| Tier          | Domains                                                     | Role                                        |
| ------------- | ----------------------------------------------------------- | ------------------------------------------- |
| T0 Foundation | shared, complexity                                          | Imported by many, imports nothing from src/ |
| T1 Core       | context, planner, harness, iteration, memory, observability | Import T0 only                              |
| T2 Entity     | agents, skills, rules                                       | Import T0-T1; parallel, never cross-import  |
| T3 Build      | compilers, hooks                                            | Terminal; imported by nothing in src/       |

---

## 3. State Machine

### XState v5 Definition

**File**: `packages/luca-framework/src/state/machine.ts`

The workflow state machine has **12 top-level states**:

```
idle → initializing → planning → ready → executing → verifying
  → reviewing → completing → learning → done
  (+ suspended, failed as terminal/recovery states)
```

A **phase actor** child machine manages individual phase lifecycle:

```
phase:idle → phase:pre-flight → phase:executing → phase:verifying
  → phase:reviewing → phase:complete
```

### State Persistence

**File**: `packages/luca-framework/src/state/persistence.ts`

| Function               | Read Source                                                  | Write Target                                                            |
| ---------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------- |
| `loadPersistedActor()` | SpacetimeDB `workflow_state` table → fallback `state.json`   | —                                                                       |
| `persistActor()`       | —                                                            | SpacetimeDB `update_workflow_state` reducer + `state.json` + `STATE.md` |
| `createFreshActor()`   | SpacetimeDB `workflow_config` table → fallback `config.json` | —                                                                       |
| `stateExists()`        | SpacetimeDB query → fallback file check                      | —                                                                       |

### Bridge CLI

**File**: `packages/luca-framework/src/state/bridge.ts`

The bridge provides a shell-friendly interface with **15 subcommands**:

**Read commands**: `read-status`, `read-complexity`, `read-oversight`, `read-phase`, `read-field`, `read-ledger`
**Write commands**: `set-field`, `transition` (event dispatch with `--event=TYPE`)
**Lifecycle**: `ensure-init`, `snapshot`, `gate-check`, `suspend`, `resume-phase`
**Observability**: `emit-event`, `emit-context-snapshot`

All reads query SpacetimeDB first, fall back to local JSON. All writes use dual-write (SpacetimeDB reducer + local JSON).

---

## 4. Memory System

### Four Tiers

| Tier          | File                      | Purpose                                  | Persistence |
| ------------- | ------------------------- | ---------------------------------------- | ----------- |
| BRAIN.md      | `.planning/BRAIN.md`      | Project identity, stack, conventions     | Permanent   |
| MEMORY.md     | `.planning/MEMORY.md`     | Long-term learnings, patterns, decisions | Permanent   |
| WORKING.md    | `.planning/WORKING.md`    | Session context, hypotheses, findings    | Per-session |
| PROCEDURES.md | `.planning/PROCEDURES.md` | Operational procedures, runbooks         | Permanent   |

### Memory Bridge

**File**: `src/memory/__helpers/bridge.ts`

The memory bridge manages read/write for all four tiers with SpacetimeDB integration:

| Operation       | SpacetimeDB Path                                             | Local Fallback                        |
| --------------- | ------------------------------------------------------------ | ------------------------------------- |
| Read BRAIN      | SQL: `SELECT brain_json FROM memory_files WHERE id = 1`      | `Bun.file('.planning/BRAIN.md')`      |
| Read MEMORY     | SQL: `SELECT memory_json FROM memory_files WHERE id = 1`     | `Bun.file('.planning/MEMORY.md')`     |
| Read WORKING    | SQL: `SELECT working_json FROM memory_files WHERE id = 1`    | `Bun.file('.planning/WORKING.md')`    |
| Read PROCEDURES | SQL: `SELECT procedures_json FROM memory_files WHERE id = 1` | `Bun.file('.planning/PROCEDURES.md')` |
| Write any tier  | Reducer: `update_memory_files` + local file write            | Local file only                       |

### Cognitive Pre-Flight

Before major operations, Luca loads:

1. BRAIN.md → project conventions
2. Selective recall from MEMORY.md → relevant patterns, decisions, pitfalls
3. Initialize WORKING.md → session context
4. Generate intuition flags → RISK, CAUTION, OPPORTUNITY, UNKNOWN

### Context Pruning and Auto-Compaction

Context pruning and auto-compaction live within the memory domain (`src/memory/`) because they are fundamentally memory management operations:

- **Context pruning** (`src/memory/__helpers/context-pruning.ts`): Removes stale content from WORKING.md sections based on configurable retention policies. Activates at the "degrading" quality zone. Pure functions -- caller handles I/O.
- **Auto-compaction** (`src/memory/__helpers/auto-compaction.ts`): Scores sections by age/relevance/size and compacts the lowest-value sections into summaries. Also triggers at the "degrading" zone. Pure functions -- caller handles I/O.

Both modules share schemas defined in `src/memory/__schemas/memory.schemas.ts` (retention policies, pruning events/results, section scores, compaction config/results) and depend on the memory domain's token estimator. This placement is architecturally correct: context pruning manages working memory size and token budgets, which is squarely within the memory domain's responsibility.

---

## 5. Observability Domain

The observability layer spans three architectural components, each serving a distinct role:

### 5.1 `src/observability/` -- Agent Scorecard Engine (T1 Core)

**Files**: `src/observability/__schemas/observability.schemas.ts`, `src/observability/__helpers/scorecard.ts`

A T1 Core domain that tracks per-agent effectiveness metrics:

- **Scorecard entries**: Per-agent telemetry (invocation count, success/failure rates, average duration)
- **Scorecard queries**: Filtering and sorting for model routing decisions (e.g., prefer agents with higher success rates)
- **Scorecard reports**: Formatted output for dashboard display and audit

This domain is consumed by the routing layer to make data-driven agent selection decisions. It reads/writes a local scorecard JSON file and is independent of the SpacetimeDB event flow.

### 5.2 `packages/luca-spacetime/` -- SpacetimeDB Server Module

**Files**: `packages/luca-spacetime/spacetimedb/src/schema.ts` (18 tables), `packages/luca-spacetime/spacetimedb/src/index.ts` (21 reducers), `packages/luca-spacetime/spacetimedb/src/cleanup-schedule.ts`

The persistent state layer. Defines the database schema and reducers that store all workflow telemetry, state, and memory. Acts as the shared backend between the framework (write path via HTTP reducer calls) and the observer dashboard (read path via WebSocket subscriptions).

### 5.3 `packages/luca-observer/` -- Real-Time Dashboard (Next.js 15)

**Files**: 11 App Router pages, 16 React hooks, Tremor + Tailwind UI

A Next.js 15 dashboard that subscribes to SpacetimeDB tables via WebSocket. Renders real-time workflow state, event feeds, iteration convergence, harness results, memory contents, cost tracking, and decision audit trails. No client-side state management -- all data comes from SpacetimeDB subscriptions via `useTable()` hooks.

### 5.4 Event Flow

```
src/ domain code (agents, skills, hooks)
    |
    v  (fire-and-forget HTTP POST to reducers)
packages/luca-spacetime/ (SpacetimeDB tables)
    |
    v  (WebSocket subscription push)
packages/luca-observer/ (React dashboard via useTable() hooks)
```

The `src/observability/` scorecard engine operates independently from this event flow -- it reads/writes a local scorecard JSON file and is queried by the routing layer at decision time.

### 5.5 Relationship to Core Domains

| Component                  | Tier             | Depends On     | Consumed By                                    |
| -------------------------- | ---------------- | -------------- | ---------------------------------------------- |
| `src/observability/`       | T1 Core          | T0 (shared)    | Routing layer, report generation               |
| `packages/luca-spacetime/` | External package | --             | luca-framework (writes), luca-observer (reads) |
| `packages/luca-observer/`  | External package | luca-spacetime | End user (browser)                             |

---

## 6. SpacetimeDB Integration (Detail)

### Module Definition

**Schema**: `packages/luca-spacetime/spacetimedb/src/schema.ts`
**Reducers**: `packages/luca-spacetime/spacetimedb/src/index.ts`

### 18 Tables

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
| `memory_files`        | Memory tier contents                   | brainMd, memoryMd, workingMd, proceduresMd                      |
| `session_plans`       | WSJF-scored plan items                 | planJson                                                        |
| `context_snapshots`   | Context window snapshots               | snapshotJson                                                    |
| `ledger_entries`      | Append-only state transition log       | sessionId, sequenceNumber, entryType, entryJson                 |
| `suspend_checkpoints` | Phase suspend/resume data              | phaseId, checkpointJson                                         |
| `notes`               | Structured notes                       | title, content, status                                          |

### 21 Reducers

**Session lifecycle**: `ingest_event`
**State management**: `update_workflow_state`, `update_workflow_config`
**Iteration tracking**: `append_iteration_record`, `update_metrics`
**Verification**: `update_harness_result`, `update_tribunal_result`
**Cost/tokens**: `update_cost`, `log_token_usage`, `log_tool_call`
**Memory**: `update_memory_files`, `snapshot_context`
**Planning**: `update_session_plan`
**Ledger**: `append_ledger_entry`
**Checkpoints**: `save_checkpoint`, `delete_checkpoint`
**Decisions**: `log_decision`
**Notes**: `create_note`, `complete_note`
**Export**: `export_to_json`, `export_to_md`

### HTTP API Format (SpacetimeDB v2.0)

#### SQL Queries (Reads)

```
POST /v1/database/{db_name}/sql
Content-Type: text/plain
Body: SELECT * FROM workflow_state WHERE id = 1
```

Response format (positional arrays with schema metadata):

```json
[
  {
    "schema": {
      "elements": [
        { "name": { "some": "id" } },
        { "name": { "some": "workflowState" } },
        { "name": { "some": "currentPhase" } }
      ]
    },
    "rows": [[1, "executing", "phase-107"]]
  }
]
```

#### Reducer Calls (Writes)

```
POST /v1/database/{db_name}/call/{reducer_name}
Content-Type: application/json
Body: { "eventType": "phase_started", "source": "bridge", ... }
```

Args are flat JSON — **not** wrapped in `{"args": {...}}`.

### Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     WRITE PATH (Fire-and-Forget)                │
│                                                                 │
│  luca-framework (bridge.ts, persistence.ts, ledger.ts)          │
│  src/memory/__helpers/bridge.ts                                 │
│  .claude/hooks/ (shell scripts via curl)                        │
│       │                                                         │
│       ▼                                                         │
│  observer-emitter.ts → HTTP POST /v1/database/{db}/call/{reducer}│
│       │                                                         │
│       ▼                                                         │
│  SpacetimeDB (18 tables)                                        │
│       │                                                         │
│       ▼  (WebSocket subscription push)                          │
│  luca-observer (module_bindings → useTable() hooks → React UI)  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     READ PATH (SQL + Fallback)                  │
│                                                                 │
│  luca-framework (bridge.ts, persistence.ts, ledger.ts)          │
│  src/memory/__helpers/bridge.ts                                 │
│       │                                                         │
│       ▼                                                         │
│  spacetimedb-client.ts → HTTP POST /v1/database/{db}/sql        │
│       │                                                         │
│       ├─── SUCCESS → parse positional rows → return typed data  │
│       │                                                         │
│       └─── FAILURE → fallback to local JSON/MD files            │
│            (state.json, BRAIN.md, MEMORY.md, etc.)              │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     OBSERVER READ PATH (Real-Time)              │
│                                                                 │
│  luca-observer (browser)                                        │
│       │                                                         │
│       ▼                                                         │
│  SpacetimeDBProvider (WebSocket to ws://host/v1/database/{db})  │
│       │                                                         │
│       ▼                                                         │
│  useTable(tables.workflowState) → [rows, isLoading]             │
│       │                                                         │
│       ▼                                                         │
│  React components render real-time data                         │
└─────────────────────────────────────────────────────────────────┘
```

### Configuration

| Variable                         | Default                 | Purpose                |
| -------------------------------- | ----------------------- | ---------------------- |
| `LUCA_SPACETIMEDB_URL`           | `http://localhost:3000` | SpacetimeDB server URL |
| `LUCA_SPACETIMEDB_DB`            | `luca-observer`         | Database/module name   |
| `NEXT_PUBLIC_SPACETIMEDB_URI`    | `ws://localhost:3000`   | Observer WebSocket URI |
| `NEXT_PUBLIC_SPACETIMEDB_MODULE` | `luca-observer`         | Observer module name   |

### Security

- All SpacetimeDB URLs validated via `isLocalhostUrl()` to prevent SSRF
- Write operations are fire-and-forget (SpacetimeDB is optional, framework never blocks on it)
- No authentication tokens required for local SpacetimeDB

---

## 7. Observer Dashboard (Detail)

### Technology Stack

- **Framework**: Next.js 15 (App Router)
- **UI**: Tremor components + Tailwind CSS
- **Real-time**: SpacetimeDB WebSocket subscriptions via `useTable()` hooks
- **State**: No client state management — all data comes from SpacetimeDB subscriptions

### 11 Route Pages

| Route         | Purpose                                                             | Primary Tables                    |
| ------------- | ------------------------------------------------------------------- | --------------------------------- |
| `/`           | Dashboard overview — workflow state, phase, complexity, key metrics | workflow_state, metrics, sessions |
| `/events`     | Live event feed with filtering                                      | observer_events                   |
| `/iterations` | Per-iteration convergence tracking with charts                      | iteration_records                 |
| `/harness`    | Verification harness results                                        | harness_results                   |
| `/memory`     | BRAIN/MEMORY/WORKING/PROCEDURES viewer                              | memory_files                      |
| `/cost`       | Session cost breakdown, token usage trends                          | cost_tracking, token_usage        |
| `/decisions`  | Decision audit trail with rationale                                 | decision_logs                     |
| `/plan`       | WSJF-scored plan items                                              | session_plans                     |
| `/context`    | Context window snapshots                                            | context_snapshots                 |
| `/tribunal`   | Debate findings and rebuttals                                       | tribunal_results                  |
| `/notes`      | Structured notes                                                    | notes                             |

### 16 React Hooks

All hooks follow the pattern:

```typescript
const [rows, isLoading] = useTable(tables.tableName);
```

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

### Connection Setup

**File**: `packages/luca-observer/lib/spacetimedb-config.ts`

```typescript
export const SPACETIMEDB_URI =
  process.env.NEXT_PUBLIC_SPACETIMEDB_URI ?? "ws://localhost:3000";
export const MODULE_NAME =
  process.env.NEXT_PUBLIC_SPACETIMEDB_MODULE ?? "luca-observer";
```

The root layout wraps all pages in `<SpacetimeDBProvider>` with a memoized `DbConnection.builder()`.

---

## 8. Hook System

### 8 Shell Hooks

**Source**: `src/hooks/scripts/` → compiled to `.claude/hooks/` via `bun run build:all`

| Hook                     | Trigger                 | Purpose                                                    |
| ------------------------ | ----------------------- | ---------------------------------------------------------- |
| `session-start.sh`       | Session start           | Initialize state, load BRAIN.md, start SpacetimeDB session |
| `post-edit-format.sh`    | After file edit         | Auto-format edited files                                   |
| `post-edit-typecheck.sh` | After file edit (async) | Type-check changed file                                    |
| `pre-commit-gate.sh`     | Before git commit       | Run tests + typecheck, block on failure                    |
| `context-monitor.sh`     | On stop                 | Monitor context usage, warn on degradation                 |
| `session-persist.sh`     | Session end             | Persist state, extract learnings                           |
| `observer-event.sh`      | Various                 | Emit events to SpacetimeDB via curl                        |
| `memory-sync.sh`         | After memory write      | Sync memory files to SpacetimeDB                           |

### Hook → SpacetimeDB Integration

Hooks emit events via direct `curl` calls to the SpacetimeDB reducer API:

```bash
curl -s -X POST "http://localhost:3000/v1/database/luca-observer/call/ingest_event" \
  -H "Content-Type: application/json" \
  -d '{"eventType":"phase_started","source":"hook","payload":"{...}","timestamp":"..."}'
```

---

## 9. `/lu` Workflow Pipeline

The unified `/lu` command routes through a 10-step pipeline:

### Step 1: Parse & Route

- Parse user intent from natural language
- `lu-router` agent classifies complexity (TRIVIAL → CRITICAL)
- Route to appropriate sub-workflow

### Step 2: Cognitive Pre-Flight

- Load BRAIN.md (project identity)
- Selective recall from MEMORY.md
- Initialize WORKING.md
- Generate intuition flags (RISK, CAUTION, OPPORTUNITY, UNKNOWN)
- Complexity gating: lite pre-flight for TRIVIAL/SIMPLE, full for MODERATE+

### Step 3: Plan Discovery

- Parse PLAN.md or generate plan from intent
- WSJF scoring (business value, time criticality, risk reduction, job size)
- Group tasks into waves for parallel execution

### Step 4: Phase Execution

- Execute waves in order within each phase
- Each wave can contain parallel tasks
- Track iterations with convergence scoring

### Step 5: Verification Harness

- Run test suite (`bun test`)
- Type-check (`bunx --bun tsc --noEmit`)
- Lint check
- Build check
- Up to 3 fix iterations on failure (complexity-gated)

### Step 6: Agent Verification

- `lu-verifier` agent reviews changes
- Mode scales with complexity: Quick (TRIVIAL/SIMPLE) → Standard (MODERATE) → Full (COMPLEX/CRITICAL)

### Step 7: Code Review (Complexity-Gated)

- Spawns parallel review agents (MODERATE+):
  - `dx-advocate` — developer experience
  - `code-simplifier` — complexity reduction
  - `code-architect` — architectural patterns (COMPLEX+)
  - `tailwind-auditor` — UI consistency (if UI changes)
  - `security-auditor` — security review (if auth changes, always at CRITICAL)

### Step 8: UAT (Complexity-Gated)

- Optional at MODERATE, required at COMPLEX/CRITICAL
- User acceptance testing with defined criteria

### Step 9: Learning Capture

- Extract patterns, decisions, pitfalls from WORKING.md
- Update MEMORY.md with validated learnings
- Complexity-gated: Skip (TRIVIAL), Brief (SIMPLE), Standard (MODERATE), Full (COMPLEX/CRITICAL)

### Step 10: Commit

- Stage changes, generate commit message
- Pre-commit hooks run (tests + typecheck)
- State machine transitions to next phase or done

---

## 10. Configuration System

### Hierarchical Config

**File**: `.planning/config.json`

```json
{
  "workflow": {
    "code_review": true,
    "uat_required": true,
    "harness": { "test": true, "typecheck": true, "lint": true, "build": true },
    "hooks": { "post_edit_typecheck": true, "pre_commit_gate": true }
  },
  "complexity_matrix": {
    /* gating thresholds */
  },
  "gates": { "allow_skip_review": false, "allow_skip_uat": false },
  "autopilot_config": { "enabled": false, "max_phases": 5 }
}
```

### Complexity Gating Matrix

| Step                   | TRIVIAL | SIMPLE | MODERATE | COMPLEX  | CRITICAL |
| ---------------------- | ------- | ------ | -------- | -------- | -------- |
| Cognitive pre-flight   | Lite    | Lite   | Full     | Full     | Full     |
| Research               | Skip    | Skip   | Optional | Required | Required |
| Plan verification      | 0 iter  | 0 iter | 1 iter   | 2 iter   | 3 iter   |
| Harness fix iterations | 1       | 2      | 2        | 2        | 3        |
| Code review agents     | Skip    | Skip   | Run      | Run      | Run      |
| UAT                    | Skip    | Skip   | Optional | Required | Required |
| Learning capture       | Skip    | Brief  | Standard | Full     | Full     |

---

## 11. Ledger System

**File**: `packages/luca-framework/src/state/ledger.ts`

The ledger is an append-only log of state transitions, providing a complete audit trail.

| Operation     | SpacetimeDB Path                                                                  | Local Fallback                   |
| ------------- | --------------------------------------------------------------------------------- | -------------------------------- |
| Append entry  | Reducer: `append_ledger_entry`                                                    | Append to `session-ledger.jsonl` |
| Read ledger   | SQL: `SELECT * FROM ledger_entries WHERE session_id = ? ORDER BY sequence_number` | Read `session-ledger.jsonl`      |
| Next sequence | SQL: `SELECT MAX(sequence_number) FROM ledger_entries WHERE session_id = ?`       | Parse last line of JSONL         |

Entry types: `phase_started`, `phase_completed`, `transition`, `error`, `checkpoint`, `metric`, `decision`

---

## 12. Suspend/Resume Checkpoints

**File**: `packages/luca-framework/src/state/suspend-checkpoint.ts`

Allows pausing work mid-phase and resuming later with full context.

| Operation         | SpacetimeDB Path                                                          | Local Fallback                           |
| ----------------- | ------------------------------------------------------------------------- | ---------------------------------------- |
| Save checkpoint   | Reducer: `save_checkpoint`                                                | Write `checkpoints/suspend-{phase}.json` |
| Load checkpoint   | SQL: `SELECT checkpoint_json FROM suspend_checkpoints WHERE phase_id = ?` | Read `checkpoints/suspend-{phase}.json`  |
| Delete checkpoint | Reducer: `delete_checkpoint`                                              | Delete file                              |

Checkpoint data includes: phase state, working memory snapshot, iteration progress, pending tasks.

---

## 13. Key Integration Points for Verification

### End-to-End Data Flow Test

1. **Write**: Framework calls `callReducer("ingest_event", {...})` via `observer-emitter.ts`
2. **Store**: SpacetimeDB persists event in `observer_events` table
3. **Push**: WebSocket subscription notifies connected clients
4. **Render**: Observer dashboard `useObserverEvents()` hook receives update, React re-renders

### Read Path Test

1. **Query**: Framework calls `queryTable("SELECT * FROM workflow_state WHERE id = 1")` via `spacetimedb-client.ts`
2. **Parse**: Response converted from positional arrays to named objects
3. **Use**: Bridge CLI returns parsed data to calling skill/agent

### Fallback Test

1. **SpacetimeDB down**: `spacetimedb-client.ts` catches error
2. **Fallback**: Reads from local `state.json` / `BRAIN.md` / etc.
3. **No interruption**: Framework continues operating without observability

### Hook Integration Test

1. **Hook fires**: Shell script runs on trigger event
2. **Curl**: Posts to SpacetimeDB reducer endpoint
3. **Silent failure**: If SpacetimeDB is down, hook swallows error and continues

---

## 14. Areas for Improvement

### Immediate

- **Remove dead legacy code**: 14 API routes, 7 lib files, and polling hook in luca-observer are unreachable (hooks use `useTable()` now)
- **Type-check the full monorepo**: `bunx --bun tsc --noEmit` across all packages

### Short-Term

- **Authentication**: Add SpacetimeDB identity-based auth for multi-user scenarios
- **Error boundaries**: Add React error boundaries around each dashboard section
- **Connection resilience**: Auto-reconnect logic for WebSocket drops
- **Data retention**: Add TTL or cleanup reducers for high-volume tables (observer_events, token_usage)

### Medium-Term

- **NPM packaging**: Extract core framework as installable npm package
- **Multi-project support**: Single SpacetimeDB instance serving multiple projects
- **Historical data**: Time-series queries and trend visualization
- **Agent coordination**: Real-time agent status tracking in observer dashboard
- **Export/import**: Bulk data export for analysis, import for replay

### Long-Term

- **Distributed agents**: Multi-machine agent coordination via SpacetimeDB
- **Custom dashboards**: User-configurable dashboard layouts
- **Plugin system**: Third-party integrations for CI/CD, issue trackers, etc.
- **Cost analytics**: Cross-session cost trends, budget forecasting

---

## 15. Commands Reference

```bash
# Development
bun install                                    # Install all dependencies
bun run build:all                              # Build agents/skills/rules/hooks/plugin
bun test                                       # Run all tests
bunx --bun tsc --noEmit                        # Type-check

# SpacetimeDB
spacetime start                                # Start local SpacetimeDB server
spacetime publish luca-observer --module-path packages/luca-spacetime/spacetimedb  # Publish module
spacetime generate --lang typescript \
  --out-dir packages/luca-observer/module_bindings \
  --module-path packages/luca-spacetime/spacetimedb  # Regenerate client bindings
spacetime logs luca-observer                   # View server logs

# Observer
cd packages/luca-observer && bun run dev       # Start observer dashboard (localhost:3456)

# Bridge CLI
bun run packages/luca-framework/src/state/bridge.ts read-status
bun run packages/luca-framework/src/state/bridge.ts read-complexity
bun run packages/luca-framework/src/state/bridge.ts transition set-complexity --complexity=MODERATE
```
