---
title: "P2: Add unique constraints to singleton SpacetimeDB tables"
area: data
created: 2026-03-04
source: repo-review audit (db-reviewer)
priority: P2
---

## Context

WorkflowState, HarnessResults, SessionPlans, TribunalResults, MemoryFiles, Metrics, and WorkflowConfig are "singleton" tables (only 1 row with id=1) but have no unique constraint enforcing this. Reducer bugs could insert duplicate rows.

## Task

1. Review `packages/luca-spacetime/spacetimedb/src/schema.ts:6-18, 86-97, 127-134`
2. Add unique constraint on `id` field for all singleton tables
3. Add defensive check in reducers: if id != 1, reject/error
4. Add test that verifies singleton invariant

## Notes

- Current pattern uses find + update/insert but doesn't prevent duplicates
- Queries for `WHERE id = 1` would return first row, hiding duplicates
- Low probability but high correctness impact
