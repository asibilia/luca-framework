# Roadmap

## Overview

**Current Milestone:** v1.4.0 — Developer Experience & Verification

---

## v1.4.0 — Developer Experience & Verification

**Theme:** Ship high-WSJF items that improve daily development experience and verification quality.
**Effort:** 13 points across 4 phases

### Phase 30: Dogfood Build Stability

**Goal:** Consume own plugin during development without mid-session breakage. Freeze plugin artifacts during active sessions.
**Complexity:** MODERATE | **Effort:** 3
**Depends on:** None

**Requirements:**

- DOGFOOD-01: Plugin output consumed as workspace self-reference
- DOGFOOD-02: Explicit rebuild script gates recompilation
- DOGFOOD-03: No file watchers trigger plugin recompilation during active sessions
- DOGFOOD-04: Session-start snapshot of compiled artifacts to stable location

**Plans:**

- [ ] 30-01: Workspace self-consumption + rebuild script
- [ ] 30-02: Session snapshot guard + watch exclusion

### Phase 31: TDD-First Verification Pattern

**Goal:** Write tests BEFORE implementation. Add lu-test-writer agent, integrate Red-Green cycle into executor, update verifier to use test results as primary signal.
**Complexity:** COMPLEX | **Effort:** 5
**Depends on:** None

**Requirements:**

- TDD-01: lu-test-writer agent generates tests from plan verification criteria
- TDD-02: Red phase confirmation — tests fail before implementation begins
- TDD-03: Green phase confirmation — tests pass after implementation
- TDD-04: lu-executor integrates TDD cycle
- TDD-05: lu-verifier uses test pass/fail as primary T1 signal
- TDD-06: Fallback for non-testable work defined and documented

**Plans:**

- [ ] 31-01: TDD integration design + lu-test-writer agent
- [ ] 31-02: Red-Green verification loop in lu-executor
- [ ] 31-03: Verifier signal priority update + fallback rules

### Phase 32: Auto-Discuss Web Research Agent

**Goal:** Add `--auto` flag to phase-discuss that spawns a web research agent to autonomously answer discussion questions with cited rationale.
**Complexity:** MODERATE | **Effort:** 3
**Depends on:** Phase 30

**Requirements:**

- AUTO-01: `--auto` flag on phase-discuss skill
- AUTO-02: Auto-selects all gray areas
- AUTO-03: Per-question web research agent uses WebSearch/WebFetch
- AUTO-04: Research scoped to project tech stack (from BRAIN.md)
- AUTO-05: Summary with citations presented before CONTEXT.md write
- AUTO-06: User override before finalizing

**Plans:**

- [ ] 32-01: Auto-discuss flag + research agent definition
- [ ] 32-02: Integration with phase-discuss flow + user override

### Phase 33: Workflow Documentation (Mermaid Mind Maps)

**Goal:** Build comprehensive Mermaid diagrams of the full workflow, agent orchestration, cognition flow, and complexity gates.
**Complexity:** SIMPLE | **Effort:** 2
**Depends on:** Phase 31

**Requirements:**

- DOCS-01: Full workflow mind map (overview level)
- DOCS-02: Agent orchestration diagram
- DOCS-03: Cognition flow diagram
- DOCS-04: Complexity gate diagram
- DOCS-05: Diagrams placed in docs/ and render on GitHub

**Plans:**

- [ ] 33-01: All Mermaid diagrams + documentation placement

---

## Backlog (Deferred)

### v1.5.0 — Cognitive Architecture & State Machine (proposed)

- XState-based workflow state machine (consolidated from ts-driven-state-management + xstate-workflow-state-package)
- Mastra-inspired memory improvements (compression, structured WORKING.md, async monitoring, quality scoring)
- Procedural memory layer (learned skills from experience)

### v1.6.0+ — Multi-Stack & Convention (proposed)

- Opinionated tech stack guidelines (profile-based rule organization)

---

## History

- **v1.0.0** — Core CLI, Integrations, Enterprise Readiness ([View Archive](milestones/v1.0.0-ROADMAP.md))
- **v1.0.1** — Code Hardening: 6 phases, 433 tests, all passed ([View Archive](milestones/v1.0.1-ROADMAP.md))
- **v1.1.0** — Workflow Foundation: 4 phases, 11 plans, 27 requirements, 579 tests ([View Archive](milestones/v1.1.0-ROADMAP.md))
- **v1.2.0** — Intelligent Agent Engine: 5 phases, 25 plans, 29 requirements, 845 tests ([View Archive](milestones/v1.2.0-ROADMAP.md))
- **v1.3.0** — Claude Code Plugin Distribution: 5 phases, 19 plans, 25 requirements, 928 tests ([View Archive](milestones/v1.3.0-ROADMAP.md))
- **v1.3.1** — Post-Audit Cleanup & Plugin Autocomplete: 171 files, 938 tests ([View Archive](milestones/v1.3.1-ROADMAP.md))
- **v1.3.2** — Audit Tech Debt Cleanup: 4 phases, 8 plans, 17 requirements, 992 tests ([View Archive](milestones/v1.3.2-ROADMAP.md))
- **v1.3.3** — Final Audit Sweep: 2 phases, 4 plans, 10 requirements, 992 tests ([View Archive](milestones/v1.3.3-ROADMAP.md))

---

_Roadmap updated: 2026-02-14 (v1.4.0 milestone created)_
