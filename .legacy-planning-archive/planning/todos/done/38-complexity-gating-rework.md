---
title: "Rework complexity gating: remove step gating, unify lu/autopilot pipeline"
area: framework/workflow
created: 2026-03-12
source: v4.1.0 milestone retro feedback
priority: P1
complexity: COMPLEX
milestone: v5.0.0
---

## Context

Complexity gating was designed to limit token use by skipping workflow steps for simpler tasks. This is short-sighted — it sacrifices output quality for cost savings. The framework's goals are exceptional output AND lowest token cost. These are achievable simultaneously through memory-driven context optimization rather than step omission.

Currently, `/lu` base skills gate steps based on complexity (skip research for TRIVIAL, skip review for SIMPLE, etc.) while `/autopilot` runs the full pipeline regardless. This divergence means the same task produces different quality output depending on which entry point is used.

**MuninnDB engram:** `decision:complexity-gating-rework-v5` (ID: 01KKH9GT7Q54AZZ5CS2FGJ0EW5)

## Decision

1. **Complexity controls model tier only** — The `MODEL_ROUTING_TABLE` (7 named presets) remains the sole mechanism complexity drives. No other complexity-driven adjustments initially; reintroduce selectively based on observed workflow behavior.

2. **All steps always run** — Research, discussion, planning, verification, code review, UAT, and learning capture run at every complexity level. No exceptions.

3. **Token optimization via memory** — Instead of skipping steps, each step assembles laser-focused context from MuninnDB. A TRIVIAL task's research step explores with tighter scope and recalls fewer engrams. Savings come from context precision, not step omission.

4. **Unify /lu and /autopilot** — Both follow the same pipeline. The only difference is autonomy: autopilot makes decisions without human input, but runs the same steps. Rip out step gating from ALL skills in a single effort.

## Task

1. Audit all skills that gate steps on complexity level (phase-execute, lu, autopilot, session-plan, etc.)
2. Remove all step-gating conditionals — every step runs regardless of complexity
3. Align /lu and /autopilot to share the same pipeline (autopilot = same steps, autonomous decisions)
4. Update the `complexity-gating` rule to reflect the new model (remove iteration count scaling table, clarify model-tier-only scope)
5. Adjust research/recall depth per step to use tighter scope for lower complexity (memory-driven, not step-skipping)
6. Update complexity schemas if any encode step-gating behavior
7. Verify the unified pipeline works end-to-end at TRIVIAL through CRITICAL

## Notes

- The `complexity-gating.md` rule already states "ALL workflow steps run at every complexity level" but the implementation doesn't match — this task closes that gap
- The iteration count scaling table in the rule (harness fix iterations, verify fix iterations, etc.) may still be useful — evaluate during implementation whether these are step-gating or just parameter tuning
- This is a prerequisite for the memory-as-optimization vision where MuninnDB recall quality directly drives token efficiency
