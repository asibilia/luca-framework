---
title: "Memory Effectiveness Measurement: Prove MuninnDB Improves Outcomes"
area: framework/memory
created: 2026-03-10
source: conversation
priority: P1
complexity: COMPLEX
---

## Context

We have no way to answer: "Is MuninnDB actually improving accuracy, lowering cost, or providing useful observability?" The memory system is write-heavy and read-feedback-poor. lu-learner captures high-quality engrams, lu-cognition recalls and injects them — but nothing measures whether recalled memories were used, helpful, or worth the token cost.

Key evidence:

- `mcp__muninn__muninn_feedback()` exists in MuninnDB API but is **never called**
- 0 agents track whether recalled patterns were applied
- No recall precision, hit rate, or ROI metrics exist
- ~40% of recalled data is estimated unused (noise)
- Confidence levels never update based on effectiveness
- Todo #95 (Close Learning Loop) was marked done but Phases B (MEASURE) and C (REFINE) were never implemented

## Objectives

All measurement must serve three goals:

1. **HIGHER ACCURACY** — Prove recalled memories improve task success rate
2. **LOWER COST** — Prove memory token spend has positive ROI
3. **USEFUL OBSERVABILITY** — Surface actionable memory health metrics

## Task

### Phase 1: Instrument Feedback Loop (MEASURE)

Wire `muninn_feedback` into the verification boundary so we start collecting data.

1. **Post-verification feedback in phase-execute:**
   - After lu-verifier completes, iterate recalled engram IDs from session cache
   - For each recalled engram, call `mcp__muninn__muninn_feedback(engram_id, useful)`:
     - `useful: true` if engram was referenced in executor output OR verification passed
     - `useful: false` if engram was recalled but never referenced and task had issues
   - Store feedback results in session findings

2. **Pattern application tracking in lu-executor:**
   - When lu-executor receives memory context, log which engram IDs were injected
   - After execution, check if executor output references any recalled pattern/pitfall/decision
   - Write `applied_engrams: [ids]` and `ignored_engrams: [ids]` to session findings

3. **Cost tracking:**
   - Estimate token cost of `<memory_context>` blocks injected into sub-agents
   - Log `memory_tokens_injected` per phase in session findings
   - Compare against total phase token spend for ratio

Files to modify:

- `src/skills/general/phase-execute.skill.ts` — add feedback step after verification
- `src/agents/luca/lu-executor.agent.ts` — add applied/ignored tracking instructions
- `src/shared/__helpers/memory-context-builder.ts` — add token estimation to output
- `src/shared/__helpers/recall-cache.ts` — store engram IDs for feedback lookup

### Phase 2: Metrics Dashboard (OBSERVE)

Compute and surface memory effectiveness metrics.

4. **Memory effectiveness metrics (lu-process-data or new helper):**
   - **Recall Precision**: `useful_feedbacks / total_feedbacks` (target: > 60%)
   - **Hit Rate**: `applied_engrams / recalled_engrams` (target: > 40%)
   - **Memory ROI**: `quality_delta / memory_token_ratio` (target: positive)
   - **Stale Memory %**: `entries_recalled_5x_never_applied / total_entries` (target: < 20%)
   - **Confidence Calibration**: `high_confidence_success_rate` should exceed `low_confidence_success_rate`

5. **Surface in progress/milestone reports:**
   - Add memory health section to `/progress` skill output
   - Add memory effectiveness summary to milestone-complete skill
   - Store aggregate metrics as `metric:memory-*` engrams in MuninnDB

### Phase 3: Confidence Evolution (REFINE)

Use collected feedback to improve memory quality over time.

6. **Confidence updates based on feedback:**
   - After 3+ positive feedbacks: `mcp__muninn__muninn_evolve()` to bump confidence
   - After 3+ negative feedbacks: demote confidence
   - After 5+ recalls with 0 applications: flag as noise candidate

7. **Stale memory pruning:**
   - In milestone-complete skill: identify entries with LOW confidence after 3+ milestones
   - Archive via `mcp__muninn__muninn_evolve()` with status: "deprecated"
   - Run `mcp__muninn__muninn_consolidate()` to merge near-duplicates

8. **Recall scoring rebalance:**
   - Feed effectiveness data back into lu-cognition scoring weights
   - Entries with high feedback scores get scoring bonus
   - Entries flagged as noise get scoring penalty

Files to modify:

- `src/agents/general/lu-learner.agent.ts` — confidence evolution logic
- `src/agents/general/lu-cognition.agent.ts` — scoring rebalance from feedback
- `src/skills/general/milestone-complete.skill.ts` — consolidation + pruning step
- `src/skills/general/progress.skill.ts` — memory health section

## Success Criteria

- [ ] `muninn_feedback()` called after every phase verification
- [ ] Applied vs ignored engram tracking in executor output
- [ ] Memory token cost logged per phase
- [ ] 5 effectiveness metrics computed and surfaced
- [ ] Confidence updates driven by feedback data (not manual)
- [ ] Stale memory detection and pruning at milestone boundaries
- [ ] Can answer "is memory helping?" with data, not intuition

## Notes

- Supersedes #95 Phases B and C (which were planned but never implemented)
- Synergizes with #18 (semantic embeddings) — better recall precision = higher hit rate
- Phase 1 is the minimum viable measurement — ship this first, iterate on 2-3
- Estimated effort: Phase 1 (6-8h), Phase 2 (4-6h), Phase 3 (6-8h)
- Gate to COMPLEX+ initially to avoid overhead on trivial tasks
