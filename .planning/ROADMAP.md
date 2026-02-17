# Roadmap

## Overview

**Current Milestone:** v1.7.0 — Codebase Health & Build Stability

---

## v1.7.0 — Codebase Health & Build Stability

**Goal:** Resolve accumulated tech debt from v1.6.0, fix all TypeScript errors, clean repo hygiene, consolidate test conventions, and ensure package configs are publish-ready.

### Phase 44 — Quick Wins: Repo Hygiene

**Goal:** Clean committed artifacts, rename convention violations, remove empty directories.
**Complexity:** TRIVIAL
**Depends on:** None

- [ ] Plan 44-A: Remove git-tracked coverage/ and .DS_Store artifacts
- [ ] Plan 44-B: Rename snake_case rule files to kebab-case
- [ ] Plan 44-C: Clean empty directories and document phase numbering gaps

### Phase 45 — TypeScript Error Resolution

**Goal:** Fix all 97 TypeScript errors across 26 files to achieve clean `tsc --noEmit`.
**Complexity:** MODERATE
**Depends on:** None

- [ ] Plan 45-A: Fix source code TypeScript errors (11 files, ~19 errors)
- [ ] Plan 45-B: Fix script TypeScript errors (3 files, ~15 errors)
- [ ] Plan 45-C: Fix test file TypeScript errors (12 files, ~63 errors)

### Phase 46 — Package Configuration Health

**Goal:** Fix package.json main fields, add missing tsconfigs, clean unused path aliases.
**Complexity:** SIMPLE
**Depends on:** None

- [ ] Plan 46-A: Fix package.json and tsconfig health issues

### Phase 47 — Test File Consolidation

**Goal:** Establish test convention and move scattered test files to centralized `__tests__/`.
**Complexity:** MODERATE
**Depends on:** Phase 45

- [ ] Plan 47-A: Consolidate scattered test files into **tests**/ directory

### Phase 48 — Bun API Migration

**Goal:** Replace Node.js fs/path APIs with Bun equivalents in luca-framework package.
**Complexity:** MODERATE
**Depends on:** Phase 45

- [ ] Plan 48-A: Migrate node:fs and node:path to Bun equivalents

---

## Backlog (Deferred)

### v1.8.0+ — Architectural Refactoring (proposed)

- Refactor 62 agent/skill classes to functional factories (critical, high effort)
- Migrate remaining 38 skills to state machine bridge
- Unify npm package: merge state management + CLI scaffold + plugin runner
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

---

_Roadmap updated: 2026-02-16 (v1.6.0 milestone completed)_
