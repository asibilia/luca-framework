---
title: "P2: Add React error boundaries to observer dashboard pages"
area: ui
created: 2026-03-04
source: repo-review audit (uiux-reviewer, arch-reviewer)
priority: P2
---

## Context

No observer dashboard pages have React error boundaries. If SpacetimeDB data is malformed or JSON parsing fails in hooks, components can crash silently. Both UI/UX and architecture reviewers flagged this.

## Task

1. Create shared error boundary component in `packages/luca-observer/components/shared/`
2. Wrap each page's data-dependent section in error boundary
3. Add console.error in hook catch blocks (e.g., `use-ledger.ts:26` has silent catch)
4. Show user-friendly error banner: "Some data could not be loaded"
5. Add recovery action (retry button)

## Notes

- JsonViewer component (`json-viewer.tsx:19`) can crash on circular references — wrap in try-catch
- Hooks parse JSON from SpacetimeDB rows — malformed data can throw
- Error boundaries should be page-level, not app-level, for partial rendering
