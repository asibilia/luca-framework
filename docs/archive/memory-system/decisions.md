# Memory System Decisions

> Research findings and architectural decisions for Luca's smart context management, post-clear recall, and observer memory bar. Conducted 2026-03-13.

## Critical Discovery: Claude Code Has 18 Hook Events

Our initial gap analysis assumed only 5 hook events (PostToolUse, PreToolUse, Stop, SessionStart, SessionEnd). Research revealed **Claude Code supports 18 hook events**, including two that change everything:

| Event                                   | When                                       | Impact                                                          |
| --------------------------------------- | ------------------------------------------ | --------------------------------------------------------------- |
| **`PreCompact`**                        | Before context compaction (manual or auto) | Deterministic checkpoint — hook receives full `transcript_path` |
| **`SessionStart`** (matcher: `compact`) | After compaction completes                 | Deterministic restore — hook can re-inject context              |

This makes the gap analysis Options A (systemMessage) and C (marker file chain) obsolete. We have a **deterministic, hookable compaction lifecycle**.

Additional useful events discovered:

- `SubagentStop` — fires when subagents finish, receives transcript
- `Notification` — fires on permission prompts, idle prompts
- `UserPromptSubmit` — fires before user prompt processing, can block

---

## Decision 1: Auto-Store + Auto-Clear Mechanism

### Research Findings (Q1, Q2, Q5)

**Q1: systemMessage for /compact?** — UNRELIABLE. Advisory only, LLM may not comply. Not suitable for critical operations.

**Q2: Prompt hooks for /compact?** — NOT VIABLE. Luca uses only command hooks. Prompt hooks would violate the hook/skill boundary rule ("Hooks = Deterministic enforcement. No judgment.").

**Q5: Hook events around /compact?** — **YES, PreCompact exists.** Fires before both manual `/compact` and auto-compact. Receives `transcript_path` and `trigger` (manual/auto). Cannot block compaction (fire-and-forget). Supports `async: true`.

### Decision: PreCompact Hook + SessionStart Restore

**Strategy**: Two-phase deterministic checkpoint-and-restore.

**Phase 1 — PreCompact Checkpoint** (async, non-blocking):

1. `PreCompact` hook fires with `transcript_path`
2. Hook script reads transcript, extracts session state
3. Writes checkpoint to MuninnDB as `session:checkpoint` engram
4. Also writes checkpoint to `.planning/.context-checkpoint.json` (fallback)

**Phase 2 — SessionStart Restore** (matcher: `compact`):

1. `SessionStart` hook fires with matcher `compact` after compaction completes
2. Hook reads latest `session:checkpoint` from MuninnDB
3. Injects checkpoint via `systemMessage` as structured context block
4. LLM resumes with critical context preserved

**Why this over the alternatives:**

- **Deterministic** — PreCompact always fires before compaction, guaranteed
- **Non-disruptive** — async hook doesn't block the user
- **No LLM compliance needed** — hooks handle everything mechanically
- **Dual-write** — MuninnDB for persistence, filesystem for speed

### Proactive Checkpointing (Retained as Enhancement)

In addition to PreCompact, retain proactive checkpoints at zone boundaries:

- **50% context (good_end)**: First proactive checkpoint via `context-check-throttled.sh`
- **70% context (degrading_end)**: Second checkpoint + user warning
- These are insurance — PreCompact is the primary safety net

---

## Decision 2: Checkpoint Content Design

### Research Findings (Q3, Q7)

**Q3/Q7: What goes in a checkpoint?**

From checkpoint design research + MemGPT patterns:

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
- **next_action**: Most critical — tells the LLM what to do immediately after restore
- **decisions**: Rationale that can't be inferred from code alone
- **approach**: Mental model — why this path, not another
- **completed_summary**: Prevents re-doing work

**What we deliberately exclude:**

- Files touched — derivable from `git status`
- Code observations — LLM can re-read files
- Blockers — if blocking, shouldn't have compacted
- Full session log — too large, not needed for resumption

### Hub-and-Spoke Pattern

The checkpoint is the "hub" (~1.5KB). After restore, MuninnDB semantic recall provides "spokes" — relevant patterns, decisions, and pitfalls from long-term memory. This gives rich context without bloating the checkpoint.

```
                    [pattern:auth-middleware]
                           │
[decision:api-design] ── [checkpoint] ── [pitfall:race-condition]
                           │
                    [pattern:error-handling]
```

**Estimated overhead**: ~800-1200 tokens for checkpoint injection, well within acceptable bounds.

