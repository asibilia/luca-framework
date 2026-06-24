---
title: "Slim-down: rename luca:5-review → luca:3-verify (and renumber pipeline)"
area: workflow
created: 2026-05-12
priority: medium
source: workflow-slim-down
---

## Task

Slim-down: rename luca:5-review → luca:3-verify (and renumber pipeline)

---
confidence: high
externalResearch: false
priority: 3
---

# Context

Naming cleanup as part of the cut. New pipeline order:
`luca:1-plan → luca:2-execute → luca:3-verify → luca:4-finalize`.

## Scope

- Rename `src/instructions/review.md` → `src/instructions/verify.md`.
- Update mode id `luca:5-review` → `luca:3-verify` in `mode-runner.ts`, tool-manifest, pipelineOrder.
- Update all instruction prose cross-refs.
- Update `workflowState` valid mode list.
- Migration: state files with old mode id auto-translate on read.

## Acceptance

- Pipeline progresses through 4 sequential modes.
- All instruction cross-refs updated.
- Tests verify the new mode id is the only valid form post-v12.

## Depends on

- luca:1-plan mode todo.
- Remove luca:discuss todo.

