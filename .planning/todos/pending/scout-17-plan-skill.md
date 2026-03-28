---
title: "Scout: Create scout-plan sub-skill"
area: scouting
created: 2026-03-28
source: conversation
tags: [scout, skills, phase-3]
---

## Context

Sub-skill wrapper for todo generation with conflict detection.

## Task

Create `src/skills/general/scout-plan.skill.ts`:

1. **Arguments**: Integration analysis path, list of integrated scout slugs
2. **Process**:
   - Spawn `lu-scout-planner` agent with integration analysis and impact documents
   - Wait for completion
   - Validate todos were created (at least one per integrated scout)
   - Check for any conflict annotations in the planner's output
   - If conflicts detected: route affected scouts to manual-review, update state to CONFLICTING
   - If no conflicts: advance state to TODOS_CREATED
3. **Post-validation**: Read created todos to ensure they follow the standard format

## Notes

- The planner agent does the heavy lifting; this skill handles state transitions based on planner output
- Conflict routing happens here, not in the planner agent — keeps the agent focused on analysis
