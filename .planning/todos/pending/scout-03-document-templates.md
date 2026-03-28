---
title: "Scout: Create document templates for all artifact types"
area: scouting
created: 2026-03-28
source: conversation
tags: [scout, foundation, phase-1]
---

## Context

The scouting pipeline produces structured documentation at each stage. Templates ensure consistency and make it easy for agents to produce well-formatted output.

## Task

Create template definitions (as constants in a helper file or as markdown templates) for:

1. **Digest template** (`docs/scouting/digests/{date}-{slug}.md`):
   - Source URL, date scouted, status
   - Summary (3-5 sentences)
   - Key Concepts (bulleted)
   - Techniques & Patterns
   - Related Work (added by Stage 3)
   - Technique Deep-Dive (added by Stage 3)

2. **Impact Analysis template** (`docs/scouting/impact/{date}-{slug}-impact.md`):
   - Source digest link, relevance score (HIGH/MEDIUM/LOW)
   - Framework Gap Analysis table (Area | Current State | Potential Improvement | Effort)
   - Applicable Patterns
   - Implementation Approaches (added by Stage 5)
   - Recommended Actions (checkboxes)

3. **Integration Analysis template** (`docs/scouting/integration/{date}-batch-{id}.md`):
   - Scouts included in batch
   - Cross-scout cohesion analysis
   - Framework fit assessment
   - Integration priority ordering
   - Per-scout verdict: integrate / defer / conflict

4. **Deferred template** (`docs/scouting/deferred/{date}-{slug}.md`):
   - Original digest and impact links
   - Why Deferred (specific reasoning)
   - Conditions to Revisit (what would change to make this worth it)
   - Value If Implemented (preserve assessed value)

5. **Manual Review template** (`docs/scouting/manual-review/{date}-{slug}.md`):
   - Reason for manual review: `low-relevance` or `todo-conflict`
   - For low-relevance: lightweight Stage 1 digest only
   - For todo-conflict: conflict annotation with both todo references

## Notes

- Templates should be defined in `src/skills/__helpers/scout-templates.ts` or similar
- Status field values: `pending | digested | researched | analyzed | impl-researched | ready | integrated | deferred | low-relevance | conflicting`
- All templates use standard markdown — no custom syntax
