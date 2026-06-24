---
title: "Observer: MuninnDB-native todo/backlog tracking view"
area: ui
created: 2026-03-08
source: backlog-audit (re-scoped from #64)
priority: P3
complexity: MODERATE
---

## Context

Original #64 proposed reading `.planning/todos/` from the filesystem and optionally writing to SpacetimeDB. That approach is obsolete. Re-scoped as a MuninnDB-native observer view that surfaces backlog state through the MuninnDB API layer.

## Task

Build an observer view that:

1. Reads todo/backlog state from MuninnDB (session engrams tagged `task:*`, `phase:*`)
2. Displays pending/in-progress/done items with phase context
3. Shows todo velocity over time (items completed per milestone)
4. Links todos to related MuninnDB entities (agents, decisions, learnings)

## Dependencies

- #79 (Observer MuninnDB API layer) must exist
- #77 (MuninnDB emission layer) must emit task-related engrams
- At least one core observer view (#80) should establish the design system first

## Notes

- Re-scoped from #64 during backlog audit (2026-03-08)
- Lower priority than core MuninnDB views (#80-87)
- Consider for v3.3 or later
