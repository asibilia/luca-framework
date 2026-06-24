---
title: "P2: Document observability domain in architecture docs"
area: dx
created: 2026-03-04
source: repo-review audit (arch-reviewer)
priority: P2
---

## Context

A 14th domain (`src/observability/`) exists in the codebase but is not documented in `docs/architecture-overview.md`. It follows archetype B (Core Domain) structure properly but creates documentation drift.

## Task

1. Add `observability` to the tier documentation in architecture-overview.md (T1 Core)
2. Update the domain count from "13 domains" to "14 domains"
3. Add to the dependency tier table
4. Describe its purpose (scorecard engine) and dependencies

## Notes

- Arch-reviewer noted this was the only documentation gap found
- Domain is well-structured internally — just undocumented
- Quick fix — 15 minutes
