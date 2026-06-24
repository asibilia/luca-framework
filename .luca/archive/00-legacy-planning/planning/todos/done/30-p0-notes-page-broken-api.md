---
title: "P0: Fix notes page — calls deleted API endpoints"
area: ui
created: 2026-03-04
source: repo-review audit (uiux-reviewer)
priority: P0
---

## Context

During the SpacetimeDB migration, all 14 API routes in luca-observer were deleted and replaced with `useTable()` hooks. However, the notes page was missed — it still calls `/api/notes` for both GET and POST operations.

## Task

1. Migrate notes page (`packages/luca-observer/app/notes/page.tsx`) to use SpacetimeDB hooks
2. Replace `fetch("/api/notes")` (line 37) with `useNotes()` hook using `useTable(tables.notes)`
3. Replace POST to `/api/notes` (line 69) with SpacetimeDB reducer call (`create_note`)
4. Add error UI when mutations fail
5. Update code comments that reference `/api/notes` endpoint

## Notes

- Feature is **completely non-functional** — user input is silently discarded
- The `notes` table and `create_note`/`complete_note` reducers already exist in SpacetimeDB schema
- Other pages (events, workflow, etc.) have been successfully migrated and can serve as patterns
