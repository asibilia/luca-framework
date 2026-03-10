---
title: "v4: Process data agent (lu-process-data)"
area: workflow
created: 2026-03-10
source: docs/brainstorm/3.final-workflow.md
priority: P0
complexity: MODERATE
milestone: v4.0.0
---

## Context

After lu-learner captures code knowledge, a new process data agent auto-computes workflow health metrics. These metrics feed self-tuning governance and milestone retrospectives. Runs in the existing `learning` state.

Spec: `docs/brainstorm/3.final-workflow.md` (Phase 5: Learning & Process Data)

## Task

### 1. Create lu-process-data Agent

New agent: `src/agents/luca/lu-process-data.agent.ts`

Auto-compute 3 metrics per phase:

1. **Appetite accuracy** — declared budget vs actual token consumption
2. **Rework ratio** — agent output requiring significant rework (harness fix iterations / total iterations)
3. **Pre-mortem signal rate** — mitigations from pre-mortem that actually prevented failures

### 2. MuninnDB Storage

Store as new engram types:

- `metric:appetite-accuracy` — per-phase accuracy record
- `metric:rework-ratio` — per-phase rework measurement
- `metric:signal-rate` — pre-mortem effectiveness (only when pre-mortem ran)

### 3. Model Routing

- Preset: FAST_PROMOTED (fast at all levels except balanced@CRITICAL)
- Add to `src/complexity/__helpers/model-routing.ts`

### 4. Pipeline Integration

- Runs sequentially after lu-learner in `learning` state
- Add to `src/skills/general/phase-execute.skill.ts` after the learning capture step

### 5. DORA Metrics (COMPLEX+ only)

Log two additional metrics at COMPLEX+ complexity:

- **Lead time**: invocation → commit duration
- **Change failure rate**: verification failures per run

Store as `metric:lead-time` and `metric:change-failure-rate` engrams.

## Notes

- Token cost: ~$0.001-$0.003/run (very cheap due to FAST_PROMOTED routing)
- These metrics are consumed by: process retro (#104), self-tuning governance (#103)
- Depends on: appetite declaration (#99) being implemented for appetite accuracy metric
