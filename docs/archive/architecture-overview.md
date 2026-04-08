# Luca Framework — Comprehensive Architecture Overview

> **Purpose**: End-to-end reference for agents verifying, testing, and improving the Luca platform.
> Covers every package, data flow, and integration point.

---

## 1. Vision

Luca is an **agentic development platform** designed to be installed into any application via npm and used with Claude Code. It provides:

- **Context management** — MuninnDB-backed memory (brain tree, engrams, session context) that prevents context rot and improves accuracy
- **Workflow orchestration** — spec-driven development with complexity gating, verification checks, and cognitive pre-flight
- **Cost optimization** — token budgets, compression, and context-tier resolution to minimize API spend
- **Real-time observability** — a live dashboard (luca-observer) so users always know what their agent team is doing

---

## 2. Repository Structure

```
luca-framework/                         # Monorepo root
├── packages/
│   ├── luca-framework/                 # Core framework (state machine, bridges, ledger)
│   │   └── src/state/                  # XState v5 state machine + bridge CLI
│   │       ├── __helpers/
│   │       │   └── audit-findings.ts       # Audit findings persistence
│   │       ├── persistence.ts              # State load/save (JSON file)
│   │       ├── bridge.ts                   # CLI bridge with 13 subcommands
│   │       ├── ledger.ts                   # Append-only event ledger
│   │       ├── suspend-checkpoint.ts       # Phase suspend/resume checkpoints
│   │       └── machine.ts                  # XState v5 state machine definition
│   │
│   ├── luca-observer/                  # Next.js 15 real-time dashboard
│   │   ├── app/                        # App Router pages (11 routes)
│   │   ├── hooks/                      # React hooks (16 hooks using useTable())
│   │   ├── components/                 # UI components (Tremor + Tailwind)
│   │   └── lib/                        # Shared utilities
│
├── src/                                # Domain source (13 domains across 4 tiers)
│   ├── agents/                         # T2 Entity — agent definitions
│   ├── skills/                         # T2 Entity — skill definitions
│   ├── rules/                          # T2 Entity — rule definitions
│   ├── memory/                         # T1 Core — memory system (MuninnDB-backed)
│   │   └── __helpers/bridge.ts         # MuninnDB MCP integration helpers
│   ├── context/                        # T1 Core — context tier resolution
│   ├── planner/                        # T1 Core — cost model, scheduler, WSJF scoring
│   ├── iteration/                      # T1 Core — budget, convergence, checkpoint
│   ├── checks/                         # T1 Core — verification runner
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
│   └── (Memory stored in MuninnDB: brain tree, engrams, session context)
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
| T1 Core       | context, planner, checks, iteration, memory, observability  | Import T0 only                              |
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

| Function               | Read Source   | Write Target              |
| ---------------------- | ------------- | ------------------------- |
| `loadPersistedActor()` | `state.json`  | —                         |
| `persistActor()`       | —             | `state.json` + `STATE.md` |
| `createFreshActor()`   | `config.json` | —                         |
| `stateExists()`        | File check    | —                         |

### Bridge CLI

**File**: `packages/luca-framework/src/state/bridge.ts`

The bridge provides a shell-friendly interface with **13 subcommands**:

**Read commands**: `read-status`, `read-complexity`, `read-oversight`, `read-phase`, `read-field`, `read-ledger`
**Write commands**: `set-field`, `transition` (event dispatch with `--event=TYPE`)
**Lifecycle**: `ensure-init`, `snapshot`, `gate-check`, `suspend`, `resume-phase`

All reads and writes use the local JSON file (`.planning/state.json`). STATE.md generation is gated by `LUCA_EXPORT_MD=true`.

---

## 4. Memory System (MuninnDB)

### Memory Tiers

Luca's memory is stored in **MuninnDB** via MCP tools, organized into engrams within the `"default"` vault:

| Tier       | MuninnDB Location                                                | Purpose                                  | Persistence |
| ---------- | ---------------------------------------------------------------- | ---------------------------------------- | ----------- |
| Brain      | Brain tree (`brain:project-identity`)                            | Project identity, stack, conventions     | Permanent   |
| Long-term  | Engrams (`pattern:*`, `decision:*`, `pitfall:*`, `preference:*`) | Long-term learnings, patterns, decisions | Permanent   |
| Session    | Session engrams (`session:*`)                                    | Session context, hypotheses, findings    | Per-session |
| Procedures | Engrams (`procedure:*`)                                          | Operational procedures, runbooks         | Permanent   |

### MuninnDB MCP Tools

Memory operations use MuninnDB MCP tools:

| Operation     | MuninnDB MCP Tool                                                  |
| ------------- | ------------------------------------------------------------------ |
| Store memory  | `mcp__muninn__muninn_remember(vault: "default", concept, content)` |
| Recall memory | `mcp__muninn__muninn_recall(vault: "default", context)`            |
| Read specific | `mcp__muninn__muninn_read(vault: "default", id)`                   |
| Link memories | `mcp__muninn__muninn_link(vault: "default", source_id, target_id)` |
| Batch store   | `mcp__muninn__muninn_remember_batch(vault: "default", memories[])` |
| Brain tree    | `mcp__muninn__muninn_remember_tree(vault: "default", tree)`        |
| Recall tree   | `mcp__muninn__muninn_recall_tree(vault: "default", root_id)`       |

### Cognitive Pre-Flight

Before major operations, Luca loads from MuninnDB:

1. Recall brain tree from MuninnDB → project conventions
2. Semantic recall from MuninnDB → relevant patterns, decisions, pitfalls
3. Initialize MuninnDB session → session context
4. Generate intuition flags → RISK, CAUTION, OPPORTUNITY, UNKNOWN

### Context Pruning and Auto-Compaction

Context pruning and auto-compaction live within the memory domain (`src/memory/`) because they are fundamentally memory management operations:

- **Context pruning** (`src/memory/__helpers/context-pruning.ts`): Removes stale content from session memory based on configurable retention policies. Activates at the "degrading" quality zone. Pure functions -- caller handles I/O.
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

This domain is consumed by the routing layer to make data-driven agent selection decisions. It reads/writes a local scorecard JSON file.

### 5.2 `packages/luca-observer/` -- Real-Time Dashboard (Next.js 15)

**Files**: 11 App Router pages, 16 React hooks, Tremor + Tailwind UI

A Next.js 15 dashboard for real-time workflow observability. The observer package is maintained separately from the core framework.

### 5.3 Relationship to Core Domains

| Component                 | Tier             | Depends On  | Consumed By                      |
| ------------------------- | ---------------- | ----------- | -------------------------------- |
| `src/observability/`      | T1 Core          | T0 (shared) | Routing layer, report generation |
| `packages/luca-observer/` | External package | --          | End user (browser)               |

---

## 7. Observer Dashboard

> **Note**: The luca-observer package is maintained separately. SpacetimeDB integration has been removed from the core framework. See `docs/observer-architecture.md` for observer-specific details.

---

## 8. Hook System

### Shell Hooks

**Source**: `src/hooks/scripts/` → compiled to `.claude/hooks/` via `bun run build:all`

| Hook                         | Trigger                 | Purpose                                            |
| ---------------------------- | ----------------------- | -------------------------------------------------- |
| `session-start.sh`           | Session start           | Initialize state, recall brain tree from MuninnDB  |
| `post-edit-format.sh`        | After file edit         | Auto-format edited files                           |
| `post-edit-typecheck.sh`     | After file edit (async) | Type-check changed file                            |
| `pre-commit-gate.sh`         | Before git commit       | Run tests + typecheck, block on failure            |
| `context-monitor.sh`         | On stop                 | Monitor context usage, warn on degradation         |
| `context-check-throttled.sh` | After tool use          | Throttled context check + developer notes delivery |
| `session-persist.sh`         | Session end             | Persist state, write session-end marker            |

---

## 9. `/lu` Workflow Pipeline

The unified `/lu` command routes through a 10-step pipeline:

### Step 1: Parse & Route

- Parse user intent from natural language
- `lu-router` agent classifies complexity (TRIVIAL → CRITICAL)
- Route to appropriate sub-workflow

### Step 2: Cognitive Pre-Flight

- Recall brain tree from MuninnDB (project identity)
- Semantic recall from MuninnDB (relevant patterns, decisions, pitfalls)
- Initialize MuninnDB session (session context)
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

### Step 5: Verification Checks

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

- Extract patterns, decisions, pitfalls from MuninnDB session context
- Store validated learnings as MuninnDB engrams
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
    "checks": { "test": true, "typecheck": true, "lint": true, "build": true },
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
| Checks fix iterations  | 1       | 2      | 2        | 2        | 3        |
| Code review agents     | Skip    | Skip   | Run      | Run      | Run      |
| UAT                    | Skip    | Skip   | Optional | Required | Required |
| Learning capture       | Skip    | Brief  | Standard | Full     | Full     |

---

## 11. Ledger System

**File**: `packages/luca-framework/src/state/ledger.ts`

The ledger is an append-only log of state transitions, providing a complete audit trail.

| Operation     | Storage                          |
| ------------- | -------------------------------- |
| Append entry  | Append to `session-ledger.jsonl` |
| Read ledger   | Read `session-ledger.jsonl`      |
| Next sequence | Parse last line of JSONL         |

Entry types: `phase_started`, `phase_completed`, `transition`, `error`, `checkpoint`, `metric`, `decision`

---

## 12. Suspend/Resume Checkpoints

**File**: `packages/luca-framework/src/state/suspend-checkpoint.ts`

Allows pausing work mid-phase and resuming later with full context.

| Operation         | Storage                                  |
| ----------------- | ---------------------------------------- |
| Save checkpoint   | Write `checkpoints/suspend-{phase}.json` |
| Load checkpoint   | Read `checkpoints/suspend-{phase}.json`  |
| Delete checkpoint | Delete file                              |

Checkpoint data includes: phase state, working memory snapshot, iteration progress, pending tasks.

---

## 13. Key Integration Points for Verification

### State Persistence Test

1. **Write**: Framework persists actor snapshot to `.planning/state.json`
2. **Read**: Bridge CLI loads persisted actor and returns typed data
3. **Ledger**: State transitions appended to `.planning/session-ledger.jsonl`

### Hook Integration Test

1. **Hook fires**: Shell script runs on trigger event
2. **Bridge call**: Reads/writes state via bridge CLI subcommands
3. **Resilient**: All bridge calls use `2>/dev/null || true` for graceful degradation

---

## 14. Areas for Improvement

### Immediate

- **Remove dead legacy code**: 14 API routes, 7 lib files, and polling hook in luca-observer are unreachable (hooks use `useTable()` now)
- **Type-check the full monorepo**: `bunx --bun tsc --noEmit` across all packages

### Short-Term

- **Error boundaries**: Add React error boundaries around each dashboard section
- **Observability redesign**: Build lightweight emission layer using MuninnDB session memory

### Medium-Term

- **NPM packaging**: Extract core framework as installable npm package
- **Historical data**: Time-series queries and trend visualization
- **Agent coordination**: Real-time agent status tracking in observer dashboard
- **Export/import**: Bulk data export for analysis, import for replay

### Long-Term

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

# Observer
cd packages/luca-observer && bun run dev       # Start observer dashboard (localhost:3456)

# Bridge CLI
bun run packages/luca-framework/src/state/bridge.ts read-status
bun run packages/luca-framework/src/state/bridge.ts read-complexity
bun run packages/luca-framework/src/state/bridge.ts transition set-complexity --complexity=MODERATE
```
