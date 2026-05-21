---
title: "Scout: Add /scout --review command for manual-review items"
area: scouting
created: 2026-03-28
source: conversation
tags: [scout, skills, phase-4]
---

## Context

Articles that were routed to manual-review (low-relevance or todo-conflict) need a way to be re-processed after human review. The user reads the manual-review document, decides it's worth pursuing, and pushes it back through the pipeline.

## Task

Add `--review` flag handling to `scout.skill.ts`:

1. **List mode** (`/scout --review`): Show all items in `docs/scouting/manual-review/` with their reason (low-relevance or todo-conflict)
2. **Re-process mode** (`/scout --review {slug}`):
   - Read the manual-review document
   - Reset state to appropriate resume point:
     - Low-relevance items: reset to INGESTED (skip re-ingestion, re-run relevance as HIGH override)
     - Todo-conflict items: reset to INTEGRATION_ANALYZED (re-run todo generation with updated context)
   - Push through remaining pipeline steps
3. **Dismiss mode** (`/scout --review {slug} --dismiss`): Remove from manual-review, mark as dismissed in INDEX.md

## Notes

- Human-in-the-loop: the user decides what to do with manual-review items
- Re-processing uses the same state machine — just resets to an earlier state
- The relevance override for low-relevance items means "user says this IS relevant, proceed"
