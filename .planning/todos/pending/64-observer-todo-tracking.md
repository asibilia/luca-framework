---
title: Add todo tracking to observer dashboard
area: ui
created: 2026-03-05
source: conversation
---

## Context

The luca-observer web dashboard currently tracks notes but does not surface the `.planning/todos/` system. Todos are a core workflow artifact with pending/done state that would benefit from visibility in the observation portal.

## Task

1. Extend the observer dashboard to display todos alongside existing note tracking
2. Read from `.planning/todos/pending/` and `.planning/todos/done/` directories
3. Display todo state (pending, done) with visual differentiation
4. Include todo metadata: title, area, created date, source
5. Consider adding a SpacetimeDB table for real-time todo state if warranted, or read directly from filesystem

## Notes

- Todos follow a simple file-based format with YAML frontmatter (title, area, created, source)
- State is determined by directory: `pending/` vs `done/`
- Current count: ~36 pending, ~73 done
- Could integrate with the existing notes page or be a standalone page
- Consider whether SpacetimeDB persistence is needed or if filesystem reads suffice for a local dev tool
