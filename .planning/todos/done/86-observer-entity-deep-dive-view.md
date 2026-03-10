---
title: "Build observer view: Entity Deep Dive"
area: ui
created: 2026-03-08
source: conversation
priority: 7
---

## Context

Everything MuninnDB knows about a single entity — timeline, relationships, engrams, co-occurrences.

## Task

Build Entity Deep Dive view:

- Header: entity name, type, state (active/deprecated/merged/resolved), first seen date
- Tabs:
  - Timeline: chronological evolution via `entity_timeline(name)`
  - Relationships: graph of connected entities with relationship type edge labels
  - Engrams: all memories mentioning this entity (sortable/filterable)
  - Co-occurrences: frequently co-appearing entities

## Notes

- Data sources: `entity(name)` for aggregate + `entity_timeline(name)` for chronology
- Answers "what does the AI know about X?"
- Brainstorm doc: `.claude/plans/polished-mapping-fern.md`
