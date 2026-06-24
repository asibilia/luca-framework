---
title: "Build observer view: Semantic Search"
area: ui
created: 2026-03-08
source: conversation
priority: 5
---

## Context

Powerful search interface using MuninnDB's semantic recall with configurable modes and profiles.

## Task

Build Semantic Search view:

- Search bar with mode selector (semantic/recent/balanced/deep)
- Profile selector (default/causal/confirmatory/adversarial/structural)
- Threshold slider (0.0-1.0)
- Result cards: concept, summary, content preview, relevance score, tags, entities, type, date, state
- "Explain" button per result showing scoring breakdown via `explain()`
- "Traverse" button to open graph explorer centered on that engram
- Save searches as bookmarks

## Notes

- Data source: `recall(context, mode, profile, threshold)` + `explain(engram_id, query)`
- Brainstorm doc: `.claude/plans/polished-mapping-fern.md`