---

## Decision 3: Post-Clear Context Recall

### Research Findings (Q5, Q6)

**Q5 (revisited)**: SessionStart fires after compaction with matcher `compact`. This is the restore point.

**Q6: systemMessage size limits?** — No documented hard limit. Current usage is 100-300 bytes. Practical recommendation: keep under 1KB for systemMessage. For larger context, use MuninnDB recall in the skill/agent layer.

### Decision: Layered Restore (Hook + Skill)

**Layer 1 — Automatic (SessionStart hook, ~1KB):**

- Hook reads `session:checkpoint` from MuninnDB
- Injects 5-field checkpoint via systemMessage
- Immediate, no user action required
- Keeps systemMessage under 1KB

**Layer 2 — On-Demand (new `/context-restore` skill):**

- User can invoke after any clear/compact for deeper context
- Recalls checkpoint + related long-term engrams from MuninnDB
- Performs hub-and-spoke expansion (checkpoint + related patterns/decisions/pitfalls)
- Presents full restored context with source attribution

**Layer 3 — Cognitive Pre-Flight (existing lu-cognition):**

- Already runs at session start for routed workflows
- Recalls brain tree, performs semantic recall, initializes session context
- No changes needed — already handles deep context restoration

**Why layered, not single-mechanism:**

- Layer 1 handles the common case (auto-compact during work) with zero user effort
- Layer 2 handles explicit clears where the user wants full context back
- Layer 3 handles fresh sessions (new conversations, not post-compact)

### Compact Instructions Enhancement

Add to CLAUDE.md a `Compact Instructions` section that tells Claude Code what to preserve during native compaction:

```markdown
## Compact Instructions

When compacting, preserve:

- Current phase, task position, and complexity level
- Key decisions made this session with rationale
- The current approach and next planned action
- Any blockers or open questions
```

This works alongside the PreCompact hook — Claude Code's native compaction also gets guidance.

---

## Decision 4: Observer Memory Bar

### Research Findings (Q8, Q9, Q10)

**Q8: Polling interval?** — **10 seconds default** with intelligent backoff.

- Context metrics change slowly (every 5-30s per tool use)
- Observer currently uses manual refresh only — 10s polling is a significant UX improvement
- Strategy: 10s default, 5s during active sessions, 30s when idle, fallback to manual after 3 failures

**Q9: Placement?** — **Embed in header**, not a dedicated page.

- 11 pages is already dense; 12th creates navigation fatigue
- Context usage is a system constraint, not a feature to explore — should be always-visible
- Header has unused space (flex spacer between sidebar trigger and vault/theme controls)
- Compact horizontal bar fits naturally in 48px header height

**Q10: Additional metrics?** — Keep it focused.

- **Primary**: Usage percentage bar with zone coloring (peak=green, good=blue, degrading=amber, stop=red)
- **Secondary** (tooltip/hover): Session duration, tool call count, checkpoint count, last checkpoint time
- **NOT shown**: Historical timeline, zone transition graph (over-engineering for v1)

### Decision: File-Based Metrics + Header Bar

**Data Pipeline** (Option A from gap analysis — simplest approach):

```
context-check-throttled.sh ──→ .planning/.context-metrics.json ──→ /api/context-metrics ──→ Header bar
```

1. Existing `context-check-throttled.sh` enhanced to write metrics JSON
2. New Next.js API route reads the file
3. New `ContextWindowBar` component in header, polls every 10s
4. Checkpoints also logged to MuninnDB (for persistence, but not for real-time display)

**Metrics File Schema:**

```json
{
  "timestamp": "2026-03-13T18:00:00Z",
  "transcript_bytes": 150000,
  "zone": "good",
  "usage_percent": 35,
  "tool_call_count": 42,
  "session_start": "2026-03-13T17:30:00Z",
  "checkpoints": [
    { "timestamp": "2026-03-13T17:45:00Z", "trigger": "proactive" }
  ]
}
```

**Why file-based over MuninnDB-based:**

- Latency: File read ~5ms vs MuninnDB round-trip ~50-200ms
- No engram pollution — context metrics are ephemeral, not memories
- Hook already writes to filesystem — natural extension
- MuninnDB reserved for checkpoints (persistent, meaningful data)

**Component Design:**

```
[Context: ████████░░░░░░ 35% GOOD] (header, always visible)
         ↕ hover
┌─────────────────────────────┐
│ Session: 30m                │
│ Tool calls: 42              │
│ Checkpoints: 1 (5m ago)     │
│ Zone: GOOD (30-50%)         │
└─────────────────────────────┘
```

