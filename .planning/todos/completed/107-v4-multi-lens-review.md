---
title: "v4: Multi-lens review (conditional — gate on pre-mortem signal rate)"
area: workflow
created: 2026-03-10
source: docs/brainstorm/3.final-workflow.md
priority: P3
complexity: MODERATE
milestone: v4.0.0
---

## Context

Conditional expansion — only implement if Phase 1-2 prove value. Pre-mortem mitigations become additional review criteria for the existing 5 parallel reviewers. Separately, a reduced 2-lens review (Architecture + Data) provides focused analysis.

Spec: `docs/brainstorm/3.final-workflow.md` (Phase 4: Conditional Expansion)

## Task

### 1. Pre-Mortem-Aware Code Review

Enhance `src/skills/general/phase-execute.skill.ts` code review step:

- Pass approved pre-mortem mitigations as additional review criteria to existing 5 reviewers
- Reviewers check whether mitigations were actually implemented

### 2. Multi-Lens Review (2 lenses)

Add 2 focused review lenses (Architecture + Data) as optional additional reviewers:

- Architecture lens: structural integrity, dependency direction, module boundaries
- Data lens: data flow, state management, schema consistency
- Model routing: ORCHESTRATOR preset

### 3. Gate Condition

- Only activate if pre-mortem unique catch rate >10% over 20 runs
- Query `metric:signal-rate-aggregate` from MuninnDB
- If gate not met: skip multi-lens, use existing 5 reviewers only

### 4. Risk Multiplier for Complexity

- Core-domain file weighting for MODERATE/COMPLEX promotion
- Files in high-risk domains (auth, payments, state machine) get higher weight in complexity classification
- Integrate into lu-router complexity assessment

## Notes

- Explicitly conditional: "only if Phase 1-2 prove value"
- Do NOT implement until #100 (pre-mortem) and #101 (process data) have run for 20+ cycles
- Token cost: ~$1.08/run for full 4-lens (reduced to 2-lens at ~$0.54/run)
- The 4-agent version was explicitly dropped in the spec — only 2 lenses
