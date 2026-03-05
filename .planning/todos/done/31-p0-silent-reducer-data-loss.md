---
title: "P0: Add retry + error logging to fire-and-forget reducer calls"
area: data
created: 2026-03-04
source: repo-review audit (db-reviewer, dx-reviewer)
priority: P0
---

## Context

All SpacetimeDB reducer calls in observer-emitter.ts use fire-and-forget with `.catch(() => {})`. When SpacetimeDB is unavailable, writes are silently lost with no retry, no logging, and no indication to the caller.

## Task

1. Add error logging to `observer-emitter.ts:96-103` — at minimum `console.error` in catch blocks
2. Implement optional retry with exponential backoff (1-2 retries max)
3. Add `LUCA_DEBUG=true` env var flag for verbose fallback logging across bridge reads too
4. Apply same pattern to bridge.ts catch blocks (lines 99, 162, 207, 259, 361, 430)
5. Consider structured error return so callers can detect failures

## Notes

- Both db-reviewer and dx-reviewer flagged this independently — cross-cutting concern
- Current pattern: `fetch(...).catch(() => {})` — completely silent
- SpacetimeDB is optional (framework shouldn't block), but operators need visibility
- Ledger entries are particularly important — silent loss breaks audit trail
- Related: bridge.ts has 6+ empty catch blocks for SpacetimeDB reads
