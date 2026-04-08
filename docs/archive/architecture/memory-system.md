# Memory System Architecture

> Consolidated reference for Luca's memory system: 3-layer architecture, hook-based checkpoint lifecycle, MuninnDB integration, context management, gap analysis, and architectural decisions. Sources: architecture-review.md, decisions.md, gap-analysis.md (2026-03-13).

---

## Overview

Luca's memory system spans three layers: **MuninnDB** (long-term semantic graph memory), **session context** (working memory during execution), and **context monitoring** (hooks that watch the Claude Code context window). Claude Code exposes **18 hook events** (not 5), including `PreCompact` and `SessionStart` with compact matcher -- enabling a deterministic checkpoint-and-restore lifecycle.

## Architecture Diagram

```
SESSION LIFECYCLE
  SessionStart --> Active Work --> Stop/Pause --> SessionEnd
       |                |               |              |
  session-start.sh  PostToolUse     context-       session-
  (STATE.md init)   hooks (60s):    monitor.sh     persist.sh
                    - format        (WARN only)    (STATE.md
                    - typecheck                     snapshot)
                    - context-check
                    - snapshot-sync

CHECKPOINT LIFECYCLE (PreCompact + SessionStart)
  Active Work --> PreCompact hook --> Compaction --> SessionStart(compact)
                       |                                  |
               pre-compact-checkpoint.ts          session-compact-restore.ts
               Writes checkpoint to:              Reads checkpoint from:
               - .context-checkpoint.json         - MuninnDB session:checkpoint
               - MuninnDB session:checkpoint      Injects via systemMessage

MUNINNDB MEMORY
  REPO VAULT (luca-framework)     DEFAULT VAULT
  +-- brain:project-identity      +-- brain:user-identity
  +-- session:context             +-- pattern:*
  +-- session:findings            +-- decision:*
  +-- session:candidate-*         +-- pitfall:*
  +-- metric:*                    +-- preference:*
  +-- outcome:*                   +-- procedure:*

  lu-cognition (START) --> session:* --> lu-learner (END)
  Recalls brain tree       Accumulated    Extracts to permanent
  Semantic recall           during work    engrams, clears session
  Init session context
```

---

## Layer 1: MuninnDB Integration

### Dual-Vault Model

| Vault                         | Scope            | Concept Prefixes                                                                      |
| ----------------------------- | ---------------- | ------------------------------------------------------------------------------------- |
| Repo vault (`luca-framework`) | Project-specific | `brain:project-*`, `session:*`, `metric:*`, `outcome:*`, `version:*`, `milestone:*`   |
| Default vault (`default`)     | Cross-cutting    | `brain:user-*`, `pattern:*`, `decision:*`, `pitfall:*`, `preference:*`, `procedure:*` |

Vault resolution chain: `.planning/config.json` `muninn.vault` --> `LUCA_MUNINN_VAULT` env var --> `"default"` fallback.

### Agents That Interact With MuninnDB

| Agent          | Role              | MuninnDB Operations                                                                                 |
| -------------- | ----------------- | --------------------------------------------------------------------------------------------------- |
| `lu-cognition` | Pre-flight        | Recalls brain tree, semantic recall of engrams, initializes session context, intuition checks       |
| `lu-learner`   | Post-verification | Extracts validated learnings from session, writes permanent engrams, links memories, clears session |

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

### Emitter Infrastructure

Located in `packages/luca-framework/src/emitter/`: fire-and-forget emission, circuit breaker for MuninnDB unavailability, batch queue with flush-on-timer/threshold, and lightweight REST HTTP writer.

---

## Layer 2: Context Management

### Context Tier System (Sub-Agent Context)

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

### Context Quality Degradation Model

| Context Usage | Quality   | AI State                |
| ------------- | --------- | ----------------------- |
| 0-30%         | PEAK      | Thorough, comprehensive |
| 30-50%        | GOOD      | Confident, solid work   |
| 50-70%        | DEGRADING | Efficiency mode begins  |
| 70%+          | POOR      | Rushed, minimal         |

---

## Layer 3: Session Lifecycle

### Hook Chain (18 Claude Code Hook Events Available)

