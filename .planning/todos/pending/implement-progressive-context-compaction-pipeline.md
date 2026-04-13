---
title: "Implement progressive 3-level context compaction pipeline"
area: architecture
created: 2026-04-13
priority: high
source: research
sprint: 5
---

## Task

Build a 3-level progressive compression pipeline (tool result budgeting, observation masking, LLM summarization) to manage context window utilization and prevent quality degradation in long sessions.

## Context

luca-mastracode has zero active context management. Claude Code implements a 5-level compression pipeline with micro-compaction preserving cache hits and a circuit breaker preventing runaway compaction (added after discovering 1,279 sessions with up to 3,272 consecutive failures wasting ~250K API calls/day).

JetBrains Research found that simple observation masking (replacing old tool outputs with placeholders) outperforms LLM summarization in 4/5 configurations — 2.6% higher solve rates and 52% cost reduction. This means Level 2 is more important than Level 3.

## Research References

- [07-context-compaction-and-memory.md](../../docs/research/prompt-architecture/07-context-compaction-and-memory.md) — Full analysis: 5-level pipeline, micro-compaction, circuit breaker, JetBrains research
- [01-cache-boundary-design.md](../../docs/research/prompt-architecture/01-cache-boundary-design.md) — Cache-aware compaction, Context Editing API
- [10-final-actionable-review.md](../../docs/research/prompt-architecture/10-final-actionable-review.md) — Sprint 5, item 5.3

## Implementation

### Level 1: Tool Result Budgeting (zero API cost)

```
- Cap tool results at 50K chars
- Persist full output to .planning/tool-results/{hash}.md
- Keep 2KB preview in context with note: "[Full result saved to disk — re-read if needed]"
- Triggered: every tool result
```

### Level 2: Observation Masking (zero API cost)

```
- Replace older tool results with "[Result cleared — re-read if needed]"
- Preserve agent reasoning and action history
- Keep last N tool results (configurable: 5 for execute, 3 for review)
- Triggered: at 50% context utilization (from token budget monitor)
```

### Level 3: LLM Summarization (expensive, last resort)

```
- Fork a Haiku subagent to summarize conversation
- Chain-of-thought in <analysis> tags, then strip reasoning before re-injection
- Circuit breaker: MAX_CONSECUTIVE_FAILURES = 3
- Triggered: at 80% context utilization
```

### New Files

- `packages/luca-mastracode/src/context-pipeline.ts` — Pipeline orchestrator
- `packages/luca-mastracode/src/tool-result-budget.ts` — Level 1
- `packages/luca-mastracode/src/subagents/summarizer.ts` — Level 3 (Haiku model)

## Dependencies

- Level 1-2 require intercepting tool results before they enter conversation (verify Mastra support)
- Level 3 requires the Haiku-model summarizer subagent
- Token budget monitor (separate todo) provides the utilization triggers
- Cache boundary (separate todo) ensures Levels 1-2 don't invalidate cached prefix

## Constraints

- Implement Level 1 first (highest impact, zero cost)
- Implement Level 2 second (JetBrains validates it outperforms Level 3)
- Level 3 is a fallback — only implement if Levels 1-2 prove insufficient for COMPLEX+ tasks
- Always persist full results to disk (Level 1) so the agent can re-read via workspace tools
