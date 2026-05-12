---
title: "Slim-down: user-context-vs-research conflict halt + CONFLICTS.md"
area: workflow
created: 2026-05-12
priority: high
source: workflow-slim-down
---

## Task

Slim-down: user-context-vs-research conflict halt + CONFLICTS.md

---
confidence: medium
externalResearch: false
priority: 2
---

# Context

User explicitly chose hard-halt over auto-resolve when research findings
contradict user context. This is the safety mechanism that protects against
research-led-us-down-wrong-path failures in large monorepos.

## Scope

- After research subagents complete, plan mode synthesizes findings.
- Conflict-detection pass: compare each user-stated claim in `TODO-CONTEXT.md` against research findings.
- If conflict detected:
  - Write `CONFLICTS.md` listing each: `{ userClaim, researchFinding, conflictType, citations }`.
  - Hard halt via `ask_user` with options: `(a) trust user, ignore research`, `(b) trust research, supersede user context`, `(c) abort run`.
  - Persist resolution into `TODO-CONTEXT.md`.
- Telemetry record on conflict + resolution path chosen.

## Acceptance

- Synthetic conflict (user says "files at X", research finds them at Y) triggers halt.
- All three resolution paths exercised by tests.
- `CONFLICTS.md` schema validated.

## Depends on

- luca:1-plan mode todo.

