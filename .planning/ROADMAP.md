# Roadmap

## Overview

**Current Milestone:** v2.2.0 — Pi Platform Maturity (Phase 70)

---

## v2.2.0 — Pi Platform Maturity

**Goal:** Complete Pi extension quality hardening (DRY cleanup, build config unification, documentation), validate all 12 extensions against a live Pi runtime, and add background subagent spawning as a major new capability.

### Phase 67 (continued) — Pi Extension DRY Cleanup

**Goal:** Refactor all 11 Pi extensions to use shared helpers, unify build config, add JSDoc documentation.

**Depends on:** None (67-A already complete from v2.1.0)

- [x] Plan 67-B: Refactor all 11 Pi extensions to use shared helpers
- [x] Plan 67-C: Unify build config to single source of truth for Pi extensions
- [x] Plan 67-D: Add JSDoc documentation to Pi extension helpers and functions

### Phase 68 — E2E Pi Runtime Validation

**Goal:** Smoke test all 12 Pi extensions against a live Pi runtime, fix discovered issues, validate cross-extension integration.

**Depends on:** Phase 67 (extensions must use shared helpers before validation)

- [x] Plan 68-A: Extension loading smoke tests, \_\_helpers fix, tool response validation
- [x] Plan 68-B: Permanent E2E test suite (33 tests) for Pi extensions

### Phase 69 — Background Subagent Spawning

**Goal:** Implement fire-and-forget background subagent pattern with process isolation, widget dashboard, and team dispatch integration.

**Depends on:** Phase 68 (runtime must be validated before adding new extension)

- [x] Plan 69-A: Implement luca-subagents.ts (create, list, result, remove — 4 tools)
- [x] Plan 69-B: Teams integration, session management, E2E tests

### Phase 70 — Pi API Learnings Integration

**Goal:** Incorporate Pi API learnings from reference repo analysis. Add subagent auto-delivery (`sendMessage`), `--no-extensions` flag, slash commands, toast notifications, confirm dialogs, auto-inject cognitive context, custom tool rendering, and other Pi-native API improvements.

**Depends on:** Phase 69 (subagent infrastructure must be complete before enhancing it)

- [ ] Plan 70-A: Critical fixes + core infrastructure (--no-extensions, onComplete callback, sendMessage)
- [ ] Plan 70-B: Slash commands, notifications, confirmations, cognitive injection, abort
- [ ] Plan 70-C: Tool rendering, session resilience, rich footer, audit logging

---

---

## Backlog (Future)

### v2.3.0 — Multi-Language Profiles

- Python, Go, Rust tech stack profiles with full opinionated rules
- Mixed-stack project support (multiple profiles active simultaneously)

### v2.4.0+ — Adaptive Learning

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
- **v2.0.0** — Unified Package & Intelligent Routing: 5 phases, 14 plans, 1808 tests ([View Archive](milestones/v2.0.0-ROADMAP.md))
- **v2.1.0** — Pi Library Integration: 7 phases, 22 plans, 2106 tests. Pi as first-class output target with 12 TypeScript extensions, 39 tools, 3-platform compilation, input sanitization, shared helpers ([View Archive](milestones/v2.1.0-ROADMAP.md))
- **v2.2.0** — Pi Platform Maturity: 3 phases, 7 plans, 2143 tests. DRY cleanup, E2E runtime validation, background subagent spawning — 13 extensions, 43 tools ([View Archive](milestones/v2.2.0-ROADMAP.md))

---

_Roadmap updated: 2026-02-27 (v2.2.0 created)_