---

## Decision 5: Cross-Cutting Insights from Industry Research

### Research Findings (Q4)

Six AI coding tools analyzed: Cursor, Windsurf, Aider, Continue.dev, MemGPT/Letta, Claude Code.

### Key Patterns Adopted

| Pattern                                  | Source                      | Luca Implementation                                          |
| ---------------------------------------- | --------------------------- | ------------------------------------------------------------ |
| **Deterministic pre-compact checkpoint** | Claude Code PreCompact hook | Decision 1 — PreCompact hook writes to MuninnDB              |
| **Tiered memory (hot + cold)**           | MemGPT (4 tiers)            | Already implemented: MuninnDB (cold) + session context (hot) |
| **Hub-and-spoke recall**                 | MemGPT archival search      | Decision 2 — checkpoint hub + semantic recall spokes         |
| **Compact Instructions**                 | Claude Code native          | Decision 3 — CLAUDE.md section guiding compaction            |
| **File-based metrics offload**           | Cursor disk philosophy      | Decision 4 — metrics JSON file, not in-context               |

### Patterns Deferred (Future Work)

| Pattern                                      | Source                 | Why Deferred                                                                                         |
| -------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------- |
| Repo map (PageRank-based codebase summary)   | Aider                  | High value but large scope — separate initiative                                                     |
| Automatic memory generation (Windsurf-style) | Windsurf Cascade       | lu-learner already does post-session extraction; mid-session generation is an enhancement            |
| Weak-model summarization                     | Aider                  | Complexity routing already uses fast-tier models; could apply to checkpoint extraction               |
| RAG-based context assembly                   | Continue.dev           | Different paradigm — Luca uses skill-based context assembly                                          |
| Git Context Controller (COMMIT/BRANCH/MERGE) | GCC paper (2025)       | 13% SWE-Bench improvement; maps to Luca phase/wave model. Checkpoint at wave boundaries is a subset  |
| Observation masking                          | JetBrains NeurIPS 2025 | Masking tool outputs beats LLM summarization at 50%+ cost reduction. Could enhance context assembly  |
| Auto-capture tool observations               | claude-mem plugin      | Compresses 1K-10K token tool outputs to ~500-token observations. Could enhance PreCompact extraction |

### Academic Research Supporting Decisions

**JetBrains "The Complexity Trap" (NeurIPS DL4Code 2025)**: Simple observation masking (hiding tool output details while preserving action/reasoning history) matches or beats LLM summarization for context management, at 50%+ cost reduction. Implication: tool outputs should be aggressively compressed after use; the reasoning chain matters more than raw output.

**Git Context Controller (2025)**: Version-controlled context with COMMIT/BRANCH/MERGE/CONTEXT operations. Achieved 13%+ improvement on SWE-Bench Verified. Luca's phase/wave model already has natural checkpoint boundaries — adding COMMIT operations at wave boundaries directly parallels GCC's approach.

**claude-mem plugin**: Auto-captures tool outputs, compresses to ~500-token semantic observations, categorizes (decision/bugfix/feature/refactor/discovery), stores in SQLite with full-text search. On session start, injects context from last 10 sessions using progressive disclosure. Trade-off: 60-90s latency per tool execution.

### Infrastructure Note: Hook Schema Update Required

Luca's hook schemas (`src/hooks/__schemas/hook.schemas.ts`) currently define only 5 events. Claude Code actually supports 18 events. Before implementing Phase 1, the hook schemas must be updated to include at minimum: `PreCompact`, `UserPromptSubmit`, `SubagentStop`, `Notification`. The `.claude/settings.json` registration is separate and can use any valid Claude Code event name regardless of Luca's schema — but updating the schema ensures type safety and discoverability.

---

## Implementation Plan

### Phase 1: PreCompact Checkpoint Hook (Priority: Critical)

**Files to create/modify:**

- `src/hooks/scripts/pre-compact-checkpoint.sh` — new PreCompact hook script
- `.claude/settings.json` — register PreCompact hook
- Update `context-check-throttled.sh` — add proactive checkpoint at 50% zone

**What it does:**

1. On PreCompact event, read transcript from `transcript_path`
2. Extract session state from `.planning/STATE.md` and bridge
3. Extract recent decisions from git log
4. Write 5-field checkpoint to MuninnDB (`session:checkpoint`)
5. Write fallback to `.planning/.context-checkpoint.json`

### Phase 2: SessionStart Restore Hook

