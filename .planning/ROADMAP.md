# Roadmap

## Overview

**Current Milestone:** v2.0.0 — Unified Package & Intelligent Routing

---

## v2.0.0 — Unified Package & Intelligent Routing

**Goal:** Consolidate `luca-state`, `create-luca`, and `luca-framework` into a single `@alecsibilia/luca-framework` npm package with CLI commands, plugin distribution support, and model-aware task routing.

### Phase 56 — Repo Structure Architect Agent

**Goal:** Create `lu-repo-architect` agent and `repo-audit` skill for automated repo hygiene auditing.

**Depends on:** None

- [x] Plan 56-A: Agent schema and `createAgent()` factory implementation
- [x] Plan 56-B: `repo-audit` skill with interactive and automated modes
- [x] Plan 56-C: Tests and build validation (1791 tests, 0 drift)

### Phase 57 — Package Consolidation

**Goal:** Absorb `luca-state` and `create-luca` into a single `@alecsibilia/luca-framework` package.

**Depends on:** Phase 56

- [x] Plan 57-A: Audit three packages, map exports, design merged structure
- [x] Plan 57-B: Move `luca-state` into unified package, migrate tests
- [x] Plan 57-C: Absorb `create-luca`, remove old packages
- [x] Plan 57-D: Update all bridge references (40+ files), full validation

### Phase 58 — CLI Commands & Plugin Distribution

**Goal:** Add `run:claude` and `run:cursor` CLI commands, structure `dist/` for `--plugin-dir` compatibility, publish-ready packaging.

**Depends on:** Phase 57

- [x] Plan 58-A: Add `run:claude` and `run:cursor` CLI commands
- [x] Plan 58-B: Structure `dist/` for `--plugin-dir` compatibility
- [x] Plan 58-C: Package metadata v2.0.0, `npm pack` validation

### Phase 59 — Model-Aware Task Routing

**Goal:** Extend complexity gating and agent config with model preference declarations for cost-appropriate model selection.

**Depends on:** Phase 57

- [ ] Plan 59-A: Extend `AgentFrontmatterSchema` and `ComplexityGateSchema` with model routing fields
- [ ] Plan 59-B: Update `lu-router` and key agents with model routing preferences
- [ ] Plan 59-C: Tests and documentation for model routing

### Phase 60 — Integration Testing & Release Prep

**Goal:** End-to-end validation and v2.0.0 release preparation.

**Depends on:** Phases 57, 58, 59

- [ ] Plan 60-A: End-to-end integration tests (install, init, run:claude, state bridge)
- [ ] Plan 60-B: Archive milestone, bump version, update CHANGELOG

---

## Backlog (Future)

### v2.1.0 — Multi-Language Profiles

- Python, Go, Rust tech stack profiles with full opinionated rules
- Mixed-stack project support (multiple profiles active simultaneously)

### v2.2.0+ — Adaptive Learning

- Procedure evolution via reinforcement learning patterns

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
- **v1.8.0** — Functional Architecture & Bridge Unification: 3 phases, 8 plans, 8 requirements, 1763 tests ([View Archive](milestones/v1.8.0-ROADMAP.md))
- **v1.9.0** — Repo Consistency Cleanup: 1 phase, 3 plans, 1763 tests ([View Archive](milestones/v1.9.0-ROADMAP.md))

---

_Roadmap updated: 2026-02-26 (v2.0.0 milestone started)_
