---
title: "P1: Clean up all stale SSE/API references in observer UI"
area: ui
created: 2026-03-04
source: repo-review audit (uiux-reviewer)
priority: P1
---

## Context

Multiple observer UI files still reference the deleted SSE/polling infrastructure. These create user confusion and developer confusion.

## Task

1. `components/dashboard/recent-events.tsx:43-47` — empty state shows curl to deleted `/api/events`
2. `app/agents/page.tsx:39` — empty state says "Events are captured via SSE"
3. `app/workflow/page.tsx:17` — comment references `/api/state` and `/api/ledger` polling
4. `app/notes/page.tsx:9,24` — comments reference `/api/notes` endpoint and SSE
5. Update all references to reflect SpacetimeDB real-time subscriptions
6. Grep for any remaining `/api/` or `SSE` references in luca-observer

## Notes

- These are separate from the notes page broken API calls (todo #30)
- Mostly copy/comment updates, not logic changes
- Quick fix but high polish impact
