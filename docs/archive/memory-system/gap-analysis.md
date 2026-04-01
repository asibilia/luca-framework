# Memory System Gap Analysis & Discussion Points

> Identifies gaps between current state and desired capabilities. Each gap maps to a discussion point with options requiring research and decisions.

## Target Capabilities

1. **Smart context management** — Watch context usage, auto-store session memory to MuninnDB when context grows, auto-trigger `/compact` or `/clear` to keep context small
2. **Post-clear recall** — After clearing, recall previous relevant context so key details of working state are not lost
3. **Memory bar visualizer** — Observational "memory" bar in luca-observer showing real-time context state

## Gap Map

```
CURRENT                              TARGET
─────────                            ──────
Hooks warn at thresholds      →      Hooks auto-store + auto-clear
Session pause = filesystem    →      Session checkpoints = MuninnDB
No post-clear recall          →      Automatic context restoration
ContextUsageBar = vault stats →      Real-time context window bar
```

---

## Discussion Point 1: Auto-Store + Auto-Clear Mechanism

### The Problem

Context monitoring hooks (`context-check-throttled.sh`, `context-monitor.sh`) detect when context is degrading but only emit warnings. There is no automated action to:

- Store working context to MuninnDB before it becomes too large
- Trigger context compression or clearing

### Constraint: Claude Code API Limitations

Claude Code does not expose a programmatic API for `/compact` or `/clear` to hooks. Hooks can:

- Write files to disk
- Write to MuninnDB via HTTP
- Emit `systemMessage` (advisory text injected into conversation)
- Return exit codes

Hooks CANNOT:

- Invoke Claude Code slash commands
- Directly manipulate the conversation context
- Force a compact/clear operation

### Options Under Consideration

**Option A: systemMessage Directive**
When context enters "degrading" zone, the hook:

1. Auto-stores session state to MuninnDB (`session:checkpoint` engram)
2. Emits `systemMessage` instructing the LLM to run `/compact`

Pros: Simple, uses existing hook infrastructure
Cons: Advisory (LLM may not comply), interrupts flow

**Option B: Skill-Based Checkpoint**
Create a `/context-checkpoint` skill that:

1. Stores full working context to MuninnDB
2. Runs `/compact` (if Claude Code supports skill-to-command delegation)
3. After compact, recalls the checkpoint

Pros: Interactive, user-controlled
Cons: Manual trigger, doesn't solve auto-clear

**Option C: Hook Chain with Marker File**
When degrading zone detected:

1. Hook stores session state to MuninnDB
2. Hook writes `.planning/.compact-requested` marker
3. A PostToolUse prompt hook detects the marker and instructs LLM to compact
4. After compact, another hook detects cleared state and injects recalled context

Pros: Automated, hooks coordinate via filesystem
Cons: Complex, depends on prompt hook behavior

**Option D: Proactive Checkpointing (No Auto-Clear)**
Instead of auto-clearing, take proactive checkpoints:

1. At "good" zone (30-50%), auto-store first checkpoint to MuninnDB
2. At "degrading" zone (50-70%), store second checkpoint + warn user
3. At "stop" zone (70%+), store final checkpoint + strongly recommend manual clear

Pros: Non-disruptive, preserves user agency
Cons: Doesn't solve the core problem (context still grows)

### Research Questions

- Q1: Does Claude Code's `/compact` work reliably when invoked via LLM following a systemMessage? What are the edge cases?
- Q2: Can a prompt-type hook reliably trigger LLM behavior (like running /compact)?
- Q3: What data should be in a "context checkpoint" engram to enable full restoration?
- Q4: How do other AI coding tools handle context window management?

---

## Discussion Point 2: Post-Clear Context Recall

### The Problem

After `/compact` or `/clear`, the conversation context is compressed or reset. The LLM loses:

