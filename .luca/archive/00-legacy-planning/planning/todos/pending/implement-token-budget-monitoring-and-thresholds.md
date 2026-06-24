---
title: "Implement token budget monitoring with threshold-based interventions"
area: architecture
created: 2026-04-13
priority: high
source: research
sprint: 5
---

## Task

Build a `TokenBudgetMonitor` that tracks cumulative token usage from API responses and triggers interventions (reminder injection, observation masking, compaction, blocking) at configurable thresholds.

## Context

luca-mastracode tracks context metrics in `.context-metrics.json` and has a quality degradation curve documented in CLAUDE.md (0-30% peak, 70%+ poor), but there is zero runtime token budget monitoring. Claude Code uses a four-threshold "soft landing" hierarchy (warning at 20K remaining, auto-compact at 13K, error at 20K, hard block at 3K) with tiered estimation (API-based, Haiku fallback, character heuristic).

## Research References

- [07-context-compaction-and-memory.md](../../docs/research/prompt-architecture/07-context-compaction-and-memory.md) — Token budgeting approaches, Claude Code's thresholds
- [01-cache-boundary-design.md](../../docs/research/prompt-architecture/01-cache-boundary-design.md) — Cache hit rate monitoring
- [09-instruction-budget-and-prompt-economics.md](../../docs/research/prompt-architecture/09-instruction-budget-and-prompt-economics.md) — Context budget math
- [10-final-actionable-review.md](../../docs/research/prompt-architecture/10-final-actionable-review.md) — Sprint 5, item 5.2

## Implementation

**New file:** `packages/luca-mastracode/src/token-budget.ts`

```typescript
interface BudgetState {
  totalInputTokens: number
  totalOutputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  turnsCompleted: number
  toolCallsCompleted: number
  lastCacheHitRate: number
  currentUtilization: number  // estimated % of context window used
}

const THRESHOLDS = {
  INJECT_REMINDERS: 0.30,    // Start context rot remediation
  OBSERVATION_MASK: 0.50,    // Start masking old tool results
  WARNING: 0.65,             // Alert user, suggest mode boundary
  COMPACTION: 0.80,          // Trigger LLM summarization
  BLOCK: 0.90,               // Block new tool calls, require intervention
}
```

Integration with harness events for usage tracking. Feeds into context-refresher (Sprint 4) and compaction pipeline (if implemented).

## Dependencies

- Benefits from mid-conversation injection infrastructure (Sprint 4) for threshold-triggered interventions
- Benefits from cache boundary (Sprint 5) for cache hit rate monitoring
- Can be implemented independently with character-count heuristic as initial estimator

## Files Changed

- `packages/luca-mastracode/src/token-budget.ts` (NEW)
- `packages/luca-mastracode/src/index.ts` — Wire into harness event subscription

## Constraints

- Start with character-count heuristic (~1 token per 4 chars, ~20% error margin)
- Use conservative thresholds to account for estimation error
- Add circuit breaker for cascading interventions
