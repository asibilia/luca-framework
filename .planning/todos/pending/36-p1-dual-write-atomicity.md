---
title: "P1: Improve dual-write consistency (SpacetimeDB + JSON)"
area: data
created: 2026-03-04
source: repo-review audit (db-reviewer, agentic-reviewer)
priority: P1
---

## Context

State persistence, ledger appends, and memory writes all use dual-write (SpacetimeDB reducer + local JSON file). These writes are not atomic — if one succeeds and the other fails, data drifts silently between the two stores.

## Task

1. Review `packages/luca-framework/src/state/ledger.ts:176-189` — ledger dual-write
2. Review `packages/luca-framework/src/state/persistence.ts` — state dual-write
3. Review `src/memory/__helpers/bridge.ts:85-100` — memory dual-write
4. At minimum: log when one write succeeds and the other fails
5. Ideally: implement write-ahead pattern (write JSON first, then SpacetimeDB, log divergence)
6. Add divergence detection — periodic check that both stores agree

## Notes

- Both db-reviewer and agentic-reviewer flagged this independently
- Failure scenarios: SpacetimeDB write fails silently (fire-and-forget), JSON write succeeds
- Or: process dies between the two writes
- Read path queries SpacetimeDB first, falls back to JSON — so stale JSON can be served
- Memory bridge has additional issue: async SpacetimeDB write with no await