```
SessionStart --> session-start.sh (15s)
  - Creates .planning/ structure, initializes STATE.md + state.json, creates session lock

PostToolUse --> (async, non-blocking)
  - post-edit-format.sh (Edit/Write only)
  - post-edit-typecheck.sh (Edit/Write only, async)
  - context-check-throttled.sh (all tools, 60s throttle)
  - snapshot-sync.sh (all tools, 120s throttle)

PreToolUse --> (sync, blocking on failure)
  - pre-commit-gate.sh (Bash matcher, 120s)
  - pre-commit-drift-check.sh (Bash matcher, 60s)

PreCompact --> pre-compact-checkpoint.ts (async, non-blocking)
  - Writes checkpoint to MuninnDB + .planning/.context-checkpoint.json

SessionStart (matcher: compact) --> session-compact-restore.ts
  - Reads checkpoint, injects via systemMessage

Stop --> context-monitor.sh (5s)
  - Advisory context warning

SessionEnd --> session-persist.sh (10s)
  - Removes session lock, writes session-end marker
```

### Session Pause/Resume

`/session-pause` creates `.planning/phases/XX-name/.continue-here.md` with position, completed work, remaining work, decisions, blockers, and next action. `/session-resume` restores from checkpoint via bridge (fallback: STATE.md). Key limitation: neither skill interacts with MuninnDB directly -- filesystem-based only.

---

## Gap Analysis

### Target Capabilities

1. **Smart context management** -- Watch context usage, auto-store session memory to MuninnDB when context grows, auto-trigger compaction to keep context small
2. **Post-clear recall** -- After clearing, recall previous relevant context so key details of working state are not lost
3. **Memory bar visualizer** -- Observational memory bar in luca-observer showing real-time context state

### Gap 1: Auto-Store + Auto-Clear (RESOLVED via Decision 1)

Context monitoring hooks detect degrading zones but only warn. Resolved by PreCompact hook + proactive checkpoints at zone boundaries. See Decision 1 below.

### Gap 2: Post-Clear Recall -- SOLVED

**Status: SOLVED.** The checkpoint system is fully operational:

- **`pre-compact-checkpoint.ts`** hook writes checkpoint to `.planning/.context-checkpoint.json` and MuninnDB `session:checkpoint` engrams on every PreCompact event
- **`session-compact-restore.ts`** hook reads the checkpoint and injects it via `systemMessage` after compaction completes (SessionStart with compact matcher)
- **`context-restore.skill.ts`** provides manual deep recovery via hub-and-spoke semantic recall from MuninnDB for cases where the user wants richer context than the automatic injection

This implements the full layered restore architecture from Decision 3: automatic hook injection (Layer 1), on-demand skill recall (Layer 2), and lu-cognition pre-flight for fresh sessions (Layer 3).

### Gap 3: ContextUsageBar Shows Vault Stats, Not Context Window -- OPEN

**Status: OPEN.** The observer's `ContextUsageBar` component still shows MuninnDB vault statistics (engram count, coherence, storage) rather than real-time context window usage. There is no visualization of: real-time context window consumption, zone transitions, checkpoint events, or session-to-memory correlation. The planned file-based pipeline (`.planning/.context-metrics.json` polled by observer) from Decision 4 has not been implemented yet.

---

## Decision 1: Auto-Store + Auto-Clear Mechanism

### Research Findings (Q1, Q2, Q5)

**Q1: systemMessage for /compact?** -- UNRELIABLE. Advisory only, LLM may not comply. Not suitable for critical operations.

**Q2: Prompt hooks for /compact?** -- NOT VIABLE. Luca uses only command hooks. Prompt hooks would violate the hook/skill boundary rule ("Hooks = Deterministic enforcement. No judgment.").

**Q5: Hook events around /compact?** -- **YES, PreCompact exists.** Fires before both manual `/compact` and auto-compact. Receives `transcript_path` and `trigger` (manual/auto). Cannot block compaction (fire-and-forget). Supports `async: true`.

### Decision: PreCompact Hook + SessionStart Restore

**Strategy**: Two-phase deterministic checkpoint-and-restore.

**Phase 1 -- PreCompact Checkpoint** (async, non-blocking):

