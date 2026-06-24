---
title: "Fix Scorecard Schema Mismatch (61 TS Errors)"
area: observability
created: 2026-03-01
source: repo-audit
tier: 0
complexity: SIMPLE
---

## Context

Full repo audit found 61 TypeScript errors concentrated in 4 files, all stemming from a single schema mismatch: `sort_order` became a required property in the scorecard query schema but callers (helper + tests) weren't updated.

## Task

Fix the `sort_order` property mismatch in the scorecard domain:

- **Option A (preferred):** Make `sort_order` optional with a default in `src/observability/__helpers/scorecard.ts`
- **Option B:** Add `sort_order` to all callers in tests and helpers

Files affected:
- `src/observability/__helpers/scorecard.ts` (line 113 — missing sort_order in defaults)
- `__tests__/src/observability/scorecard.test.ts` (multiple call sites missing sort_order)
- `__tests__/src/memory/auto-compaction.test.ts` (type errors)
- `__tests__/src/memory/context-pruning.test.ts` (type errors)

## Notes

- This single fix clears all 61 TypeScript errors from `bunx --bun tsc --noEmit`
- Highest-impact, lowest-effort fix from the audit
