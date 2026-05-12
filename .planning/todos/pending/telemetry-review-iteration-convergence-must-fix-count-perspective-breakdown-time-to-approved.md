---
title: "Telemetry: review-iteration convergence (MUST-FIX count, perspective breakdown, time-to-APPROVED)"
area: telemetry
created: 2026-05-12
priority: medium
source: workflow-slim-down
---

## Task

Telemetry: review-iteration convergence (MUST-FIX count, perspective breakdown, time-to-APPROVED)

---
confidence: medium
externalResearch: false
priority: 2
---

# Context

Review iterations are the most variable-cost phase. We need data on how many
iterations converge in 1 vs 2 vs 3+ rounds, which perspectives generate the
most MUST-FIX findings, and total wall-clock to APPROVED.

## Scope

- Per review iteration: `{ runId, iteration, perspectives: [...], mustFixCount, shouldFixCount, advisoryCount, verdict, durationMs }`.
- Per perspective: `{ perspective, findingCount, severityBreakdown }`.
- Captured at `save-review-results` boundary in `workflowState`.

## Acceptance

- Each review iteration produces one telemetry record.
- Iteration count + verdict reconstructable from telemetry alone.
- Tests verify schema.

## Depends on

- Phase-duration telemetry