1. `PreCompact` hook fires with `transcript_path`
2. Hook script reads transcript, extracts session state
3. Writes checkpoint to MuninnDB as `session:checkpoint` engram
4. Also writes checkpoint to `.planning/.context-checkpoint.json` (fallback)

**Phase 2 -- SessionStart Restore** (matcher: `compact`):

1. `SessionStart` hook fires with matcher `compact` after compaction completes
2. Hook reads latest `session:checkpoint` from MuninnDB
3. Injects checkpoint via `systemMessage` as structured context block
4. LLM resumes with critical context preserved

**Why this over the alternatives:**

- **Deterministic** -- PreCompact always fires before compaction, guaranteed
- **Non-disruptive** -- async hook does not block the user
- **No LLM compliance needed** -- hooks handle everything mechanically
- **Dual-write** -- MuninnDB for persistence, filesystem for speed

### Proactive Checkpointing (Retained as Enhancement)

In addition to PreCompact, retain proactive checkpoints at zone boundaries:

- **50% context (good_end)**: First proactive checkpoint via `context-check-throttled.sh`
- **70% context (degrading_end)**: Second checkpoint + user warning
- These are insurance -- PreCompact is the primary safety net

---

## Decision 2: Checkpoint Content Design

### Research Findings (Q3, Q7)

**Principle: "Store only what the codebase cannot tell you."** The codebase has the code. Git has the history. The checkpoint needs only: intent, decisions, approach, and position.

### Decision: 5-Field MVP Checkpoint (~1.5KB, ~400 tokens)

```markdown
## Context Checkpoint

### Position

- Phase: {phase_id}-{phase_name}
- Task: {current} of {total}
- Complexity: {level}

### Current Work

- Goal: {what we're trying to achieve}
- Approach: {how we're doing it}
- Next Step: {specific action to take next}

### Key Decisions

- {decision}: {rationale}

### Completed Summary

- {brief list of what's done this session}
```

**Why 5 fields, not more:**

- **task_position**: Lets LLM know where in the workflow we are (from STATE.md + bridge)
- **next_action**: Most critical -- tells the LLM what to do immediately after restore
- **decisions**: Rationale that cannot be inferred from code alone
- **approach**: Mental model -- why this path, not another
- **completed_summary**: Prevents re-doing work

**What we deliberately exclude:**

- Files touched -- derivable from `git status`
- Code observations -- LLM can re-read files
- Blockers -- if blocking, should not have compacted
- Full session log -- too large, not needed for resumption

### Hub-and-Spoke Pattern

The checkpoint is the "hub" (~1.5KB). After restore, MuninnDB semantic recall provides "spokes" -- relevant patterns, decisions, and pitfalls from long-term memory. This gives rich context without bloating the checkpoint.

```
                    [pattern:auth-middleware]
                           |
[decision:api-design] -- [checkpoint] -- [pitfall:race-condition]
                           |
                    [pattern:error-handling]
```

Estimated overhead: ~800-1200 tokens for checkpoint injection, well within acceptable bounds.

---

## Decision 3: Post-Clear Context Recall

### Research Findings (Q5, Q6)

**Q5 (revisited)**: SessionStart fires after compaction with matcher `compact`. This is the restore point.

**Q6: systemMessage size limits?** -- No documented hard limit. Current usage is 100-300 bytes. Practical recommendation: keep under 1KB for systemMessage. For larger context, use MuninnDB recall in the skill/agent layer.

### Decision: Layered Restore (Hook + Skill)

**Layer 1 -- Automatic (SessionStart hook, ~1KB):**

- Hook reads `session:checkpoint` from MuninnDB
- Injects 5-field checkpoint via systemMessage
- Immediate, no user action required
- Keeps systemMessage under 1KB

**Layer 2 -- On-Demand (`/context-restore` skill):**

- User can invoke after any clear/compact for deeper context
- Recalls checkpoint + related long-term engrams from MuninnDB
- Performs hub-and-spoke expansion (checkpoint + related patterns/decisions/pitfalls)
- Presents full restored context with source attribution

**Layer 3 -- Cognitive Pre-Flight (existing lu-cognition):**

- Already runs at session start for routed workflows
- Recalls brain tree, performs semantic recall, initializes session context
- No changes needed -- already handles deep context restoration

