---
title: Replace native Array methods with lodash equivalents
area: observer/workflow-editor
created: 2026-03-13
source: v4.3.0-MILESTONE-AUDIT.md
priority: HIGH
effort: Small
---

## Context

The v4.3.0 audit flagged native `.filter()` x4 in `workflow-stats-bar.tsx:23` and native `.sort()`/`.filter()` in `muninn-config.ts` instead of lodash `filter`/`orderBy`. The project's lodash-preference rule requires lodash for consistency and safety.

## Task

- Replace the four `.filter()` calls in `workflow-stats-bar.tsx` with `lodash/filter` (or better, a single `countBy` / `reduce` pass — also flagged as MEDIUM by code-simplifier)
- Replace `.sort()` and `.filter()` in `muninn-config.ts` with `lodash/orderBy` and `lodash/filter`

## Files Affected

- `packages/luca-observer/components/workflow-editor/workflow-stats-bar.tsx`
- `packages/luca-observer/lib/muninn-config.ts`

## Notes

- Audit source: dx-advocate (HIGH severity)
- Stats bar also has a MEDIUM issue about four sequential filter passes that could be a single `countBy` — can be addressed simultaneously
