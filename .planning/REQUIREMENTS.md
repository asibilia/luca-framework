# Requirements — v1.2.0 Intelligent Agent Engine

## Overview

Transform Luca's agent system from static, one-shot execution into an intelligent, self-correcting engine with context-aware scheduling. Audit current systems first, then build modular architecture, iterative loops, and usage-aware planning.

**Core Value:** Zero-friction adoption of structured AI workflows
**Motivation:** v1.1.0 built the enforcement foundation (hooks, harness, complexity gates). v1.2.0 makes the agents themselves smarter — they audit their own effectiveness, isolate context, iterate on failures, and plan within usage constraints.

---

## v1.2.0 Requirements

### Execution & Verification Audit (Phase 14)

- [x] **AUDIT-01**: Audit report maps every execution step (lu-execute-phase) and identifies which steps use external verification signals vs. LLM self-assessment
- [x] **AUDIT-02**: Verification signal inventory classifies each signal by reliability tier (deterministic > schema > LLM-judge > self-assessment)
- [x] **AUDIT-03**: Goal-backward verification check added — verifier confirms original PLAN.md objective was met, not just that tasks completed
- [x] **AUDIT-04**: Specification anchoring implemented — PLAN.md re-injected at verification checkpoints to prevent goal drift
- [x] **AUDIT-05**: Audit findings captured as actionable improvements in MEMORY.md patterns/pitfalls

### Cognition Per-Agent Audit (Phase 15)

- [x] **COGN-01**: Audit matrix maps each agent type to its current cognition features (BRAIN load, MEMORY recall, WORKING usage, pre-flight, learning extraction)
- [x] **COGN-02**: Gap analysis identifies agents missing cognition features they should have based on their role
- [x] **COGN-03**: Cognition profiles defined — at least 3 tiers (stateless, session-aware, fully-cognitive) with clear criteria for each
- [x] **COGN-04**: Per-agent cognition configuration via agent metadata (not hardcoded conditionals)
- [x] **COGN-05**: Selective MEMORY recall implemented — agents load only task-relevant patterns/decisions/pitfalls, not the entire MEMORY.md

### Context-Modular Sub-Agent Architecture (Phase 16)

- [x] **CTXM-01**: Sub-agent context isolation — each sub-agent operates in its own context window with only task-relevant information loaded
- [x] **CTXM-02**: Context budget allocation — orchestrator distributes token budget across sub-agents based on task complexity (reserve 25-50% for output)
- [x] **CTXM-03**: Result aggregation pattern — sub-agent outputs synthesized by orchestrator without re-loading full sub-agent context
- [x] **CTXM-04**: Progressive context disclosure — information loaded on-demand as sub-agents need it, not all upfront
- [x] **CTXM-05**: Writer/reviewer separation — writing and reviewing happen in separate context windows to prevent bias
- [x] **CTXM-06**: Sub-agent spawning follows existing Claude Code Task tool patterns (`.claude/agents/` definitions, built-in subagent types)

### Iterative Agent Loops — Ralph Wiggum (Phase 17)

- [ ] **ITER-01**: Ralph Wiggum loop controller — external script drives iteration using Stop hook, not LLM self-assessment of completion
- [ ] **ITER-02**: Convergence detection — loop detects when iterations stop making progress (same errors repeated, no delta between runs)
- [ ] **ITER-03**: Hard iteration limits configurable per complexity level (default: 3 for standard, 5 for complex, 10 for critical)
- [ ] **ITER-04**: Checkpoint/rollback — each iteration saves state so failed iterations can be rolled back without losing prior progress
- [ ] **ITER-05**: Error classification — failures classified as transient (retry), correctable (retry with feedback), or permanent (escalate)
- [ ] **ITER-06**: Cost budget enforcement — iteration loops respect per-task token budget and halt when budget exhausted
- [ ] **ITER-07**: Both HITL (human-in-the-loop) and AFK (autonomous) modes supported with configurable approval gates

### Usage-Aware Sprint Planner (Phase 18)

- [ ] **PLAN-01**: Session planner reads pending todos/backlog and produces an ordered task list optimized for a single 5-hour rolling window
- [ ] **PLAN-02**: Quality-zone-aware scheduling — complex tasks scheduled in peak zone (0-30% context), simple tasks in degrading zone (50-70%)
- [ ] **PLAN-03**: WSJF scoring implemented — tasks ranked by (business value + time criticality + risk reduction) / estimated effort
- [ ] **PLAN-04**: Big Rock First strategy — session starts with highest-impact dependency-free task, then progresses to smaller tasks
- [ ] **PLAN-05**: Weekly planner distributes work across multiple sessions within weekly usage cap (60% needle movers, 25% quick wins, 10% maintenance, 5% reserve)
- [ ] **PLAN-06**: Token cost estimation model tracks actual vs. estimated costs per task type and improves over time
- [ ] **PLAN-07**: PM/planner agent is read-only — produces plans but cannot execute changes (least privilege separation)

## Out of Scope

| Feature                                        | Reason                                                              |
| ---------------------------------------------- | ------------------------------------------------------------------- |
| New stack templates (Python, Node.js, Next.js) | Deferred — workflow intelligence must be solid first                |
| Agent marketplace / sharing registry           | Requires distribution infrastructure beyond current scope           |
| Cross-IDE support (VS Code)                    | Cursor-first, expand later                                          |
| Procedural memory layer (4th memory type)      | Depends on cognition audit findings — may be v1.3.0                 |
| TDD-first verification pattern                 | Captured as pending todo — depends on harness maturity              |
| Checkpoint/rollback as standalone system       | Integrated into Ralph Wiggum loops (ITER-04) rather than standalone |
| Real-time Claude Code usage API integration    | API is undocumented/unstable; use file-based tracking instead       |

