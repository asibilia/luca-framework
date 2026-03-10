---
title: "v4: Process retrospective at milestone boundaries"
area: workflow
created: 2026-03-10
source: docs/brainstorm/3.final-workflow.md
priority: P1
complexity: SIMPLE
milestone: v4.0.0
---

## Context

At milestone boundaries (not per-session), AI surfaces a process dashboard and asks the developer one optional question. Keeps process improvement low-touch while still capturing workflow evolution data.

Spec: `docs/brainstorm/3.final-workflow.md` (Process Retrospective)

## Task

### 1. Process Dashboard

Add to `src/skills/general/milestone-complete.skill.ts`:

- Surface 4 metrics from MuninnDB:
  1. Appetite accuracy trend (declared vs actual across phases)
  2. Rework ratio trend (harness fix iterations)
  3. Pre-mortem signal rate (mitigations that mattered)
  4. Agent performance scores (from observability scorecard)

### 2. Developer Question

- Single question: "Anything to change about how we work?"
- Free-form, optional — developer can skip
- Store response as `process:workflow-change` engram in MuninnDB

### 3. Graduation Criteria

- If developer response rate <30% over 10 milestones → drop the question, keep auto-metrics
- Track via `metric:retro-response-rate` engram

## Notes

- Runs once per milestone, NOT per session/phase
- Developer attention: ~1 min
- Depends on: lu-process-data (#101) for metric data
- Complexity-gated: MODERATE+ only (skip for TRIVIAL/SIMPLE milestones)
