# Roadmap

## Overview

**Current Milestone:** v1.3.3 — Final Audit Sweep

---

## v1.3.3 — Final Audit Sweep

**Goal:** Address all remaining tech debt from the v1.3.2 audit. Deprecate redundant build scripts, decompose monolithic functions, migrate remaining tests to Bun APIs, and enforce no-classes rule in registries.

**Source:** v1.3.2 Milestone Audit — 10 tech debt backlog items (5 HIGH, 12 MEDIUM, 12 LOW findings filtered to actionable items)

### Phase 28: Build Script Cleanup

**Goal:** Deprecate redundant per-platform build scripts, co-locate hook config, decompose generateAllOutputs() monolith, and register Luca-specific entities in registries.
**Depends on:** None

Plans:

- [ ] 28-01: Deprecate build-claude.ts/build-cursor.ts, move hook config to src/hooks/ (Wave 1)
- [ ] 28-02: Decompose generateAllOutputs(), register Luca entities in registries (Wave 2)

### Phase 29: Test Quality & Code Hygiene

**Goal:** Refactor registries to factory functions, extract drift test helpers, migrate plugin spec tests to Bun APIs, and clean up stale error messages.
**Depends on:** Phase 28

Plans:

- [ ] 29-01: Registry factory functions, category staleness test, stale error messages (Wave 1)
- [ ] 29-02: Extract drift test helpers, migrate plugin spec tests, extract shared test entities (Wave 2)

---

## History

- **v1.0.0** — Core CLI, Integrations, Enterprise Readiness ([View Archive](milestones/v1.0.0-ROADMAP.md))
- **v1.0.1** — Code Hardening: 6 phases, 433 tests, all passed ([View Archive](milestones/v1.0.1-ROADMAP.md))
- **v1.1.0** — Workflow Foundation: 4 phases, 11 plans, 27 requirements, 579 tests ([View Archive](milestones/v1.1.0-ROADMAP.md))
- **v1.2.0** — Intelligent Agent Engine: 5 phases, 25 plans, 29 requirements, 845 tests ([View Archive](milestones/v1.2.0-ROADMAP.md))
- **v1.3.0** — Claude Code Plugin Distribution: 5 phases, 19 plans, 25 requirements, 928 tests ([View Archive](milestones/v1.3.0-ROADMAP.md))
- **v1.3.1** — Post-Audit Cleanup & Plugin Autocomplete: 171 files, 938 tests ([View Archive](milestones/v1.3.1-ROADMAP.md))
- **v1.3.2** — Audit Tech Debt Cleanup: 4 phases, 8 plans, 17 requirements, 992 tests ([View Archive](milestones/v1.3.2-ROADMAP.md))

---

_Roadmap updated: 2026-02-13 (v1.3.3 milestone created)_
