# Roadmap

## Overview

**Current Milestone:** v1.8.0 — Functional Architecture & Bridge Unification

---

## v1.8.0 — Functional Architecture & Bridge Unification

**Goal:** Eliminate all class-based patterns from agents and skills, completing the functional architecture migration started with rules in v1.6.0. Unify state access through the typed bridge layer.

### Phase 52 — Functional Agent Factories (COMPLEX)

**Goal:** Refactor all 28 agent classes to functional `createAgent()` factory pattern, matching the proven `createRule()` pattern.

- [ ] Plan 52-A: Create `createAgent()` factory function and refactor agent base
- [ ] Plan 52-B: Migrate all 28 agents from class to factory pattern
- [ ] Plan 52-C: Update agent registry and verify tests pass

### Phase 53 — Functional Skill Factories (COMPLEX)

**Goal:** Refactor all 45 skill classes to functional `createSkill()` factory pattern.

- [ ] Plan 53-A: Create `createSkill()` factory function and refactor skill base
- [ ] Plan 53-B: Migrate all 45 skills from class to factory pattern
- [ ] Plan 53-C: Update skill registry and verify tests pass

### Phase 54 — State Machine Bridge Migration (MODERATE)

**Goal:** Migrate remaining skills to state machine bridge, replacing direct STATE.md read/write with typed bridge CLI.

**Depends on:** Phase 53

- [ ] Plan 54-A: Audit all skills for STATE.md access patterns
- [ ] Plan 54-B: Migrate skills to bridge with STATE.md fallback

---

## Backlog (Deferred)

### v1.9.0+ — Package Unification & Advanced Features (proposed)

- Unify npm package: merge state management + CLI scaffold + plugin runner
- Repo structure architect / maintainer subagent
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
- **v1.4.0** — Developer Experience & Verification: 4 phases, 8 plans, 21 requirements, 1042 tests ([View Archive](milestones/v1.4.0-ROADMAP.md))
- **v1.5.0** — Cognitive Architecture & State Machine: 6 phases, 14 plans, 35 requirements, 1654 tests ([View Archive](milestones/v1.5.0-ROADMAP.md))
- **v1.6.0** — Package & Publish: 4 phases, 9 plans, 18 requirements, 1755 tests ([View Archive](milestones/v1.6.0-ROADMAP.md))
- **v1.7.0** — Codebase Health & Build Stability: 8 phases, 13 plans, 1763 tests ([View Archive](milestones/v1.7.0-ROADMAP.md))

---

_Roadmap updated: 2026-02-25 (v1.8.0 milestone started)_