## Traceability

| Requirement | Phase                        | Priority | Status  | Source Todo                                   |
| ----------- | ---------------------------- | -------- | ------- | --------------------------------------------- |
| AUDIT-01    | Phase 14 (Exec/Verify Audit) | Critical | ✅ Done | execution-verification-effectiveness-audit.md |
| AUDIT-02    | Phase 14 (Exec/Verify Audit) | Critical | ✅ Done | execution-verification-effectiveness-audit.md |
| AUDIT-03    | Phase 14 (Exec/Verify Audit) | High     | ✅ Done | execution-verification-effectiveness-audit.md |
| AUDIT-04    | Phase 14 (Exec/Verify Audit) | High     | ✅ Done | execution-verification-effectiveness-audit.md |
| AUDIT-05    | Phase 14 (Exec/Verify Audit) | Medium   | ✅ Done | execution-verification-effectiveness-audit.md |
| COGN-01     | Phase 15 (Cognition Audit)   | Critical | ✅ Done | cognition-features-per-agent-audit.md         |
| COGN-02     | Phase 15 (Cognition Audit)   | Critical | ✅ Done | cognition-features-per-agent-audit.md         |
| COGN-03     | Phase 15 (Cognition Audit)   | High     | ✅ Done | cognition-features-per-agent-audit.md         |
| COGN-04     | Phase 15 (Cognition Audit)   | High     | ✅ Done | cognition-features-per-agent-audit.md         |
| COGN-05     | Phase 15 (Cognition Audit)   | High     | ✅ Done | cognition-features-per-agent-audit.md         |
| CTXM-01     | Phase 16 (Context-Modular)   | Critical | ✅ Done | context-modularity-subagent-architecture.md   |
| CTXM-02     | Phase 16 (Context-Modular)   | High     | ✅ Done | context-modularity-subagent-architecture.md   |
| CTXM-03     | Phase 16 (Context-Modular)   | High     | ✅ Done | context-modularity-subagent-architecture.md   |
| CTXM-04     | Phase 16 (Context-Modular)   | High     | ✅ Done | progressive-context-disclosure.md             |
| CTXM-05     | Phase 16 (Context-Modular)   | Medium   | ✅ Done | writer-reviewer-separation.md                 |
| CTXM-06     | Phase 16 (Context-Modular)   | Medium   | ✅ Done | context-modularity-subagent-architecture.md   |
| ITER-01     | Phase 17 (Iterative Loops)   | Critical | Pending | ralph-wiggum-iterative-agent-loops.md         |
| ITER-02     | Phase 17 (Iterative Loops)   | Critical | Pending | ralph-wiggum-iterative-agent-loops.md         |
| ITER-03     | Phase 17 (Iterative Loops)   | High     | Pending | ralph-wiggum-iterative-agent-loops.md         |
| ITER-04     | Phase 17 (Iterative Loops)   | High     | Pending | checkpoint-and-rollback-system.md             |
| ITER-05     | Phase 17 (Iterative Loops)   | High     | Pending | ralph-wiggum-iterative-agent-loops.md         |
| ITER-06     | Phase 17 (Iterative Loops)   | Medium   | Pending | ralph-wiggum-iterative-agent-loops.md         |
| ITER-07     | Phase 17 (Iterative Loops)   | Medium   | Pending | ralph-wiggum-iterative-agent-loops.md         |
| PLAN-01     | Phase 18 (Sprint Planner)    | Critical | Pending | usage-aware-sprint-planner.md                 |
| PLAN-02     | Phase 18 (Sprint Planner)    | Critical | Pending | usage-aware-sprint-planner.md                 |
| PLAN-03     | Phase 18 (Sprint Planner)    | High     | Pending | usage-aware-sprint-planner.md                 |
| PLAN-04     | Phase 18 (Sprint Planner)    | High     | Pending | usage-aware-sprint-planner.md                 |
| PLAN-05     | Phase 18 (Sprint Planner)    | High     | Pending | usage-aware-sprint-planner.md                 |
| PLAN-06     | Phase 18 (Sprint Planner)    | Medium   | Pending | usage-aware-sprint-planner.md                 |
| PLAN-07     | Phase 18 (Sprint Planner)    | Medium   | Pending | usage-aware-sprint-planner.md                 |

---

## Research Summary

Research conducted across 5 parallel agents covering: execution/verification patterns (LangGraph, CrewAI, AutoGen, Aider, OpenHands, Claude Agent SDK), cognition/memory architectures (MemGPT, M2PA, AriGraph, tiered memory), sub-agent architecture (context engineering, TALE framework, token budgeting), iterative loops (Reflexion, MAR, Ralph Wiggum, Tree of Thoughts, CodeTree), and usage-aware planning (WSJF, context rot research, session optimization strategies).

Key research findings informing requirements:

1. **Never trust LLM self-assessment** — Always use external deterministic signals (AUDIT-01, AUDIT-02)
2. **Specification anchoring prevents goal drift** — Re-inject PLAN.md at checkpoints (AUDIT-04)
3. **Three-tier memory converging** — Working, episodic, semantic as industry standard (COGN-03)
4. **Reserve 25-50% of token budget for output** — TALE framework principle (CTXM-02)
5. **External loop control > self-assessment** — Ralph Wiggum Stop hook pattern (ITER-01)
6. **Context rot is non-linear** — Quality drops sharply after ~50% utilization (PLAN-02)
7. **WSJF maximizes economic value** — Cost of Delay / Job Size ordering (PLAN-03)
8. **Big Rocks First + WSJF tail** — Hybrid scheduling outperforms pure velocity (PLAN-04)

---

_Requirements defined: 2026-02-11_
_Total requirements: 29 (5 + 5 + 6 + 7 + 7 per phase, minus 1 overlap)_
