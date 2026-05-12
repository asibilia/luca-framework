---
title: "Slim-down: LEARNINGS.md at finalize — learner-driven post-merge MuninnDB promotion"
area: workflow
created: 2026-05-12
priority: medium
source: workflow-slim-down
---

## Task

Slim-down: LEARNINGS.md at finalize — learner-driven post-merge MuninnDB promotion

---
confidence: medium
externalResearch: false
priority: 3
---

# Context

User explicitly said: "wait until after shipping to save verified MuninnDB
memories." Finalize is the right boundary. The learner subagent inspects shipped
artifacts, decides what to promote, and writes an audit doc.

## Scope

- Finalize mode invokes `learner` subagent after PR is open + merged signal received (or, MVP: after PR body written).
- Learner reads `TODO-CONTEXT.md`, `PLAN.md`, executor commits, review iterations.
- Learner decides per-finding: store as `inferred` (most), promote to `verified` only when:
  - User explicitly confirmed a claim in `TODO-CONTEXT.md`, OR
  - Review feedback addressed AND test exists that exercises the claim.
- Writes `LEARNINGS.md` listing each memory created + its tier + citation.
- Stored memories use op_id keyed to run-id + finding-id (idempotent re-run safe).

## Acceptance

- Finalize on a multi-todo run produces a `LEARNINGS.md` with N entries.
- Verified-tier memories show citation back to user statement or test.
- Re-running finalize doesn't duplicate memories (op_id idempotent).
- Tests verify learner output schema.

## Depends on

- luca:1-plan mode todo (writes `TODO-CONTEXT.md` learner reads).

