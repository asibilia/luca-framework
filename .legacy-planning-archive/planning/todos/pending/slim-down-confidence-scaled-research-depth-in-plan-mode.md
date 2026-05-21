---
title: "Slim-down: confidence-scaled research depth in plan mode"
area: workflow
created: 2026-05-12
priority: medium
source: workflow-slim-down
---

## Task

Slim-down: confidence-scaled research depth in plan mode

---
confidence: medium
externalResearch: false
priority: 3
---

# Context

Currently research spawns 5 parallel subagents regardless of complexity. Plan
mode should pick subagent count + scope from frontmatter confidence.

## Heuristic (proposed, refine in architect)

- `confidence: high` + `externalResearch: false` → 0 research subagents; validation-only pass against user-provided spec.
- `confidence: medium` + `externalResearch: false` → 2 research subagents (architecture + risk).
- `confidence: low` + `externalResearch: false` → 5 research subagents (current default).
- `externalResearch: true` (any confidence) → add Firecrawl-backed external researcher subagent.

## Scope

- Plan-mode context-gather substep reads frontmatter, picks heuristic.
- Subagent spawn loop driven by chosen scope.
- Telemetry captures chosen scope per run for later tuning.

## Acceptance

- HIGH-confidence todo run spawns 0 research subagents.
- LOW-confidence todo run spawns 5.
- Test fixtures cover all three confidence buckets.

## Depends on

- luca:1-plan mode todo
- Frontmatter schema
- (Bonus signal) Wave 1 telemetry shipped — to validate the heuristic over time.

