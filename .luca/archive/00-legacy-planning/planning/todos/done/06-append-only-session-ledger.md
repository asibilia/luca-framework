---
title: "Append-Only Session Ledger (DAG)"
area: framework/state
created: 2026-03-01
source: expert-panel-research
tier: 2
complexity: COMPLEX
moat: Strong
---

## Context

Pi Agent uses append-only DAG sessions (JSONL with ID/parent-ID) for branching, compaction, and full history preservation. Nader emphasizes "observability over features."

## Task

Every state transition appended as JSONL with ID/parent-ID to `.planning/session-ledger.jsonl`. Enables session replay, debugging, richer learning extraction.

**Implementation:**

- Extend TransitionRecord schema with `sequence_number` and `parent_id` in `packages/luca-framework/src/state/events.ts`
- After persistActor() in `packages/luca-framework/src/state/bridge.ts`, append to ledger
- Add `read-ledger` bridge subcommand (tail, filter-by-event-type, time-range)
- New: `packages/luca-framework/src/state/ledger.ts` — append/read/compact functions
- lu-learner consumes ledger for richer pattern extraction

## Notes

- Source agents: Architecture Expert + Intelligence Expert
