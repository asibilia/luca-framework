---
title: "Slim-down: merge triage + research + architect into luca:1-plan mode"
area: workflow
created: 2026-05-12
priority: high
source: workflow-slim-down
---

## Task

Slim-down: merge triage + research + architect into luca:1-plan mode

---
confidence: medium
externalResearch: false
priority: 1
---

# Context

The core structural change. Collapses three modes into one with three substeps:
classify → context-gather (user interrogation + optional research) →
architect-plan. Single planning document set per todo.

## Substeps inside luca:1-plan

1. **Classify** — read frontmatter, decide oversight + depth.
2. **Context-gather** — for each todo:
   - Read frontmatter `confidence` + `externalResearch`.
   - If `confidence: low` or missing — run inline grooming (3-Q interrogation).
   - If `externalResearch: true` — spawn research subagents.
   - If `confidence: high` and `externalResearch: false` — skip research, validate-only pass.
   - Write `TODO-CONTEXT.md` per todo.
3. **Architect-plan** — write `PLAN.md` (single doc covering all todos in run).
4. Plan review subagent (unchanged from current architect).

## Planning documents

Always created per todo: `TODO-CONTEXT.md`.
Per run: `PLAN.md`, `LEARNINGS.md` (LEARNINGS populated at finalize).
Conditional: `CONFLICTS.md` (only when user-context vs research diverges), `DECISIONS.md` (only when user makes ADR-worthy calls mid-plan).

## Scope

- New mode `luca:1-plan` in `mode-runner.ts` + instruction file `src/instructions/plan.md`.
- Migrate scoped tool permissions from triage/research/architect into the new mode.
- Delete old `triage.md`, `research.md`, `architect.md` files (or keep as deprecated stubs during alpha).
- Update `workflowState` pipeline order: `plan → execute → verify → finalize`.

## Acceptance

- A run with one HIGH-confidence todo skips research, writes minimal `TODO-CONTEXT.md` + `PLAN.md`.
- A run with one LOW-confidence todo triggers inline 3-Q interrogation.
- A run with `externalResearch: true` spawns research subagents.
- Existing tests for triage/research/architect get migrated or replaced.

## Depends on

- Frontmatter schema todo.

## Risks

- Big migration. Likely the single largest todo in Wave 2.
- Phase-directory structure may need rev (one dir per run vs one per todo).

