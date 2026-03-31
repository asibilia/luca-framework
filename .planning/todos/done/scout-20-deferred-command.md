---
title: "Scout: Add /scout --deferred command for milestone planning"
area: scouting
created: 2026-03-28
source: conversation
tags: [scout, skills, phase-4]
---

## Context

Deferred items are valid improvements that were too costly to integrate at the time. They should be surfaced during milestone planning so they can be reconsidered when conditions change.

## Task

Add `--deferred` flag handling to `scout.skill.ts`:

1. **List mode** (`/scout --deferred`):
   - Show all items in `docs/scouting/deferred/`
   - Display: article title, deferred date, reason, conditions to revisit, assessed value
   - Sort by value (highest first)
2. **Re-evaluate mode** (`/scout --deferred {slug}`):
   - Read the deferred document
   - Check if Conditions to Revisit have been met (scan codebase/roadmap/todos)
   - Report findings to user: "Conditions X met, Y not met"
   - If user approves: reset state to READY, re-run integration analysis
3. **Integration with milestone planning**: When `/milestone-new` or similar runs, it should optionally scan deferred scouts as input (this is a hook point, not full implementation here)

## Notes

- Deferred items are first-class artifacts — they naturally feed into milestone planning
- The re-evaluate mode is advisory — it checks conditions but the user decides
- Consider adding a MuninnDB recall hook so that when planning new milestones, deferred scouts are surfaced automatically
