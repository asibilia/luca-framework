---
title: "P2: Deduplicate sanitizeJsonParse (3 copies in codebase)"
area: dx
created: 2026-03-04
source: repo-review audit (dx-reviewer)
priority: P2
---

## Context

`sanitizeJsonParse()` is defined 3 times in the codebase with NOTE comments linking the locations. Should be a single implementation in shared helpers.

## Task

1. Create `src/shared/__helpers/sanitize-json-parse.ts` (or add to existing utility file)
2. Move the canonical implementation there
3. Update all 3 call sites to import from shared
4. Remove duplicate implementations
5. Re-export from `src/shared/index.ts` barrel

## Notes

- Locations: memory bridge, persistence.ts, and one more (check NOTE comments)
- Follow existing pattern of `~/shared/__helpers/` for cross-cutting utilities
- Quick refactor — 1-2 hours
