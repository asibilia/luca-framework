---
title: "Scout: Create scout-relevance sub-skill"
area: scouting
created: 2026-03-28
source: conversation
tags: [scout, skills, phase-2]
---

## Context

Sub-skill wrapper for the relevance gate. Handles the routing logic for low-relevance articles.

## Task

Create `src/skills/general/scout-relevance.skill.ts`:

1. **Arguments**: Slug, digest path
2. **Process**:
   - Spawn `lu-scout-relevance` agent with digest path
   - Read relevance score from agent output
   - If LOW: move digest to `docs/scouting/manual-review/`, update state to LOW_RELEVANCE
   - If HIGH/MEDIUM: return success for orchestrator to continue
3. **Non-destructive routing**: LOW relevance articles get a lightweight manual-review document explaining why they were flagged and how to re-process them (`/scout --review`)

## Notes

- The move-to-manual-review is a file copy + state update, not deletion
- Manual-review document includes the original digest content plus the relevance rationale
- Orchestrator reads the return value to know whether to continue or stop this article's pipeline
