# Phase 162 Context: Proactive Context Management

## Research Question Answers

### Q1: Can the LLM invoke /clear itself? [resolved]

**Answer: NO.** The Hard Constraints table in the todo confirms: "Trigger `/clear` programmatically: No — User-initiated only." This means we cannot automate the clear+restore cycle. Component 2 can only SUGGEST /clear via systemMessage.

### Q2: Does PreCompact fire on /clear? [assumption]

**Answer: Likely NO.** `/clear` is instant (resets the conversation), while PreCompact is specifically for compaction (summarization). Assume they are separate events. **Implementation impact:** Need a separate save mechanism before /clear — the prompt-based observation in Component 1 serves this role (LLM writes observations continuously, so MuninnDB always has recent context regardless of whether PreCompact fires).

### Q3: Can systemMessage trigger MuninnDB writes? [assumption]

**Answer: YES, best-effort.** Claude Code always surfaces systemMessage to the LLM. The LLM CAN call MuninnDB tools in response. However, compliance is not guaranteed — the LLM may prioritize the user's request over the systemMessage instruction. **Implementation impact:** Use this for observation prompts but don't depend on it for critical saves. The deterministic hook layer (file writes + MuninnDB REST calls) provides the guaranteed persistence.

### Q4: Does CLAUDE.md re-read on compaction? [resolved]

**Answer: YES.** CLAUDE.md is loaded as system context on every conversation turn (per system-reminder pattern). Dynamic compact instructions in CLAUDE.md will be picked up. However, an EXTERNAL file referenced from CLAUDE.md may not be re-read unless it's in a watched directory.

## Decision 1: Phasing Within This Phase [researched]

**Decision:** Split into 3 internal waves (simplified from the todo's 5 proposed phases):

| Wave | Components                                                                     | Rationale                                                       |
| ---- | ------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| 1    | Continuous observer (Component 1) + Dynamic compact instructions (Component 4) | Core value — deterministic hook observations + compact guidance |
| 2    | Proactive clear prompting (Component 2) + Enhanced restore (Component 3)       | Requires Component 1 observations to exist for restore content  |
| 3    | Wire untapped hook events (Component 5)                                        | Additive, independent of the other components                   |

The research spike (Phase 1 from the todo) is NOT a separate wave — the questions are resolved above. If empirical validation shows assumptions wrong, the implementation can adapt.

## Decision 2: Continuous Observer Design [researched]

**Decision:** Hybrid approach exactly as described in the todo:

1. **Hook layer (deterministic):** Extend `context-check-throttled.ts` (now TypeScript from Phase 160) to write observations on zone transitions:
   - Git diff summary (files changed since last observation)
   - Current branch, phase, task context from STATE.md
   - Context metrics snapshot (usage%, zone, tokens)
   - Write to MuninnDB: `session:observation-{timestamp}` engram

2. **Prompt layer (best-effort):** On zone transitions (peak→good, good→degrading), inject systemMessage:
   ```
   [Session Observer] Context at {X}%. Please write a brief observation of your current work to MuninnDB:
   mcp__muninn__muninn_remember(vault: "luca-framework", concept: "session:observation-work", content: "[brief summary of current goal, approach, and recent decisions]")
   ```

**Observation frequency:** On zone transitions only (not periodic). This is 3-5 observations per session, not continuous polling. Minimal token overhead.

**Schema:** New Zod schema `SessionObservationSchema` in `src/hooks/__schemas/` (T3, internal to hooks domain).

## Decision 3: Proactive Clear Prompting [researched]

**Decision:** Inject systemMessage at configurable threshold (default: 42%, matching the todo example). The message suggests `/clear` but does NOT invoke it (Q1 confirmed: user-initiated only).

**Trigger logic:** In `context-check-throttled.ts`, when zone transitions to "degrading" (configurable):

- First crossing: suggest `/clear` with confidence message
- Subsequent crossings: escalate urgency
- After commit/phase boundary: stronger suggestion

**Configuration:**

```json
{
  "context_management": {
    "clear_suggestion_threshold": 42,
    "clear_suggestion_enabled": true
  }
}
```

## Decision 4: Enhanced Restore [researched]

**Decision:** Extend `session-start.ts` (now TypeScript from Phase 160) to detect post-clear sessions and build a rich restore message:

**Detection:** Check for `.planning/.session-end-marker.json` (written by session-persist hook). If present AND session was recently ended (< 5 min ago), this is likely a clear+restart. Also check MuninnDB for recent `session:observation-*` engrams.

**Restore message target:** 3-5KB containing:

- Current goal and approach (from most recent observation)
- Key decisions (from session observations)
- Recent files touched (from git diff)
- Active phase/task context (from STATE.md)
- Recalled patterns (from MuninnDB)

## Decision 5: Dynamic Compact Instructions [researched]

**Decision:** Add a section to CLAUDE.md that references dynamic content:

```markdown
## Compact Instructions

When compacting, preserve:

- Current phase, task position, and complexity level
- Key decisions made this session with rationale
- The current approach and next planned action
- Any blockers or open questions
- File paths recently modified and why
- The MuninnDB vault name (luca-framework)
```

This is STATIC content in CLAUDE.md (already partially present). The dynamic `.planning/.compact-context.md` approach is deferred — the static instructions combined with continuous MuninnDB observations provide sufficient coverage without the complexity of a runtime file.

## Decision 6: Hook Event Wiring [researched]

**Decision:** Wire 3 HIGH/MEDIUM priority events (defer LOW priority):

| Event                   | Hook Implementation                       | Priority |
| ----------------------- | ----------------------------------------- | -------- |
| `user_prompt_submit`    | Flush latest observation to MuninnDB      | HIGH     |
| `subagent_stop`         | Capture subagent summary as observation   | MEDIUM   |
| `post_tool_use_failure` | Record error pattern for pitfall learning | MEDIUM   |

Defer: `task_completed` and `teammate_idle` (LOW priority, can add in future phase).

## Scope

- Extend `context-check-throttled.ts` with observation logic
- Extend `session-start.ts` with enhanced restore
- Create new hook implementations for 3 untapped events
- Add `context_management` config section
- Update CLAUDE.md compact instructions
- Add observation schema to hooks domain

## Verification

- `bunx --bun tsc --noEmit` — validates all TypeScript changes
- Manual: trigger zone transition and verify observation written to MuninnDB
- Manual: run `/clear` and verify enhanced restore message appears
- Manual: verify clear suggestion appears at configured threshold
