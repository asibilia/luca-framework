---
title: "Scout: Create scout-impl-research sub-skill (reuses existing researcher)"
area: scouting
created: 2026-03-28
source: conversation
tags: [scout, skills, phase-2]
---

## Context

Step 5 of the per-article pipeline. Researches concrete implementation approaches for the improvements identified in the impact analysis. Reuses `lu-implementation-researcher` with a Luca-specific prompt.

## Task

Create `src/skills/general/scout-impl-research.skill.ts`:

1. **Arguments**: Slug, impact document path
2. **Process**:
   - Read the impact document's Gap Analysis and Recommended Actions
   - Spawn `lu-implementation-researcher` with prompt scoped to:
     - "How would we implement these specific improvements in the Luca framework?"
     - Include relevant codebase paths from the impact analysis
     - Focus on concrete code-level approaches, not abstract patterns
   - Wait for completion
   - Append "Implementation Approaches" section to the impact document
3. **Prompt scoping**: The researcher should investigate HOW to build each recommended action, with references to existing Luca code patterns

## Notes

- Reuses existing agent — no new agent needed
- The researcher's output is appended to the existing impact document
- Implementation approaches should reference specific files/domains in the codebase
- This completes the per-article pipeline — article moves to READY state after this
