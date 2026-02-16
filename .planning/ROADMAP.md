# Roadmap

## Overview

**Current Milestone:** v1.6.0 — Package & Publish

---

## v1.6.0 — Package & Publish

**Theme:** Extract core components as standalone publishable packages, complete remaining memory improvements, and introduce multi-stack convention support.
**Effort:** 22 points across 4 phases

### Phase 40: XState Package Extraction

**Goal:** Extract the internal XState v5 state machine from `src/state-machine/` into a standalone `packages/luca-state/` package with its own package.json, CLI entry point, types, and comprehensive test suite — zero framework dependencies.
**Complexity:** COMPLEX | **Effort:** 8
**Depends on:** None

**Requirements:**

- PKG-01: Package structure with separate `packages/luca-state/` directory
- PKG-02: Core machine definition extracted with zero framework dependencies
- PKG-03: Callable CLI entry point (`luca-state transition`, `luca-state read-status`, etc.)
- PKG-04: State persistence (serialize/deserialize to disk) as standalone feature
- PKG-05: Transition guards extracted with configurable complexity/oversight/gate rules
- PKG-06: TypeScript types and Zod schemas exported for consumer type safety
- PKG-07: Comprehensive test suite (unit + integration) for standalone package

**Plans:**

- [ ] 40-01: Package scaffolding, core machine + types + guards extraction, shared utils extraction (Wave 1)
- [ ] 40-02: Persistence layer, CLI entry point, event architecture (Wave 2)
- [ ] 40-03: Snapshot generator, full test suite, package documentation (Wave 3)

### Phase 41: Framework Integration Rewire

**Goal:** Update the internal framework to consume from `packages/luca-state/` instead of `src/state-machine/`, update all bridge CLI paths, maintain backward compatibility for skill/agent CLI calls.
**Complexity:** MODERATE | **Effort:** 5
**Depends on:** Phase 40

**Requirements:**

- PKG-08: Internal framework updated to consume from `packages/luca-state/` instead of `src/state-machine/`

**Plans:**

- [ ] 41-01: Update monorepo workspace config, rewire all `src/` imports, update bridge CLI paths (Wave 1)
- [ ] 41-02: Update all skill/agent shell commands referencing bridge, backward-compat shims, integration tests (Wave 2)

### Phase 42: Memory Suspend/Resume & Milestone Recall

**Goal:** Complete remaining Mastra-inspired memory improvements — suspend/resume with persistent state, auto-persist on context warnings, and milestone-scoped memory recall with temporal relevance scoring.
**Complexity:** MODERATE | **Effort:** 5
**Depends on:** None

**Requirements:**

- MEM-01: Suspend/resume with persistent state — step-level checkpoints within phases
- MEM-02: Auto-persist WORKING.md on context HIGH warning
- MEM-03: Explicit suspend semantics in phase-execute (mark phase `suspended` with resume metadata)
- MEM-04: Milestone-scoped memory recall — weight current milestone entries higher
- MEM-05: Milestone tags on MEMORY.md entries for temporal relevance scoring

**Plans:**

- [ ] 42-01: Suspend/resume types, checkpoint persistence, auto-persist on context warning, phase-execute suspend semantics (Wave 1)
- [ ] 42-02: Milestone tags for MEMORY.md entries, milestone-scoped recall scoring, memory bridge updates, tests (Wave 2)

### Phase 43: Tech Stack Guideline Profiles

**Goal:** Organize code style rules under named tech stack profiles with config toggle and auto-detection integration, enabling multi-stack convention support.
**Complexity:** MODERATE | **Effort:** 4
**Depends on:** None

**Requirements:**

- STACK-01: Tech stack profile structure (typescript, python, go, rust directories)
- STACK-02: Migrate existing TS-specific rules under `typescript` profile
- STACK-03: Config toggle (`workflow.opinionated_guidelines: true/false`)
- STACK-04: Integration with `lu-map-codebase` stack detection for auto-selection
- STACK-05: Build system conditionally includes/excludes guidelines per selected profile

**Plans:**

- [ ] 43-01: Profile directory structure, config toggle, migrate TS-specific rules to typescript profile (Wave 1)
- [ ] 43-02: Build system conditional includes, codebase-mapper integration, placeholder profiles for python/go/rust, tests (Wave 2)

---

## Parallelization

Phases 40, 42, and 43 have no mutual dependencies and can execute in parallel waves where plan-level parallelism is enabled. Phase 41 depends on Phase 40 and must execute after it.

```
Wave A (parallel):  Phase 40 (XState extraction) + Phase 42 (Memory) + Phase 43 (Profiles)
Wave B (sequential): Phase 41 (Integration rewire, after Phase 40)
```

---

## Backlog (Deferred)

### v1.7.0+ — Advanced Memory & Multi-Stack (proposed)

- Model-aware task routing (complexity-to-model mapping per agent)
- Procedure evolution via reinforcement learning patterns
- Python, Go, Rust tech stack profiles with full guidelines
- Mixed-stack project support (multiple profiles active simultaneously)

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
- **v1.4.0** — Developer Experience & Verification: 4 phases, 8 plans, 21 requirements, 1042 tests ([View Archive](milestones/v1.4.0-ROADMAP.md)) _(requirement count corrected from 22 to 21 after recount; scope unchanged)_
- **v1.5.0** — Cognitive Architecture & State Machine: 6 phases, 14 plans, 35 requirements, 1654 tests ([View Archive](milestones/v1.5.0-ROADMAP.md))

---

_Roadmap updated: 2026-02-16 (v1.6.0 milestone created)_
