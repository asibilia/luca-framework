---
title: "Scout: Create scout-analyze sub-skill"
area: scouting
created: 2026-03-28
source: conversation
tags: [scout, skills, phase-2]
---

## Context

Sub-skill wrapper for the impact analysis step.

## Task

Create `src/skills/general/scout-analyze.skill.ts`:

1. **Arguments**: Slug, digest path, output impact path
2. **Process**:
   - Spawn `lu-scout-analyst` agent with digest path
   - Wait for completion
   - Validate impact document was created with required sections (Gap Analysis table, Applicable Patterns, Recommended Actions)
   - Return success/failure to orchestrator
3. **Output validation**: Check impact file exists, has non-empty Gap Analysis table

## Notes

- Thin wrapper following decomposition pattern
- Orchestrator handles state transition on success
