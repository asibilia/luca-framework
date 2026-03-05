---
title: Align context pruning with domain architecture
area: architecture
created: 2026-03-05
source: v2.8.0 done-todo audit (partial: 04-context-pruning-extensions)
---

## Context

Todo `04-context-pruning-extensions` was marked done but is only partially implemented. The pruning logic exists but lives in the wrong domain and is missing specified schema/API artifacts.

## Partial Completion

The following WAS implemented:

- Context pruning logic in `src/memory/__helpers/context-pruning.ts`
- Pruning strategies and compression integration

## Gaps

The following was NOT implemented:

- `ContextPruningConfigSchema` in `src/context/__schemas/` — pruning config is not defined as a Zod schema in the context domain
- `digestEnvelope` in `src/context/__helpers/result-envelope.ts` — no digest/summary function for result envelopes
- Pruning logic lives in `memory/` (T1) instead of `context/` (T1) as originally specified — may be intentional (pruning is memory-adjacent) but diverges from the todo's design

## Task

1. Decide: should pruning stay in `memory/` or move to `context/`? (Both are T1, so no tier violation either way)
2. If staying in `memory/`: close this todo as "by design"
3. If moving to `context/`: migrate pruning helpers and add `ContextPruningConfigSchema`
4. Evaluate whether `digestEnvelope` is still needed or was superseded by compression strategies

## Notes

Original todo referenced v2.5.0 milestone. The pruning feature works correctly — this is a domain placement question, not a functionality gap.
