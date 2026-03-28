---
title: "Scout: Create orchestrator skill (scout.skill.ts)"
area: scouting
created: 2026-03-28
source: conversation
tags: [scout, foundation, phase-1]
---

## Context

The scout orchestrator is a deterministic state machine driver, NOT an LLM-guided workflow. It reads state, determines the next step, spawns the appropriate sub-skill, validates output, and advances state. The LLM never decides what step comes next — the state machine does.

## Task

Create `src/skills/general/scout.skill.ts` that:

1. **Parses arguments**:
   - `/scout` — process all pending URLs from `docs/scouting/inbox.md`
   - `/scout https://url` — process a single URL directly
   - `/scout --review` — re-process items from `manual-review/`
   - `/scout --deferred` — list deferred items for milestone planning

2. **Per-article loop** (Phase A):
   - For each URL, read or create state file in `.scout-state/{slug}.json`
   - Resume from current state (supports interrupted pipelines)
   - Step through transitions sequentially:
     - PENDING → spawn `scout-ingest`
     - INGESTED → spawn `scout-relevance`
     - RELEVANCE_CHECKED → spawn `scout-research` (or route to LOW_RELEVANCE)
     - RESEARCHED → spawn `scout-analyze`
     - ANALYZED → spawn `scout-impl-research`
   - After each sub-skill: validate output file exists, advance state
   - Mark inbox.md entry as `<!-- processed:YYYY-MM-DD -->`

3. **Cross-cutting batch** (Phase B):
   - After all per-article pipelines reach READY state
   - spawn `scout-integrate` (all READY articles as batch)
   - spawn `scout-plan` (todo generation with conflict check)
   - spawn `scout-graduate` (memory capture)
   - Run deterministic INDEX.md update

4. **Progressive disclosure**:
   - Each sub-skill receives ONLY its own step's context
   - No future steps revealed to executing agents

## Notes

- Follow anti-step-skipping Layer 1 (progressive disclosure) and Layer 2 (state machine)
- State file is the resume mechanism — if pipeline is interrupted, re-running `/scout` picks up where it left off
- Slug generation: lowercase the article title, kebab-case, truncate to ~50 chars
- The orchestrator itself should be relatively small — most logic is in sub-skills
