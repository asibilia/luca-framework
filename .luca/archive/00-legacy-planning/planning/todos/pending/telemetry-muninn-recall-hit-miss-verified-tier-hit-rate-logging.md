---
title: "Telemetry: muninn_recall hit/miss + verified-tier hit rate logging"
area: telemetry
created: 2026-05-12
priority: high
source: workflow-slim-down
---

## Task

Telemetry: muninn_recall hit/miss + verified-tier hit rate logging

---
confidence: medium
externalResearch: false
priority: 2
---

# Context

The memory-tier work (verified vs inferred) needs validation: are agents
actually retrieving verified-tier engrams? Recall telemetry answers this and
informs whether the tier discipline is paying off.

## Scope

- Instrument `muninn_recall` callsites in instruction prose AND subagent code.
- Per-call record: `{ runId, phase, callsite, query (truncated 200 chars), resultCount, topScore, verifiedHitCount, inferredHitCount, externalHitCount }`.
- Append to `.planning/telemetry/<run-id>.jsonl`.
- Do NOT log the full result content — only counts + score + tier breakdown.

## Acceptance

- Each `muninn_recall` invocation produces one telemetry record.
- `verifiedHitCount` is non-zero for callsites that consistently target verified-tier prefs (e.g., consult-section).
- Tests verify event emission + tier-count derivation.

## Risk

- Instrumenting in instruction prose is non-trivial — agents must include a follow-up `writePlanningFile` call. Architect should decide whether to use a wrapper tool or document-level instrumentation.

## Depends on

- Phase-duration telemetry (shares writer)

