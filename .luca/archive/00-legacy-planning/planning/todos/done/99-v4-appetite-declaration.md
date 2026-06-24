---
title: "v4: Appetite declaration system"
area: workflow
created: 2026-03-10
source: docs/brainstorm/3.final-workflow.md
priority: P0
complexity: MODERATE
milestone: v4.0.0
---

## Context

Luca v4 introduces "fixed appetite, variable scope" — the developer declares an investment ceiling before planning begins. Complexity is the floor (objective technical reality); appetite is the ceiling (subjective investment decision). If appetite < complexity, the system forces scope cut, decomposition, or deferral.

Spec: `docs/brainstorm/3.final-workflow.md` (Phase 0: Intake & Appetite)

## Task

### 1. Appetite Levels & Token Budgets

Define appetite enum and corresponding weighted token budgets:

- Micro, Small, Medium, Large, XL
- TRIVIAL/SIMPLE: auto-inferred (Micro/Small respectively)
- MODERATE+: developer declares explicitly

### 2. State Machine Integration

Add to WorkflowContext in `packages/luca-framework/src/state/`:

- `appetite_level` field (enum: Micro/Small/Medium/Large/XL)
- `appetite_budget_tokens` field (weighted token budget ceiling)
- `appetite_used_tokens` field (running consumption counter)

Update STATE.md snapshot to include Appetite field.

### 3. Appetite Guard (Execution Phase)

Add appetite guard logic to `src/skills/general/phase-execute.skill.ts`:

- Check token budget at wave boundaries only (never mid-wave)
- At 80%: log warning, continue
- At 100%: PAUSE and present developer options:
  - (a) Extend appetite by N tokens
  - (b) Scope-cut remaining work
  - (c) Halt and preserve progress
- Model routing: ROUTER preset

### 4. Appetite-Constrained Planning

Update `src/agents/luca/lu-planner.agent.ts`:

- Accept appetite constraint as input
- Shape scope to fit within budget (cut to fit)
- If appetite < complexity: flag conflict before planning

## Notes

- Token cost: ~$0.001-$0.006/run for the guard check
- This is foundational — pre-mortem and process data both depend on appetite being tracked
- Design decision: soft pause at 100%, not hard halt (D decision from spec)