**Files to create/modify:**

- `src/hooks/scripts/session-compact-restore.sh` — new SessionStart hook (matcher: `compact`)
- `.claude/settings.json` — register SessionStart hook with compact matcher

**What it does:**

1. On SessionStart with compact trigger, read `session:checkpoint` from MuninnDB
2. Format as structured systemMessage (~1KB)
3. Inject via systemMessage output

### Phase 3: /context-restore Skill

**Files to create/modify:**

- `src/skills/general/context-restore.skill.ts` — new skill
- Register in skill index

**What it does:**

1. Recall `session:checkpoint` from MuninnDB
2. Perform hub-and-spoke expansion (recall related engrams)
3. Present restored context with source attribution

### Phase 4: Observer Memory Bar

**Files to create/modify:**

- `packages/luca-observer/components/memory/context-window-bar.tsx` — new component
- `packages/luca-observer/app/api/context-metrics/route.ts` — new API route
- `packages/luca-observer/app/layout.tsx` — embed bar in header
- Update `context-check-throttled.sh` — write metrics JSON

### Phase 5: Compact Instructions + Documentation

**Files to modify:**

- `CLAUDE.md` — add Compact Instructions section
- `docs/memory-system/` — update architecture review with new decisions

---

## Decision Matrix (Final)

| Decision               | Choice                                                              | Confidence | Key Factor                                         |
| ---------------------- | ------------------------------------------------------------------- | ---------- | -------------------------------------------------- |
| Auto-store mechanism   | PreCompact hook (deterministic)                                     | **High**   | PreCompact event is real and hookable              |
| Auto-clear mechanism   | Not needed — Claude Code auto-compacts natively                     | **High**   | Auto-compact at ~83.5% is built-in                 |
| Checkpoint content     | 5-field MVP (~1.5KB)                                                | **High**   | "Store only what codebase can't tell you"          |
| Post-clear recall      | Layered: hook systemMessage + /context-restore skill + lu-cognition | **High**   | Different recovery depths for different scenarios  |
| Observer data pipeline | File-based (.context-metrics.json)                                  | **High**   | Simplest, lowest latency, no infrastructure        |
| Memory bar placement   | Header (always visible, compact)                                    | **High**   | Context is a system constraint, not a feature page |

---

## References

### Claude Code Hooks Documentation

- [Official hooks reference](https://code.claude.com/docs/en/hooks) — 18 event types including PreCompact
- [Context recovery hook guide](https://claudefa.st/blog/tools/hooks/context-recovery-hook)
- [Post-compaction hooks pattern](https://medium.com/@porter.nicholas/claude-code-post-compaction-hooks-for-context-renewal-7b616dcaa204)

### Industry Context Management

- **Cursor**: Auto-summarization + offload-to-disk + `/summarize` command
- **Windsurf**: Auto-summarization + AI-generated persistent Memories + multi-layer context assembly
- **Aider**: Repo map (PageRank) + weak-model summarization + explicit file management
- **Continue.dev**: RAG-based context providers + codebase indexing
- **MemGPT/Letta**: 4-tier virtual context (Core/Message/Recall/Archival) + LLM self-directed paging
- **Claude Code**: Auto-compact at ~83.5% + PreCompact hooks + CLAUDE.md persistence

### Academic Papers

- [Git Context Controller](https://arxiv.org/abs/2508.00031) — COMMIT/BRANCH/MERGE/CONTEXT ops, 13%+ SWE-Bench improvement
- [JetBrains "The Complexity Trap"](https://blog.jetbrains.com/research/2025/12/efficient-context-management/) — NeurIPS DL4Code 2025, observation masking vs summarization
- [MemGPT Paper](https://arxiv.org/abs/2310.08560) — Virtual memory for LLM agents
- [Agentic RAG Survey](https://arxiv.org/abs/2501.09136) — Autonomous strategy, iterative execution patterns

### Observer Visualization

- [SWR API Documentation](https://swr.vercel.app/docs/api) — refreshInterval, refreshWhenHidden, dedupingInterval
- [VS Code Status Bar UX Guidelines](https://code.visualstudio.com/api/ux-guidelines/status-bar) — compact indicator patterns
- [Carbon Design System: Status Indicators](https://carbondesignsystem.com/patterns/status-indicator-pattern/) — zone coloring, cognitive load

### Luca Architecture

- [Architecture Review](./architecture-review.md) — current state of all 4 layers
- [Gap Analysis](./gap-analysis.md) — identified gaps with options and research questions
