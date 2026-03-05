---
title: "P0: Fix SQL injection risk in ledger query builder"
area: data
created: 2026-03-04
source: repo-review audit (db-reviewer)
priority: P0
---

## Context

The ledger read path uses manual string interpolation for SQL queries with only single-quote escaping. SpacetimeDB HTTP API doesn't support parameterized queries, so input validation must be strict.

## Task

1. Review `packages/luca-framework/src/state/ledger.ts:225-236`
2. Replace manual `.replace(/'/g, "''")` with strict input validation:
   - session_id: validate as UUID format
   - event_type: validate against allowlist of known event types
   - since: validate as ISO8601 timestamp
   - limit/tail: validate as positive integers
3. Consider creating a SQL builder utility for safe query construction
4. Add tests for malicious input scenarios

## Notes

- SpacetimeDB v2.0 SQL API requires POST with plain text body — no bind parameters
- Only escapes single quotes currently, not other SQL injection vectors
- Risk is limited to localhost SpacetimeDB, but defense-in-depth is important
