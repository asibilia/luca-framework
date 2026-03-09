---
title: "Build observer view: Learning Evolution"
area: ui
created: 2026-03-08
source: conversation
priority: 3
---

## Context

Priority view #3 for MuninnDB-native observer. Track how AI knowledge grows over time across sessions.

## Task

Build Learning Evolution view:

- Area chart showing engram accumulation over time (by type: pattern/decision/pitfall/observation)
- Filterable by type
- Scrollable list of learnings in chronological order
- Each learning shows: what was learned, source session, current state (active/superseded/deprecated), related learnings via traverse
- Answer "is the AI getting smarter?" with visual evidence

## Notes

- Data sources: `recall(context: ["pattern:", "decision:", "pitfall:"], mode: "recent")` with `since`/`before` time windowing
- Tremor AreaChart for accumulation visualization
- Brainstorm doc: `.claude/plans/polished-mapping-fern.md`
