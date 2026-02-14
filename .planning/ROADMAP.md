# Roadmap

## Overview

**Current Milestone:** v1.5.0 — Cognitive Architecture & State Machine

---

## v1.5.0 — Cognitive Architecture & State Machine

**Theme:** Replace markdown-based state management with deterministic XState machine, improve memory systems, and add procedural memory for learned skills.
**Effort:** 21 points across 4 phases

### Phase 34: XState Core Machine

**Goal:** Design and implement the core XState v5 state machine modeling the full Luca workflow lifecycle with callable CLI functions, persistence, transition guards, and child actor model.
**Complexity:** COMPLEX | **Effort:** 8
**Depends on:** None

**Requirements:**

- XSTATE-01: Full workflow lifecycle state machine
- XSTATE-02: Callable CLI functions for state transitions
- XSTATE-03: State persistence for session resume
- XSTATE-04: Transition guards for complexity/oversight/gates
- XSTATE-05: Event-driven architecture for hooks/skills
- XSTATE-06: Child actor model (phases as children)

**Plans:**

- [x] 34-01: Machine definition, guards, actions, types (Wave 1)
- [x] 34-02: Persistence layer, CLI interface (Wave 2)
- [x] 34-03: Child actors, event architecture (Wave 3)

### Phase 35: State Machine Integration

**Goal:** Wire the XState machine into existing skills, hooks, and agents — replacing STATE.md reads/writes with machine queries/transitions while maintaining backward-compatible human-readable snapshots.
**Complexity:** COMPLEX | **Effort:** 5
**Depends on:** Phase 34

**Requirements:**

- INTEG-01: STATE.md reads → state machine queries
- INTEG-02: STATE.md writes → state machine transitions
- INTEG-03: Autopilot uses state machine for phase loop
- INTEG-04: phase-execute uses state machine for wave tracking
- INTEG-05: Hooks integrate with state machine
- INTEG-06: Backward-compatible STATE.md snapshots

**Plans:**

- [x] 35-01: CLI bridge, snapshot generator, foundation tests (Wave 1)
- [x] 35-02: Hook integration: session-start, context-monitor, snapshot-sync, pre-commit (Wave 2)
- [x] 35-03: Skill & agent prompt updates, bridge reference rule (Wave 3)

### Phase 36: Memory Compression & Monitoring

**Goal:** Token-aware memory compression, structured WORKING.md schemas, async context monitoring, and phase quality scoring with trend tracking.
**Complexity:** MODERATE | **Effort:** 5
**Depends on:** None

**Requirements:**

- MEM-01: Token-aware MEMORY.md compression
- MEM-02: Auto-summarize WORKING.md on threshold
- MEM-03: Structured WORKING.md schemas (Zod)
- MEM-04: Async context monitoring (PostToolUse throttled)
- MEM-05: Phase quality scoring
- MEM-06: Quality trend tracking

**Plans:**

- [x] 36-01: Schemas, token estimation, compression engine, quality scoring, trend tracking (Wave 1)
- [x] 36-02: Working memory, context monitor, memory parser, PostToolUse hook, barrel exports (Wave 2)

### Phase 37: Procedural Memory Layer

**Goal:** Add a 4th memory type for executable learned procedures — mini-skill templates extracted from successful executions, with recall during planning and success rate tracking.
**Complexity:** MODERATE | **Effort:** 3
**Depends on:** Phase 36

**Requirements:**

- PROC-01: Procedural memory format
- PROC-02: PROCEDURES.md storage
- PROC-03: lu-learner step sequence extraction
- PROC-04: Procedure recall during planning
- PROC-05: Procedure validation and retirement

**Plans:**

- [ ] 37-01: TBD

---

## Backlog (Deferred)

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
- **v1.4.0** — Developer Experience & Verification: 4 phases, 8 plans, 21 requirements, 1036 tests ([View Archive](milestones/v1.4.0-ROADMAP.md))

---

_Roadmap updated: 2026-02-14 (v1.5.0 milestone created)_
