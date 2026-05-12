---
title: "Slim-down: mid-execute wrong-direction rollback to plan mode"
area: workflow
created: 2026-05-12
priority: medium
source: workflow-slim-down
---

## Task

Slim-down: mid-execute wrong-direction rollback to plan mode

---
confidence: low
externalResearch: false
priority: 4
---

# Context

User concern: execute mode shouldn't be fire-and-forget. If the user notices
mid-execute that the plan is wrong (or the executor uncovers a structural
issue), there should be a clean rollback path back to plan mode with the
rollback rationale captured.

## Scope (sketch — needs grooming)

- `workflowState(action: "rollback-to-plan", reason)` action.
- Aborts current execute work (no commit), writes `ROLLBACK.md` with rationale.
- Switches mode back to `luca:1-plan` with the rollback context surfaced in the next plan iteration.
- User-triggered (interjection) OR executor-triggered (`abort-execute: { reason }` result).

## Open questions

- Does rollback discard executor work entirely or stash it?
- How does plan mode treat the rollback context — supersede prior plan or augment?
- Telemetry hook for measuring rollback frequency.

## Depends on

- luca:1-plan mode todo
- Plan/execute mode separation already exists, so additive.

