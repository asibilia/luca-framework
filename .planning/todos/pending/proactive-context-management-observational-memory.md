---
title: "Proactive context management: Mastra-inspired observational memory for Claude Code"
area: hooks/memory
created: 2026-03-14
source: conversation
---

## Context

Claude Code auto-compacts when the context window is nearly full, which is slow (minutes at high usage) and lossy (happens at arbitrary points, losing key details mid-workflow). We want to adopt Mastra AI's "observational memory" philosophy: continuously capture important context to MuninnDB so we can maintain a lean, effective rolling context and recover fully after any context reset.

Mastra's system uses four memory layers (message history, working memory, semantic recall, observational memory) so they never need compaction — their Observer LLM incrementally compresses messages into dense observations, replacing raw messages as context grows. We can't replicate this exactly (Claude Code owns the context window), but we can adapt the pattern.

**Reference**: https://mastra.ai/docs/memory/overview, https://mastra.ai/docs/memory/observational-memory

## Hard Constraints (Claude Code Limitations)

| Capability                          | Available? | Notes                                             |
| ----------------------------------- | ---------- | ------------------------------------------------- |
| Trigger `/compact` programmatically | No         | Hooks are observability-only                      |
| Trigger `/clear` programmatically   | No         | User-initiated only                               |
| Set custom compaction threshold     | No         | No config for this                                |
| Control what gets compacted         | Partial    | CLAUDE.md "Compact Instructions" (best-effort)    |
| Observe compaction/clear events     | Yes        | PreCompact hook, SessionStart/SessionEnd matchers |
| Inject context after reset          | Yes        | SessionStart hook → systemMessage                 |
| Write to MuninnDB from hooks        | Yes        | REST API, fire-and-forget                         |
| Read real context usage %           | Yes        | statusLine API (already implemented)              |
| Suggest actions via systemMessage   | Yes        | Any hook can output systemMessage                 |

**Bottom line**: We can't control WHEN context resets, but we can control what's SAVED before and RESTORED after.

## Adapted Strategy: "Observe Continuously + Clear + Restore"

1. **Continuously observe** → Write findings/decisions/context to MuninnDB throughout sessions (not just at compaction boundaries)
2. **Proactively suggest `/clear`** → When context hits 40-50%, prompt user to clear at a natural breakpoint
3. **Instantly restore** → After `/clear`, SessionStart hook + MuninnDB recall rebuilds working context in seconds
4. **Dynamic compact instructions** → If auto-compaction happens instead, guide what's preserved

Key insight: **`/clear` is instant** (vs minutes for `/compact`), and if MuninnDB has everything important, nothing is lost.

## What Already Exists (Production-Ready)

- MuninnDB two-vault architecture with semantic recall + 7-signal composite scoring
- Cognitive pre-flight (lu-cognition) with tier-scaled recall and brain tree loading
- PreCompact checkpoint → filesystem + MuninnDB dual-write
- SessionStart restore → injects systemMessage with position/branch/files/commits
- `/context-restore` skill → deep semantic recall from MuninnDB (manual Layer 2)
- statusLine script → real token data (usage_percent, token counts) to `.context-metrics.json`
- context-check-throttled → reads metrics every 60s, proactive checkpoint on zone worsening
- Learning capture (lu-learner) → extracts patterns/decisions/pitfalls after verification
- Session digest + memory context builder → token-budgeted memory injection
- 7 untapped hook events: `user_prompt_submit`, `subagent_start`, `subagent_stop`, `post_tool_use_failure`, `task_completed`, `teammate_idle`, `notification`

## Task: Five Components to Implement

### Component 1: Continuous Session Observer (THE BIG NEW THING)

A mechanism that periodically writes "observations" to MuninnDB during active work — capturing what's being done, decisions made, findings discovered, files touched.

**Recommended approach — Hybrid (Hook + Prompt layers):**

- **Hook layer (deterministic)**: Extend `context-check-throttled.sh` to write observations on zone transitions — captures file changes, git activity, context metrics automatically
- **Prompt layer (LLM-driven)**: At zone transitions (peak→good, good→degrading), inject systemMessage asking the LLM to write a session observation summarizing current work, decisions, and approach via `mcp__muninn__muninn_remember`

Alternative approaches considered:

