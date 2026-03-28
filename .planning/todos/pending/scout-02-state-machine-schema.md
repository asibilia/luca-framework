---
title: "Scout: Create state machine schema and transition validator"
area: scouting
created: 2026-03-28
source: conversation
tags: [scout, foundation, phase-1]
---

## Context

The anti-step-skipping research (docs/research/anti-step-skipping/) is emphatic: enforcement outside the LLM's decision loop is the only pattern that works. The scout pipeline needs a typed state machine that deterministically controls step progression.

## Task

Create `src/shared/__schemas/scout-state.schemas.ts` with:

1. **State enum** — All valid states:
   - Per-article: `PENDING`, `INGESTED`, `RELEVANCE_CHECKED`, `RESEARCHED`, `ANALYZED`, `IMPL_RESEARCHED`, `READY`
   - Cross-cutting: `INTEGRATION_ANALYZED`, `TODOS_CREATED`, `MEMORY_CAPTURED`, `INDEXED`, `COMPLETE`
   - Terminal: `LOW_RELEVANCE`, `DEFERRED`, `CONFLICTING`

2. **Transition table** — Valid transitions only (no skipping):

   ```
   PENDING → INGESTED
   INGESTED → RELEVANCE_CHECKED
   RELEVANCE_CHECKED → RESEARCHED | LOW_RELEVANCE
   RESEARCHED → ANALYZED
   ANALYZED → IMPL_RESEARCHED
   IMPL_RESEARCHED → READY
   READY → INTEGRATION_ANALYZED
   INTEGRATION_ANALYZED → TODOS_CREATED | DEFERRED | CONFLICTING
   TODOS_CREATED → MEMORY_CAPTURED
   MEMORY_CAPTURED → INDEXED
   INDEXED → COMPLETE
   ```

3. **State file schema** (persisted to `.scout-state/{slug}.json`):
   - url, slug, current state, history array (from/to/timestamp), artifacts map

4. **Transition validator function** — `validateScoutTransition(currentState, targetState)` returns `{ valid: boolean, reason?: string }`

## Notes

- Follow existing state machine patterns in `packages/luca-framework/src/state/`
- Use Zod schemas per project convention (schema-first parsing)
- Terminal states have no outgoing transitions — articles in these states stay there until manually re-processed
- State files are the source of truth; the orchestrator reads them to know where to resume
