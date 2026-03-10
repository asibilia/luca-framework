---
title: "Build observer view: Contradiction & Conflict"
area: ui
created: 2026-03-08
source: conversation
priority: 6
---

## Context

Surface conflicting memories automatically. Quality control mechanism for the knowledge base.

## Task

Build Contradiction & Conflict view:

- List of contradiction pairs from `contradictions()`
- Each pair shows: Memory A vs B summaries, creation dates, confidence scores, entities involved
- Actions per contradiction: resolve (forget one), evolve (update one), merge
- Adversarial recall search for finding potential conflicts by topic

## Notes

- Data sources: `contradictions()` + `recall(context, profile: "adversarial")`
- Unique value prop: no other dev tool proactively shows conflicting AI beliefs
- Brainstorm doc: `.claude/plans/polished-mapping-fern.md`
