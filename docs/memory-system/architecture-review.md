# Memory System Architecture Review

> Comprehensive review of Luca's working memory systems, MuninnDB integration, context management, and observer visualization. Conducted 2026-03-13.

## Overview

Luca's memory system spans three layers: **MuninnDB** (long-term semantic graph memory), **session context** (working memory during execution), and **context monitoring** (hooks that watch the Claude Code context window). This review documents the current state of each layer and identifies gaps for planned improvements.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                     SESSION LIFECYCLE                                │
│                                                                     │
│  SessionStart ──→ Active Work ──→ Stop/Pause ──→ SessionEnd        │
│       │                │               │              │             │
│  session-start.sh  PostToolUse     context-       session-          │
│  (STATE.md init)   hooks (60s):    monitor.sh     persist.sh        │
│                    - format        (WARN only)    (STATE.md          │
│                    - typecheck                     snapshot)         │
│                    - context-check                                   │
│                    - snapshot-sync                                    │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                     MUNINNDB MEMORY                                  │
│                                                                     │
│  REPO VAULT (luca-framework)     DEFAULT VAULT                      │
│  ├── brain:project-identity      ├── brain:user-identity            │
│  ├── session:context             ├── pattern:*                      │
│  ├── session:findings            ├── decision:*                     │
│  ├── session:candidate-*         ├── pitfall:*                      │
│  ├── metric:*                    ├── preference:*                   │
│  └── outcome:*                   └── procedure:*                    │
│                                                                     │
│  lu-cognition (START) ──→ session:* ──→ lu-learner (END)           │
│  Recalls brain tree       Accumulated    Extracts to permanent      │
│  Semantic recall           during work    engrams, clears session    │
│  Init session context                                                │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                     OBSERVER APP                                     │
│                                                                     │
│  /memory page:                    /workflow-editor:                  │
│  ├── ContextUsageBar (vault stats)├── React Flow canvas             │
│  ├── BrainPanel                   ├── Agent/Skill/Gate nodes        │
│  ├── MemoryEntries (engrams)      └── Complexity filter             │
│  └── WorkingSections (session)                                       │
│                                                                     │
│  11 pages total, all via /api/muninn/* server proxy                 │
└─────────────────────────────────────────────────────────────────────┘
```

## Layer 1: MuninnDB Integration

### Dual-Vault Model

Luca uses two MuninnDB vaults simultaneously:

| Vault                         | Scope            | Concept Prefixes                                                                      |
| ----------------------------- | ---------------- | ------------------------------------------------------------------------------------- |
| Repo vault (`luca-framework`) | Project-specific | `brain:project-*`, `session:*`, `metric:*`, `outcome:*`, `version:*`, `milestone:*`   |
| Default vault (`default`)     | Cross-cutting    | `brain:user-*`, `pattern:*`, `decision:*`, `pitfall:*`, `preference:*`, `procedure:*` |

Vault resolution chain: `.planning/config.json` `muninn.vault` -> `LUCA_MUNINN_VAULT` env var -> `"default"` fallback.

### Agents That Interact With MuninnDB

| Agent          | Role              | MuninnDB Operations                                                                                 |
| -------------- | ----------------- | --------------------------------------------------------------------------------------------------- |
| `lu-cognition` | Pre-flight        | Recalls brain tree, semantic recall of engrams, initializes session context, intuition checks       |
| `lu-learner`   | Post-verification | Extracts validated learnings from session, writes permanent engrams, links memories, clears session |

### lu-cognition Pre-Flight Flow

1. Resolve vaults (config.json -> env var -> fallback)
2. Check complexity mode (TRIVIAL/SIMPLE = Lite, MODERATE+ = Full)
3. Load brain tree: `muninn_recall_tree(vault: REPO_VAULT, id: "brain:project-identity")`
4. Extract task keywords for recall context
5. Resolve target agent's cognition tier (T0-T3) with complexity-driven promotion
6. Clean up stale session engrams from previous workflows
7. Selective recall (if `eager_recall=true`): dual-vault semantic recall with 7-signal composite scoring
8. Initialize session context template in MuninnDB
9. Generate intuition flags (RISK, CAUTION, OPPORTUNITY, UNKNOWN)
10. Output cognitive report (scales by tier)

### 7-Signal Composite Scoring

```
composite_score = weighted sum of:
  - semantic_similarity (0.25):  MuninnDB's embedding-based score
  - tag_overlap         (0.15):  Jaccard similarity of tags
  - milestone_proximity (0.225): 1.0=current, 0.5=same major, 0.0=old
  - agent_match         (0.15):  1.0 if entry mentions target agent
  - confidence          (0.075): High=1.0, Medium=0.5, Low=0.25
  - recency             (0.075): Exponential decay over 30 days
  - feedback_score      (0.075): Proxy via confidence level
```

### lu-learner Extraction Flow

1. Load session context from MuninnDB (`session:*` engrams)
2. Load existing long-term memory (dual-vault recall for deduplication)
3. Extract patterns (High bar: validated, replicable, non-obvious)
4. Extract decisions (Medium bar: real choices with rationale)
5. Extract pitfalls (Low bar: capture more, only skip one-off issues)
6. Extract procedures (3+ step sequences with verified outcomes)
7. Update confidence (Low -> Medium -> High based on validations + feedback)
8. Write curated engrams to MuninnDB (appropriate vault per routing heuristic)
9. Link memories (minimum 1 link per engram, enforced)
10. Clear session context (`muninn_forget(vault: REPO_VAULT, id: "session:*")`)

### Emitter Infrastructure

Located in `packages/luca-framework/src/emitter/`:

- **Fire-and-forget**: `void emitPhaseComplete(...)` — never throws, never blocks
- **Circuit breaker**: Detects MuninnDB unavailability, fails gracefully
- **Batch queue**: Accumulates engrams, flushes on timer or threshold
- **HTTP writer**: Lightweight REST client for direct engram writes

## Layer 2: Context Management

### Context Tier System (Sub-Agent Context)

Located in `src/context/`. Controls what context each sub-agent receives:

| Tier | Documents Included                                       | Use Case                  |
| ---- | -------------------------------------------------------- | ------------------------- |
| T0   | `plan_content` only                                      | Minimal, stateless agents |
| T1   | + `brain_summary`                                        | Memory-reader agents      |
| T2   | + `state_content` + `memory_entries` + `working_content` | Session-aware agents      |
| T3   | + `brain_full` + `memory_full` + `agent_summaries`       | Fully cognitive agents    |

### Isolation Modes

| Mode   | Documents                                           | Used By                                      |
| ------ | --------------------------------------------------- | -------------------------------------------- |
| `none` | Full tier access                                    | Most agents                                  |
| `cold` | `git_diff` + `brain_summary` only                   | dx-advocate, code-simplifier, code-architect |
| `warm` | `plan_content` + `plan_summaries` + `brain_summary` | lu-verifier                                  |

### Complexity-Driven Promotion

| Complexity | Promotions             | Effect         |
| ---------- | ---------------------- | -------------- |
| TRIVIAL    | None                   | No promotion   |
| SIMPLE     | None                   | No promotion   |
| MODERATE   | T0->T1, T1->T2         | +1 tier        |
| COMPLEX    | T0->T1, T1->T2, T2->T3 | Full promotion |
| CRITICAL   | T0->T1, T1->T2, T2->T3 | Full promotion |

### Context Monitoring Hooks

Two hooks monitor context window usage via transcript file size:

**`context-monitor.sh`** (Stop hook, 5s timeout):

- Runs when Claude stops responding
- Transcript size thresholds: WARN=100KB (~30%), ALERT=200KB (~50%), CRITICAL=300KB (~70%)
- Outputs `systemMessage` warning but takes no automated action

**`context-check-throttled.sh`** (PostToolUse hook, 60s throttle, async):

- Runs after every tool use, throttled to once per minute
- Same transcript-size heuristic, maps to zones: peak/good/degrading/stop
- Also checks for urgent developer notes (`0-*.md` in `.planning/notes/`)
- Only warns for degrading/stop zones, silent when healthy

### Context Quality Degradation Model

| Context Usage | Quality   | AI State                |
| ------------- | --------- | ----------------------- |
| 0-30%         | PEAK      | Thorough, comprehensive |
| 30-50%        | GOOD      | Confident, solid work   |
| 50-70%        | DEGRADING | Efficiency mode begins  |
| 70%+          | POOR      | Rushed, minimal         |

## Layer 3: Session Lifecycle

### Hook Chain

```
SessionStart → session-start.sh (15s)
  - Creates .planning/ structure
  - Initializes STATE.md, state.json
  - Creates session lock

PostToolUse → (async, non-blocking)
  - post-edit-format.sh (Edit/Write only)
  - post-edit-typecheck.sh (Edit/Write only, async)
  - context-check-throttled.sh (all tools, 60s throttle)
  - snapshot-sync.sh (all tools, 120s throttle)

PreToolUse → (sync, blocking on failure)
  - pre-commit-gate.sh (Bash matcher, 120s)
  - pre-commit-drift-check.sh (Bash matcher, 60s)

Stop → context-monitor.sh (5s)
  - Advisory context warning

SessionEnd → session-persist.sh (10s)
  - Removes session lock
  - Writes session-end marker
```

### Session Pause/Resume

**`/session-pause`** creates `.planning/phases/XX-name/.continue-here.md`:

- Current position (phase, task, plan)
- Completed work, remaining work
- Decisions made with rationale
- Blockers and mental context
- Next action for resumption
- Commits as WIP

**`/session-resume`** restores from checkpoint:

- Reads state from bridge (fallback: STATE.md)
- Detects `.continue-here.md` files
- Shows visual status
- Routes to next action

**Key limitation**: Neither skill interacts with MuninnDB. Session pause/resume is entirely filesystem-based.

## Layer 4: Observer App (Luca Observer)

### Tech Stack

- Next.js 15 + React 19 + TypeScript
- Shadcn/UI + Radix UI + Tailwind CSS 4
- Jotai for state management
- React Flow v12 for workflow visualization
- Tremor for charts
- React Force Graph 2D for knowledge graph

### Current Pages (11)

| Page            | Route              | Data Source                          |
| --------------- | ------------------ | ------------------------------------ |
| Dashboard       | `/`                | Stats + recent engrams + todos       |
| Memory          | `/memory`          | Brain + engrams + session + stats    |
| Vault           | `/vault`           | Coherence + type breakdown + storage |
| Workflow Editor | `/workflow-editor` | Curated topology data                |
| Entities        | `/entities`        | Entity directory + deep-dive         |
| Knowledge Graph | `/knowledge-graph` | Entity co-occurrence graph           |
| Decisions       | `/decisions`       | Decision trail                       |
| Contradictions  | `/contradictions`  | Contradiction pairs                  |
| Learning        | `/learning`        | Memory evolution over time           |
| Sessions        | `/sessions`        | Session explorer                     |
| Semantic Search | `/semantic-search` | Full-text MuninnDB search            |

### Memory Page Components

- **`ContextUsageBar`**: Shows vault stats (engram count, coherence, storage, index size) — NOT context window usage
- **`BrainPanel`**: Brain tree activations with scores
- **`MemoryEntries`**: Engrams grouped by category (pattern/decision/pitfall/preference)
- **`WorkingSections`**: Recent session activity entries

### Data Flow

```
MuninnDB REST API (http://127.0.0.1:8476)
    ↓
Next.js Route Handlers (/api/muninn/*)   ← server-side, API key stays here
    ↓
Client Hooks (useMemory, useVaultHealth, etc.)
    ↓
React Components + Jotai Atoms (vaultAtom)
```

## Current State Summary

| System                    | Status      | Notes                                                             |
| ------------------------- | ----------- | ----------------------------------------------------------------- |
| MuninnDB dual-vault model | **Solid**   | Vault routing, write heuristics, merge strategy well-defined      |
| lu-cognition pre-flight   | **Solid**   | 7-signal scoring, tier-based recall, deferred recall optimization |
| lu-learner extraction     | **Solid**   | Editorial curation, confidence evolution, procedure extraction    |
| Context monitoring hooks  | **Partial** | Detects zones but only warns, takes no action                     |
| Session pause/resume      | **Partial** | Filesystem-based (.continue-here.md), not MuninnDB-integrated     |
| Observer memory page      | **Partial** | Shows vault stats + engrams, no context window visualization      |
| Emitter infrastructure    | **Solid**   | Fire-and-forget, circuit breaker, batch queue                     |
| Context tier assembly     | **Solid**   | Per-agent profiles, complexity promotion, isolation modes         |

## Key Files

### MuninnDB Integration

- `packages/luca-observer/lib/muninn-config.ts` — REST client (server-side only)
- `packages/luca-observer/lib/muninn-types.ts` — Type definitions
- `packages/luca-framework/src/emitter/` — Fire-and-forget emission
- `src/agents/__helpers/embedding-recall.ts` — 7-signal composite scoring

### Context Management

- `src/context/__schemas/context.schemas.ts` — Tier/isolation/budget schemas
- `src/context/__helpers/context-assembler.ts` — Per-agent document assembly
- `src/context/__helpers/defaults.ts` — Agent profiles, tier-to-document maps
- `src/context/__helpers/resolve-context-tier.ts` — Complexity promotion logic

### Context Monitoring

- `src/hooks/scripts/context-monitor.sh` — Stop hook (advisory)
- `src/hooks/scripts/context-check-throttled.sh` — PostToolUse monitoring

### Session Lifecycle

- `src/skills/general/session-pause.skill.ts` — Filesystem checkpoint
- `src/skills/general/session-resume.skill.ts` — Checkpoint restoration
- `src/hooks/scripts/session-start.sh` — Session initialization
- `src/hooks/scripts/session-persist.sh` — Session end cleanup

### Observer Memory UI

- `packages/luca-observer/app/memory/page.tsx` — Memory dashboard
- `packages/luca-observer/components/memory/context-usage-bar.tsx` — Vault stats bar
- `packages/luca-observer/components/memory/brain-panel.tsx` — Brain tree
- `packages/luca-observer/components/memory/memory-entries.tsx` — Engram list
- `packages/luca-observer/hooks/use-memory.ts` — Data fetching hook
