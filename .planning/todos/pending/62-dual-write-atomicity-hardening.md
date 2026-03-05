---
title: Harden dual-write with divergence detection
area: data
created: 2026-03-05
source: v2.8.0 done-todo audit (partial: 36-p1-dual-write-atomicity)
---

## Context

Todo `36-p1-dual-write-atomicity` was marked done in v2.8.0. Error logging was added for failed SpacetimeDB writes with JSON file backup as fallback. However, the more robust patterns described in the original todo were not implemented.

## Partial Completion

The following WAS implemented:

- JSON backup write on SpacetimeDB failure (persistence.ts)
- `LUCA_DEBUG` logging for dual-write debugging
- Fire-and-forget error logging via observer-emitter retry

## Gaps

The following was NOT implemented:

- Write-ahead pattern (write JSON first, then SpacetimeDB, then confirm)
- Periodic divergence detection (compare JSON state vs SpacetimeDB state)
- Reconciliation strategy when divergence is detected

## Task

1. Evaluate whether divergence detection is worth implementing given current usage patterns
2. If yes: add a `checkDualWriteConsistency()` function that compares JSON and SpacetimeDB state
3. If no: close this todo with rationale (e.g., "JSON is backup-only, SpacetimeDB is source of truth, divergence is acceptable")

## Notes

The current implementation is pragmatic — JSON backup exists purely as a fallback for when SpacetimeDB is unavailable. True atomicity may be over-engineering for a developer tool. Consider closing with a "by design" note.
