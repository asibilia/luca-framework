---
title: "P2: Add missing empty states to observer pages"
area: ui
created: 2026-03-04
source: repo-review audit (uiux-reviewer)
priority: P2
---

## Context

Several observer pages lack proper empty states — when data is missing, components either render empty arrays silently or show nothing helpful.

## Task

1. Workflow page (`app/workflow/page.tsx:59-60`) — add empty state for transition log when entries.length === 0
2. Harness page (`app/harness/page.tsx:14-44`) — add null check for `result` before rendering HarnessSummaryBanner
3. Cost page — standardize loading state (missing `animate-pulse`)
4. Follow the existing empty state pattern: dashed border, monospace text, helpful guidance message

## Notes

- Good empty state examples already exist in decisions page and tribunal page
- Empty states should explain what data will appear and when
- Related to todo #40 (LoadingSkeleton consistency)