- Current task state (what we're working on, where we are)
- Decisions made this session
- Files modified and why
- The "mental model" — approach being taken
- Key code observations

Currently, `/session-resume` reads `.continue-here.md` files, but this is filesystem-based and not designed for mid-session recovery.

### Key Distinction: /compact vs /clear

| Operation  | Behavior                                          | Recovery Needed                                                    |
| ---------- | ------------------------------------------------- | ------------------------------------------------------------------ |
| `/compact` | Compresses prior messages, conversation continues | Partial — compressed messages lose detail, need key facts restored |
| `/clear`   | Resets conversation entirely                      | Full — everything must be recalled from MuninnDB                   |

### Options Under Consideration

**Option A: Post-Compact systemMessage Injection**
After compact completes, a hook detects the state change and injects recalled context via `systemMessage`:

1. Read `session:checkpoint` from MuninnDB
2. Format as structured context block
3. Inject via systemMessage on next PostToolUse

Pros: Automated, seamless
Cons: Detecting "compact just happened" is hard from hooks

**Option B: Skill-Based Recall (/context-restore)**
Create a `/context-restore` skill that:

1. Recalls latest `session:checkpoint` from MuninnDB
2. Recalls relevant long-term engrams (patterns, decisions relevant to current task)
3. Presents restored context to the LLM

Pros: Explicit, reliable, composable
Cons: Manual step after clearing

**Option C: Checkpoint-in-Compact Flow**
Modify the checkpoint mechanism to be part of the compact flow:

1. Before compact: auto-store to MuninnDB (via hook)
2. During compact: Claude Code compresses messages
3. After compact: the stored checkpoint is automatically injected as the first "remembered" context

Pros: Seamless experience
Cons: Requires compact to be hookable (pre/post)

### What Should a Checkpoint Contain?

Based on the lu-cognition session template, a checkpoint engram should include:

```markdown
## Context Checkpoint

### Session Info

- Phase: XX-name
- Task: 3 of 7
- Complexity: MODERATE
- Started: [timestamp]

### Current Work

- Goal: [what we're trying to achieve]
- Approach: [how we're doing it]
- Files touched: [list from git status]

### Key Decisions

- [Decision 1]: [rationale]
- [Decision 2]: [rationale]

### Important Findings

- [Finding 1]
- [Finding 2]

### Blockers / Open Questions

- [Question 1]

### Next Step

[Specific action to take next]
```

### Research Questions

- Q5: What is the hook event model around `/compact`? Is there a pre/post hook for compact?
- Q6: How much context can a systemMessage inject? Is there a size limit?
- Q7: What's the minimum viable checkpoint that preserves work continuity?

---

## Discussion Point 3: Observer Memory Bar Visualizer

### The Problem

The observer's `ContextUsageBar` shows MuninnDB vault statistics (engram count, coherence, storage), NOT the current session's context window usage. There is no visualization of:

- Real-time context window consumption
- Zone transitions over time
- Checkpoint events
- Session-to-memory correlation

### Data Pipeline Challenge

Context window metrics are computed in shell hooks (transcript file size), but the observer app runs as a separate Next.js process. There's no direct communication channel between:

- Claude Code hooks (compute context metrics)
- Observer app (displays visualizations)

### Options Under Consideration

**Option A: File-Based Metrics**
Hooks write context metrics to a JSON file (`.planning/.context-metrics.json`):

```json
{
  "timestamp": "2026-03-13T18:00:00Z",
  "transcript_bytes": 150000,
  "zone": "good",
  "usage_percent": 35,
  "checkpoints": [{ "timestamp": "...", "engram_id": "session:checkpoint-1" }]
}
```

Observer polls this file via an API route.

Pros: Simple, reliable, no new infrastructure
Cons: Polling latency, file I/O overhead

**Option B: MuninnDB Session Engrams**
Hooks write context metrics as `session:context-metrics` engrams to MuninnDB. Observer reads via existing `/api/muninn/session` endpoint.

Pros: Uses existing infrastructure, persists across sessions
Cons: Higher latency (MuninnDB round-trip), engram pollution

**Option C: Local Metrics Endpoint**
A lightweight Bun server that hooks write to and the observer reads from:

```
Hook → POST http://localhost:3457/metrics → Observer GET /api/metrics
```

Pros: Real-time, clean separation
Cons: New infrastructure to maintain, another port

**Option D: Hybrid (File + MuninnDB)**

- Hooks write metrics to file (real-time, for observer polling)
- Hooks also write checkpoints to MuninnDB (persistent, for historical view)
- Observer reads file for live bar, MuninnDB for historical timeline

Pros: Best of both worlds
Cons: Dual-write complexity

### Visualization Design

The memory bar could show:

```
Context Window Usage
┌────────────────────────────────────────────────┐
│██████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│ 35%
│ PEAK        │ GOOD       │ DEGRADING  │ STOP  │
└────────────────────────────────────────────────┘
  Checkpoint 1 ▲
  (10 min ago)

Session Timeline
┌──────────────────────────────────────────────┐
│ 📝 Start  → 🔍 Research → ✏️ Edit → 💾 CP1  │
│ 18:00       18:05         18:15     18:30    │
└──────────────────────────────────────────────┘
```

### Research Questions

- Q8: What polling interval gives acceptable UX for the memory bar?
- Q9: Should the memory bar be on its own page or embedded in the sidebar/header?
- Q10: What other metrics beyond context window usage should the bar show?

---

## Decision Matrix

| Decision               | Options                                 | Key Trade-off              | Research Needed |
| ---------------------- | --------------------------------------- | -------------------------- | --------------- |
| Auto-store trigger     | Degrading zone vs proactive checkpoints | Disruption vs safety       | Q1, Q2          |
| Auto-clear mechanism   | systemMessage vs skill vs hook chain    | Reliability vs simplicity  | Q1, Q2, Q5      |
| Checkpoint content     | Minimal vs comprehensive                | Token cost vs fidelity     | Q3, Q7          |
| Post-clear recall      | Auto-inject vs manual skill             | Seamlessness vs control    | Q5, Q6          |
| Observer data pipeline | File vs MuninnDB vs local server        | Latency vs complexity      | Q8              |
| Memory bar placement   | Sidebar vs page vs header               | Visibility vs screen space | Q9, Q10         |

## Next Steps

1. Research each discussion point (parallel research agents)
2. Make decisions based on findings
3. Document decisions in `docs/memory-system/decisions.md`
4. Create implementation plan
