# Decision: Orchestrator context pruning after sub-agent completion

**Date:** 2026-03-06
**Status:** Accepted (interim — to be superseded by structured context-budget system)
**Scope:** `src/skills/general/phase-execute.skill.ts` (Step 5.2)

## Context

The phase-execute orchestrator spawns parallel lu-executor sub-agents per wave. Each sub-agent can return 50-100k+ tokens of output. After a wave of 3 agents, the orchestrator accumulates ~200k+ tokens of sub-agent results in its context window.

The orchestrator still has 6+ steps to complete after wave execution:

1. Aggregate results (Step 5)
2. Commit orchestrator corrections (Step 6)
3. Run verification harness (Step 6.5)
4. Harness fix loop if needed (Step 6.6)
5. Agent verification — lu-verifier (Step 7)
6. Code review agents (Step 8)
7. Learning capture — lu-learner (Step 9)
8. State/roadmap updates (Step 10)

With ~200k tokens of raw sub-agent output, the orchestrator's context hits the 70%+ degradation zone. At this point, the model either freezes (appears stuck at "Determining...") or produces severely degraded output.

## Problem Observed

Sessions freeze after parallel sub-agents complete:

```
Running 3 agents...
 ├─ Execute plan 01-01 · 24 tool uses · 61.5k tokens
 ├─ Execute plan 01-02 · 18 tool uses · 51.7k tokens
 └─ Execute plan 01-03 · 24 tool uses · 101.9k tokens

· Determining... (9m 37s · ↓ 11.5k tokens)
```

The orchestrator never recovers — the session must be killed and restarted.

## Decision

Add Step 5.2 ("Prune Sub-Agent Output") to phase-execute with these rules:

1. Parse each sub-agent result into the envelope format (status, summary, artifacts, issues)
2. Truncate summary to max 500 chars
3. Keep only severity + message for issues (max 10)
4. Keep only file paths for artifacts (not content)
5. **Discard the full raw output** — do not reference it in subsequent steps
6. Build a compact phase summary table for downstream agents

This is a **prompt-level instruction** — it tells the orchestrator (the LLM) how to manage its own working context. It does not involve code changes beyond the skill definition.

## Why This Is Interim

This approach has limitations:

1. **Not enforced mechanically** — the orchestrator _should_ follow the pruning instructions, but it's an LLM following a prompt, not a hard constraint
2. **No token accounting** — we don't measure how much context the raw output actually consumes
3. **No adaptive behavior** — the pruning is always the same regardless of how much context remains
4. **Sub-agent output format varies** — some agents return structured JSON, others return plain text with tool call results interleaved

## Future: Structured Context-Budget System

The proper fix is a context-budget system that:

1. **Measures** context usage after each wave (via context-monitor or transcript size)
2. **Enforces** output size limits on sub-agents before they return (e.g., max 2000 chars returned to orchestrator)
3. **Persists** full sub-agent output to disk (e.g., `.planning/agent-results/{plan-id}.json`) so it's available for debugging without consuming context
4. **Adapts** pruning aggressiveness based on remaining context budget and number of remaining steps

### Migration checklist for future context-budget work

When implementing the structured system, update these locations:

- [ ] `src/skills/general/phase-execute.skill.ts` — Replace Step 5.2 manual pruning with reference to context-budget API
- [ ] Sub-agent Task() prompts — Add output size constraints (e.g., "Return a summary under 2000 chars. Write full details to {output_path}")
- [ ] `src/memory/__helpers/context-monitor.ts` — Expose context usage to the orchestrator between steps (not just at Stop events)
- [ ] Consider a `src/context/__helpers/budget.ts` utility that the orchestrator calls between steps to decide pruning level
- [ ] Update the suspend/resume logic (Step 4.5) to use actual context measurements instead of zone heuristics

### Design principles for the future system

1. **Disk is cheap, context is expensive** — Always persist full output to disk, only load summaries into context
2. **Orchestrator stays lean** — The orchestrator's job is coordination, not data retention
3. **Sub-agents own their output** — Each sub-agent writes its own SUMMARY.md; the orchestrator reads only that
4. **Measure, don't guess** — Use actual token counts or transcript byte sizes, not heuristics

## Consequences

### Immediate (this change)

- Orchestrator is less likely to freeze after parallel sub-agent completion
- Some detail from sub-agent output is lost in the orchestrator's context (but SUMMARY.md files on disk retain full detail)
- Downstream agents (verifier, reviewers) receive compact summaries instead of full execution logs

### When superseded

- This Step 5.2 instruction becomes unnecessary and should be removed
- The migration checklist above tracks all touch points
