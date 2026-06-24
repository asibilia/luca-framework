---
title: "v4: Self-tuning governance and graduation criteria"
area: workflow
created: 2026-03-10
source: docs/brainstorm/3.final-workflow.md
priority: P1
complexity: MODERATE
milestone: v4.0.0
---

## Context

Every new v4 component must earn its place. Self-tuning governance monitors signal rates and can auto-disable expensive components that aren't providing value. "Every component earns its place — explicit graduation criteria; drop if not valuable."

Spec: `docs/brainstorm/3.final-workflow.md` (Graduation Criteria / Self-tuning governance)

## Task

### 1. Graduation Criteria (Kill Switches)

Wire thresholds into lu-process-data agent output:

| Component        | Metric                  | Threshold                   | Action                                   |
| ---------------- | ----------------------- | --------------------------- | ---------------------------------------- |
| Pre-mortem       | Unique catch rate       | <10% over 20 MODERATE+ runs | Auto-skip                                |
| Process retro    | Developer response rate | <30% over 10 milestones     | Drop question, keep auto-metrics         |
| Outcome tracking | Completion rate         | <20% over 10 features       | Drop contextual trigger, keep `/outcome` |
| Divergent mode   | Opt-in rate             | <10% over 20 milestones     | Drop nudge                               |

### 2. Signal Rate Tracking

- lu-process-data computes `metric:signal-rate` per phase
- Aggregate across runs to determine if pre-mortem is earning its cost
- Store running average as `metric:signal-rate-aggregate` engram

### 3. Auto-Skip Logic

Add gate check before pre-mortem invocation:

- Query MuninnDB for `metric:signal-rate-aggregate`
- If signal rate <10% over last 20 MODERATE+ runs → skip pre-mortem
- Log skip decision as `process:auto-skip` engram for transparency

### 4. State Machine Integration

Add `gate-check --gate=premortem` to bridge CLI in `packages/luca-framework/src/state/bridge.ts`

## Notes

- Token cost: ~$0.003/run (monitoring built into lu-process-data)
- This is the safety net ensuring v4 additions don't become dead weight
- Depends on: lu-process-data (#101) for metric collection
