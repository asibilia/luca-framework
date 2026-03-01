---
title: "Context Pruning Extensions"
area: framework/context
created: 2026-03-01
source: expert-panel-research
tier: 1
complexity: MODERATE
moat: Medium
---

## Context

Nader's blog describes context pruning via extensions that drop large tool results older than N messages. Pi's auto-compaction pattern triggers automatically near context limits.

## Task

Auto-prune stale ResultEnvelopes when context fills. Older envelopes get digested to one-line summaries. Triggers at "degrading" zone (50-70%). Invisible to the LLM — pure middleware. Never prune most recent N envelopes (configurable, default 3).

**Implementation:**

- Add ContextPruningConfigSchema to `src/context/__schemas/context.schemas.ts`
- New: `src/context/__helpers/context-pruner.ts` — pruning logic
- Add digestEnvelope function to `src/context/__helpers/result-envelope.ts`
- Integrate into shouldCompress in `src/memory/__helpers/context-monitor.ts`
- Prune before aggregation in `src/context/__helpers/result-aggregator.ts`

## Notes

- Source agent: Intelligence Expert
