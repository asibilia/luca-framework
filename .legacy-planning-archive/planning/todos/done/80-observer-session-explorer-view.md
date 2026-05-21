---
title: "Build observer view: Session Explorer"
area: ui
created: 2026-03-08
source: conversation
priority: 1
---

## Context

Priority view #1 for MuninnDB-native observer. Browse sessions chronologically with decisions, learnings, and issues per session.

## Task

Build Session Explorer view:

- Left panel: session list (date, duration, complexity, key entities)
- Right panel: session detail with tabs:
  - Timeline: chronological engram stream for that session
  - Decisions: filtered to type=decision engrams
  - Learnings: filtered to type=observation/pattern
  - Issues: filtered to type=issue
  - Entities touched: entities mentioned/created during session
- Compare two sessions side-by-side
- Link to related sessions via shared entities

## Notes

- Data sources: `session(since)` + `recall(context: ["session:X"], mode: "recent")`
- Stack: Next.js 15, Tremor charts, Tailwind CSS 4
- Brainstorm doc: `.claude/plans/polished-mapping-fern.md`
