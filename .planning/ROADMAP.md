# Roadmap

## Overview

**Current Milestone:** v1.2.0 — Intelligent Agent Engine

---

## v1.2.0 — Intelligent Agent Engine

**Status:** In Progress (4/5 phases complete)
**Theme:** Make agents smarter — audit, modularize, iterate, plan
**Phases:** 14-18
**Requirements:** 29 — 29 done, 0 pending (see [REQUIREMENTS.md](REQUIREMENTS.md))
**Approach:** Audit-first — audit current systems before building new features

### Phase 14: Execution & Verification Audit ✅

**Goal:** Audit the current lu-execute-phase and lu-verifier pipeline. Map every execution step, classify verification signals by reliability, and add goal-backward verification to check that PLAN.md objectives were actually met (not just tasks completed).
**Depends on:** v1.1.0 (harness + hooks must exist to audit)
**Requirements:** AUDIT-01 through AUDIT-05 (all satisfied)
**Plans:** 3 plans, 2 waves — all complete

**Delivered:**

- AUDIT-REPORT.md with 38 verification signals classified T1-T4
- lu-verifier Step 2.5 (Specification Anchoring) and Step 9.5 (Goal-Backward Objective Check)
- lu-execute-phase Step 7 passes PLAN.md contents to verifier
- MEMORY.md updated with 3 patterns, 2 decisions, 2 pitfalls

---

### Phase 15: Cognition Per-Agent Audit ✅

**Goal:** Audit every agent type's usage of the cognition system (BRAIN/MEMORY/WORKING). Create a matrix of current vs. ideal cognition features per agent. Define cognition profiles and implement selective memory recall.
**Depends on:** Phase 14 (exec audit informs which agents need what cognition)
**Requirements:** COGN-01 through COGN-05 (all satisfied)
**Plans:** 5 plans, 3 waves — all complete

**Delivered:**

- COGNITION-AUDIT.md with 25-agent audit matrix and 4-tier system (T0-T3)
- TAG-VOCABULARY.md with 14 domain tags for selective MEMORY recall
- Cognition schemas (cognitionTierSchema, cognitionConfigSchema) and types
- resolveEffectiveTier() function with complexity-driven tier promotion
- ComplexityGate.cognitionPromotions for COMPLEX and CRITICAL levels
- YAML frontmatter emission in compiled .md files for runtime discovery
- lu-cognition tier-aware selective recall with tag-based pre-filtering
- lu-learner tag assignment in extraction templates
- All 27 agent .ts files wired with cognition metadata
- 107 MEMORY.md entries retroactively tagged
- 11 new MEMORY.md entries (4 patterns, 3 decisions, 4 pitfalls)

---

### Phase 16: Context-Modular Sub-Agent Architecture ✅

**Goal:** Design and implement context isolation for sub-agents. Each sub-agent gets its own context window with only task-relevant information. Orchestrator manages token budget allocation and result aggregation. Implements writer/reviewer separation and progressive context disclosure.
**Depends on:** Phase 15 (cognition profiles inform context loading)
**Requirements:** CTXM-01 through CTXM-06 (all satisfied)
**Plans:** 5 plans, 4 waves — all complete

**Delivered:**

- `src/context/` module (types, defaults, assembly, aggregation, result envelope)
- Agent frontmatter extended with `context` config (all 27 agents)
- ClaudeCompiler emits context in YAML frontmatter
- ComplexityGate extended with `contextPromotions` (independent tracks)
- lu-execute-phase skill updated with context-aware spawning patterns
- Writer/reviewer isolation documented (5 cold, 1 warm)
- Universal result envelope with fallback-to-raw parsing

---

### Phase 17: Iterative Agent Loops (Ralph Wiggum) ✅

**Goal:** Implement the Ralph Wiggum pattern -- externally-controlled iteration loops driven by decision-support utilities, not LLM self-assessment. Add convergence detection, checkpoint/rollback, error classification, cost budgets, and both HITL and AFK modes.
**Depends on:** Phase 16 (sub-agent architecture provides the execution substrate)
**Requirements:** ITER-01 through ITER-07 (all satisfied)
**Plans:** 6 plans, 4 waves -- all complete

**Delivered:**

- `src/iteration/` module (types, convergence, classifier, checkpoint, budget)
- Two-loop pipeline: Loop A (harness mechanical) + Loop B (verifier semantic)
- Multi-signal convergence detection (2-of-3 stale rule with fingerprinting)
- Rule-based error classification with 3-iteration promotion to permanent
- Git tag checkpoints + JSON metadata with full-iteration rollback
- 80% soft stop budget enforcement using iteration count proxy
- HITL/AFK mode support with 4-choice decision menu
- verifyFixIterations added to ComplexityGate (asymmetric, lower than harness)
- source_plan gap attribution in verifier and result envelope
- lu-execute-phase skill updated with Loop A (Step 6.6) and Loop B (Step 7.5)

---

### Phase 18: Usage-Aware Sprint Planner

**Goal:** Build a planner sub-agent that reads the todo backlog and produces optimized session/weekly plans respecting Claude Code's 5-hour rolling window and weekly caps. Implements WSJF scoring, quality-zone-aware scheduling, and Big Rocks First strategy.
**Depends on:** Phase 17 (iterative loops provide the execution engine the planner schedules)
**Requirements:** PLAN-01 through PLAN-07

**Scope:**

- Session planner producing ordered task lists for 3-hour windows
- Quality-zone scheduling (complex tasks at 0-30%, simple at 50-70%)
- WSJF prioritization (Cost of Delay / Job Size)
- Big Rock First + WSJF tail hybrid
- Weekly allocation across multiple sessions
- Token cost estimation with historical calibration
- PM agent with read-only permissions (least privilege)

---

## Dependency Graph

```
Phase 14 (Exec Audit) → Phase 15 (Cognition Audit) → Phase 16 (Context-Modular) → Phase 17 (Ralph Wiggum) → Phase 18 (Sprint Planner)
```

All phases are sequential — each builds on findings/infrastructure from the prior phase.

---

## History

- **v1.0.0** — Core CLI, Integrations, Enterprise Readiness ([View Archive](milestones/v1.0.0-ROADMAP.md))
- **v1.0.1** — Code Hardening: 6 phases, 433 tests, all passed ([View Archive](milestones/v1.0.1-ROADMAP.md))
- **v1.1.0** — Workflow Foundation: 4 phases, 11 plans, 27 requirements, 579 tests ([View Archive](milestones/v1.1.0-ROADMAP.md))

---

_Roadmap updated: 2026-02-11 (Phase 17 complete)_
