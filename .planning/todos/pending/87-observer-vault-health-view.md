---
title: "Build observer view: Vault Health Dashboard"
area: ui
created: 2026-03-08
source: conversation
priority: 8
---

## Context

System-level view of the MuninnDB knowledge base health.

## Task

Build Vault Health Dashboard:

- Stats cards: total engrams, entity count, relationship count, vault size
- Health indicators:
  - Contradiction count (red if > 0)
  - Orphan entities (no relationships)
  - Duplicate entity candidates (from `similar_entities`)
  - Engram type distribution (pie chart)
  - Entity type distribution (bar chart)
- Recent activity sparkline (engrams created per day/week)

## Notes

- Data sources: `status()` + `contradictions()` + `entity_clusters()` + `similar_entities()`
- Brainstorm doc: `.claude/plans/polished-mapping-fern.md`
