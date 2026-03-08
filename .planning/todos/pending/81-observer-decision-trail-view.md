---
title: "Build observer view: Decision Trail"
area: ui
created: 2026-03-08
source: conversation
priority: 2
---

## Context

Priority view #2 for MuninnDB-native observer. Trace causal chains of decisions with reasoning, confidence, and alternatives.

## Task

Build Decision Trail view:

- Vertical timeline of decisions (newest/oldest first toggle)
- Each decision card: concept/summary, full reasoning, confidence score, connected decisions (causal chain), entities involved, current state
- Expandable "alternatives considered" if stored
- Click decision to traverse causal chain (what led to it, what followed)
- Filter by entity, confidence level
- Flag decisions as "revisit" (update lifecycle state)

## Notes

- Data sources: `recall(context: ["decisions"], mode: "deep", profile: "causal")` + `traverse(start_id, rel_types: ["caused_by", "led_to", "supports", "contradicts"])`
- Brainstorm doc: `.claude/plans/polished-mapping-fern.md`