**Why layered, not single-mechanism:**

- Layer 1 handles the common case (auto-compact during work) with zero user effort
- Layer 2 handles explicit clears where the user wants full context back
- Layer 3 handles fresh sessions (new conversations, not post-compact)

### Compact Instructions Enhancement

Added to CLAUDE.md a `Compact Instructions` section that tells Claude Code what to preserve during native compaction. This works alongside the PreCompact hook -- Claude Code's native compaction also gets guidance.

---

## Decision 4: Observer Memory Bar

### Research Findings (Q8, Q9, Q10)

**Q8: Polling interval?** -- 10 seconds default with intelligent backoff (5s active, 30s idle, fallback to manual after 3 failures).

**Q9: Placement?** -- Embed in header, not a dedicated page. 11 pages is already dense; context usage is a system constraint, not a feature to explore.

**Q10: Additional metrics?** -- Primary: usage percentage bar with zone coloring. Secondary (tooltip): session duration, tool call count, checkpoint count, last checkpoint time.

### Decision: File-Based Metrics + Header Bar

```
context-check-throttled.sh --> .planning/.context-metrics.json --> /api/context-metrics --> Header bar
```

**Why file-based over MuninnDB-based:** File read ~5ms vs MuninnDB round-trip ~50-200ms. No engram pollution -- context metrics are ephemeral, not memories.

**Status: NOT YET IMPLEMENTED.** See Gap 3 above.

---

## Decision 5: Cross-Cutting Insights from Industry Research

### Key Patterns Adopted

| Pattern                              | Source                      | Luca Implementation                                          |
| ------------------------------------ | --------------------------- | ------------------------------------------------------------ |
| Deterministic pre-compact checkpoint | Claude Code PreCompact hook | Decision 1 -- PreCompact hook writes to MuninnDB             |
| Tiered memory (hot + cold)           | MemGPT (4 tiers)            | Already implemented: MuninnDB (cold) + session context (hot) |
| Hub-and-spoke recall                 | MemGPT archival search      | Decision 2 -- checkpoint hub + semantic recall spokes        |
| Compact Instructions                 | Claude Code native          | Decision 3 -- CLAUDE.md section guiding compaction           |
| File-based metrics offload           | Cursor disk philosophy      | Decision 4 -- metrics JSON file, not in-context              |

### Patterns Deferred

Repo map (Aider), automatic memory generation (Windsurf), observation masking (JetBrains NeurIPS 2025), auto-capture tool observations (claude-mem). Each deferred as out of scope for the current checkpoint-and-restore focus.

### Infrastructure Note

Hook schemas (`src/hooks/__schemas/hook.schemas.ts`) must be updated to include the full 18 Claude Code events -- at minimum `PreCompact`, `UserPromptSubmit`, `SubagentStop`, `Notification`.

---

## Key Files

| Area               | Path                                                             |
| ------------------ | ---------------------------------------------------------------- |
| Emitter            | `packages/luca-framework/src/emitter/`                           |
| 7-signal scoring   | `src/agents/__helpers/embedding-recall.ts`                       |
| Context schemas    | `src/context/__schemas/context.schemas.ts`                       |
| Context assembler  | `src/context/__helpers/context-assembler.ts`                     |
| Tier promotion     | `src/context/__helpers/resolve-context-tier.ts`                  |
| PreCompact hook    | `src/hooks/scripts/pre-compact-checkpoint.ts`                    |
| Compact restore    | `src/hooks/scripts/session-compact-restore.ts`                   |
| Context restore    | `src/skills/general/context-restore.skill.ts`                    |
| Context monitor    | `src/hooks/scripts/context-monitor.sh`                           |
| Context check      | `src/hooks/scripts/context-check-throttled.sh`                   |
| Session pause      | `src/skills/general/session-pause.skill.ts`                      |
| Session resume     | `src/skills/general/session-resume.skill.ts`                     |
| Session start hook | `src/hooks/scripts/session-start.sh`                             |
| Session end hook   | `src/hooks/scripts/session-persist.sh`                           |
| Observer memory UI | `packages/luca-observer/app/memory/page.tsx`                     |
| Vault stats bar    | `packages/luca-observer/components/memory/context-usage-bar.tsx` |