- Hook-only: Deterministic but limited (can't see conversation content)
- Prompt-only: Best quality but relies on LLM compliance
- Subagent: Can't read parent conversation history

**Research needed:**

- Can a systemMessage from a hook reliably cause the LLM to call MuninnDB tools?
- What's the right observation frequency? (Mastra: every ~6K tokens / 20% of threshold)
- Should observations append new engrams or update a rolling one?
- What's the token overhead of periodic MuninnDB writes?

### Component 2: Proactive Clear Prompting

When context crosses a threshold (configurable, default ~40-50%), inject a systemMessage suggesting `/clear` at the next natural breakpoint.

```
[Context Management] Context at 42%. Consider running /clear when you reach a natural
stopping point. Session observations saved to MuninnDB — context will be fully restored.
```

**Research needed:**

- Can the LLM invoke `/clear` itself? (Would enable full automation)
- Should we suggest `/clear` or `/compact`? (If restore is good enough, `/clear` is better — instant vs minutes)
- What's the right threshold? Configurable per model?
- Should we only suggest at natural breakpoints (after commits, phase completion)?

### Component 3: Enhanced Restore After Clear

When SessionStart fires after `/clear`, pull recent observations from MuninnDB and inject a rich "working context" — not just position, but current goal, approach, decisions, recent files, recalled patterns.

Target restore message (~3-5KB):

```
[Context Restored] Fresh session after clear.

## Working Context (from MuninnDB)
- Goal: {current task goal}
- Approach: {current approach}
- Key decisions: {recent decisions with rationale}
- Recent files: {files being worked on}
- Blockers: {any open blockers}

## Recalled Patterns
- {relevant patterns for current work}

## Known Pitfalls
- {pitfalls relevant to current area}

MuninnDB vault: luca-framework | Run /context-restore for deeper recall.
```

**Research needed:**

- Does PreCompact fire on `/clear`? (If not, need separate save mechanism before clear)
- Can we detect `/clear` vs fresh session in SessionStart? (Need to distinguish restore from cold start)
- What's the max systemMessage size Claude Code handles gracefully?

### Component 4: Dynamic Compact Instructions

Replace static CLAUDE.md compact instructions with dynamically updated content based on current work. Since CLAUDE.md is source-controlled, use a runtime file:

- Create `.planning/.compact-context.md` (gitignored, updated by hooks)
- CLAUDE.md references it: "When compacting, read `.planning/.compact-context.md` and preserve its contents"
- Hooks update it on zone transitions, phase changes, significant work milestones

**Research needed:**

- Does Claude Code re-read CLAUDE.md before each compaction, or is it cached from session start?
- Can compact instructions reference external files?
- Is the `custom_instructions` field in PreCompact stdin usable?

### Component 5: Untapped Hook Events

Wire new hooks for proactive memory capture:

| Event                   | Hook Use                                                | Priority |
| ----------------------- | ------------------------------------------------------- | -------- |
| `user_prompt_submit`    | Snapshot context + flush observations before user input | HIGH     |
| `subagent_stop`         | Capture subagent findings into session observations     | MEDIUM   |
| `post_tool_use_failure` | Record error patterns for pitfall learning              | MEDIUM   |
| `task_completed`        | Record task metrics + learnings                         | MEDIUM   |
| `teammate_idle`         | Trigger async memory consolidation                      | LOW      |

## Research Questions (Must Resolve Before Implementation)

### Critical

1. **Can the LLM invoke `/clear` itself?** Determines if we can automate the clear+restore cycle
2. **Does PreCompact fire on `/clear`?** Determines if existing checkpoint mechanism covers clear
3. **Can a systemMessage reliably cause the LLM to call MuninnDB tools?** Determines if prompt-based observation works
4. **Does Claude Code re-read CLAUDE.md on compaction?** Determines if dynamic compact instructions are viable

### Important

5. **Token overhead of periodic MuninnDB writes?** (~500-1000 tokens per `muninn_remember` call)
6. **Optimal observation frequency?** (Mastra: every 20% of threshold)
7. **Can we detect `/clear` vs fresh session in SessionStart?** (Session lock file presence?)

### Nice to Have

8. **Can `subagent_start` hooks inject memory context?** (Auto memory for all subagents)
9. **Max systemMessage size?** (Determines restore budget)

## Proposed Implementation Phases

### Phase 1: Research Spike

- Test critical questions 1-4 above
- Document findings for each
- Decide which components are viable

### Phase 2: Continuous Session Observer

- Implement hybrid observer (hook + prompt layers)
- Define observation schema and MuninnDB concept naming (`session:observation-*`)
- Hook layer: extend context-check-throttled for zone transition observations
- Prompt layer: inject observation request systemMessage at thresholds

### Phase 3: Proactive Clear Prompting

- Add clear suggestion at configurable threshold
- Integrate with zone transition logic
- Smart timing for natural breakpoints

### Phase 4: Enhanced Clear/Restore

- Detect `/clear` in SessionStart hook
- Pull recent observations from MuninnDB
- Build rich restore message (3-5KB working context)
- Ensure works for both `/clear` and `/compact` paths

### Phase 5: Dynamic Compact Instructions

- Create `.planning/.compact-context.md` runtime file
- Hook updates based on current work
- CLAUDE.md references it in compact instructions section

## Success Criteria

- [ ] No false context warnings (already done via statusLine)
- [ ] Context resets take seconds, not minutes (`/clear` + instant MuninnDB restore)
- [ ] Zero important context lost (continuous observations ensure MuninnDB has everything)
- [ ] Lean context window (proactive clearing keeps usage below 50% during typical workflows)
- [ ] Transparent to user (system manages context; user only sees results)

## Mastra Architecture Reference

| Mastra Layer         | Purpose                                                         | Luca Equivalent                        | Status                        |
| -------------------- | --------------------------------------------------------------- | -------------------------------------- | ----------------------------- |
| Message History      | Last N raw messages                                             | Claude Code manages                    | No control                    |
| Working Memory       | Structured scratchpad (JSON/md)                                 | STATE.md + session:context engrams     | Exists, needs dynamic updates |
| Semantic Recall      | RAG over older messages                                         | MuninnDB dual-vault + 7-signal scoring | Production-ready              |
| Observational Memory | Background LLM compresses messages → observations → reflections | **Not yet implemented**                | THE MAIN GAP                  |

## Notes

- Mastra claims 5-40x compression from their Observer agent. Our hook-based observations will be less rich (no conversation content access), but the prompt-based layer compensates.
- The `/clear` + restore approach is arguably BETTER than Mastra's for our use case — we get a completely fresh context with only what matters injected, rather than carrying forward compressed observations that still consume tokens.
- The existing checkpoint/restore infrastructure (phases 153-157) provides the foundation. This todo extends it from reactive (only at compaction boundaries) to proactive (continuous throughout sessions).
- Token budget for restore: Mastra's observations are ~2-5KB. Our restore should target similar — enough for working context but not so much that it consumes the fresh context we just freed.
