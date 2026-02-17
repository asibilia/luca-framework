---
title: "Clean up empty directories and document phase numbering gaps"
area: repo-hygiene
priority: low
created: 2026-02-16
source: repo-audit
---

## Context

Minor repo hygiene items found during full audit.

## Task

1. **Remove empty directories:**
   - `.planning/todos/pending/` — will have files after this todo creation (resolved)
   - `packages/luca-state/.planning/` — empty, leftover

2. **Document phase numbering gap:**
   - Phases jump from 37 to 40 (missing 38-39)
   - Add a note in ROADMAP.md or phase directory explaining the gap

## Notes

- Phase gaps may be intentional for organizational reasons
- Empty placeholder profile directories (`go/`, `python/`, `rust/` with `.gitkeep`) are intentional and should stay
