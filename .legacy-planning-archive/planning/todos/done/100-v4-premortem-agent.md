---
title: "v4: Pre-mortem agent (lu-premortem)"
area: workflow
created: 2026-03-10
source: docs/brainstorm/3.final-workflow.md
priority: P0
complexity: MODERATE
milestone: v4.0.0
---

## Context

Before planning begins, AI generates domain-specific failure scenarios to surface risks early. Runs at MODERATE+ complexity (design decision D1 — agents underestimate complexity, MODERATE threshold catches work that should have been COMPLEX). Developer approves/rejects a Risk Brief (D2 — lower touch than collaborative writing).

Spec: `docs/brainstorm/3.final-workflow.md` (Phase 1: Pre-Mortem)

## Task

### 1. Create lu-premortem Agent

New agent: `src/agents/luca/lu-premortem.agent.ts`

- Generate 3 domain-specific failure scenarios
- Novelty-enforced: exclude generic categories (no "hallucination might occur" boilerplate)
- Seed with past failures from MuninnDB (`mcp__muninn__muninn_recall` with failure-related tags)
- Each scenario: description, root cause, detection signal, mitigation, verification criteria
- Model routing: DEEP_ANALYSIS preset (balanced@MODERATE, balanced@COMPLEX, capable@CRITICAL)

### 2. Tiered Artifact Output

- **Tier 1**: Risk Brief (<=500 words) — developer + planner read
- **Tier 2**: Full PREMORTEM.md — drill-down on exception only
- **Tier 3**: Raw scenario data — AI-consumed, never in active context

### 3. Developer Checkpoint

- Present Risk Brief for approve/reject/modify (Checkpoint 1, ~2-3 min)
- Approved mitigations become plan constraints
- Verification criteria feed the harness

### 4. Pipeline Integration

- Runs within existing `discussing` state — no new top-level state
- Complexity-gated: skip for TRIVIAL/SIMPLE
- Wire into `src/skills/general/phase-discuss.skill.ts` or lu-router flow

### 5. Model Routing Registration

Add `lu-premortem` to DEEP_ANALYSIS preset in `src/complexity/__helpers/model-routing.ts`

## Notes

- Token cost: ~$0.25-$0.50/run depending on complexity
- $0 for TRIVIAL/SIMPLE (skipped entirely)
- Developer attention: ~2-3 min per run
- Self-tuning governance (todo #103) can auto-skip if signal rate drops below 10%
