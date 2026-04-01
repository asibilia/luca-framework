---
title: "Studio S-06/S-07: Memory page data pipeline gaps"
area: ui
created: 2026-03-31
source: docs/archive/studio-review/studio/03-memory.md
severity: medium
---

## Context

Two related issues on the Studio Memory page:

- S-06: Browse recall metrics section is empty (no data displayed)
- S-07: Timeline only shows 1 event instead of the full history

Both likely stem from the same data pipeline issue in the memory page components.

## Task

Fix the Memory page data fetching to correctly populate recall metrics and timeline events from MuninnDB.
