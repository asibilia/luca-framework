---
title: "Telemetry: per-phase wave duration logging to .planning/telemetry/&lt;run-id&gt;.jsonl"
area: telemetry
created: 2026-05-12
priority: high
source: workflow-slim-down
---

## Task

Telemetry: per-phase wave duration logging to .planning/telemetry/&lt;run-id&gt;.jsonl

---
confidence: medium
externalResearch: false
priority: 1
---

# Context

Foundation telemetry for the slim-down decision. We need duration data per phase
across many runs before we commit to collapsing modes. Append-only JSONL keeps
writes cheap and post-hoc aggregation flexible.

## Scope

- Instrument start/end of each pipeline phase (triage, research, architect, execute, review, finalize).
- Per-event record: `{ runId, phase, event: "start"|"end", wave?, timestamp, durationMs? }`.
- Write to `.planning/telemetry/<run-id>.jsonl` (append-only).
- Add `'telemetry'` to `ROOT_WHITELIST_DIRS` in `repo-cleanup.ts`.
- No aggregation, no report — that's a later todo (`/luca-telemetry-report`).

## Out of scope

- Subagent telemetry (separate todo)
- Recall telemetry (separate todo)
- Cross-run aggregation skill (separate todo)

## Acceptance

- Every phase boundary in `workflowState` (`start-phase`, `complete-phase`, `advance-wave`) emits a JSONL record.
- A fresh run produces a non-empty `.planning/telemetry/<run-id>.jsonl`.
- `repo-cleanup` does not flag `.planning/telemetry/` as a straggler.
- Tests verify event schema + append-only behavior.

