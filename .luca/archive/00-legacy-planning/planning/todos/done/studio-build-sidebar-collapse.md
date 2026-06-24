---
title: "P0: Fix build pages sidebar permanently collapsed (S-08)"
area: ui
created: 2026-03-27
source: docs/review/studio/04-build-pages.md
priority: P0
estimated_size: M
---

## Context

On all three build pages (Agents, Skills, Rules), the sidebar is collapsed to a 48px icon strip and cannot be expanded. Build pages set `layoutContextAtom = "editor"` which force-collapses the nav rail. The entity list panel needs to work alongside the collapsed nav rail.

## Task

Fix the build pages layout so the entity list is accessible:

**Option A (recommended):** Build pages render their own entity sidebar panel adjacent to the collapsed nav rail.

**Option B:** Auto-expand sidebar on build pages or use a different layout that shows both navigation and entity list.

### Files to modify

- `components/layout/nav-rail.tsx:44-46` — `isExpanded` logic for editor context
- `components/layout/layout-shell.tsx:67` — `effectiveNavWidth` for editor context
- `app/agents/page.tsx`, `app/skills/page.tsx`, `app/rules/page.tsx` — layout context setup

## Notes

- The collapse IS intentional (editor pages need horizontal space)
- The problem is that users can't access the entity list at all
- See review: `docs/review/studio/04-build-pages.md`
