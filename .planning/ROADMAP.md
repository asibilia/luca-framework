# Roadmap

## Overview

**Current Milestone:** v1.3.2 — Audit Tech Debt Cleanup
**Requirements:** 17
**Phases:** 24-27

---

## v1.3.2: Audit Tech Debt Cleanup

Address all remaining findings from the v1.3.0 milestone audit. Eliminate duplication, migrate to Bun APIs, refactor compiler architecture, harden security, and clean up code hygiene.

**Goal:** Zero remaining audit findings. Clean codebase ready for feature work.

### Phase 24: Build Pipeline Consolidation

**Goal:** Extract shared compilation pipeline to eliminate triple duplication across build-all.ts, check-drift.ts, and check-drift.test.ts.
**Depends on:** None (foundation phase)
**Requirements:** DEDUP-01, DEDUP-02, DEDUP-03, DEDUP-04, CLEAN-03, CLEAN-04

Plans:

- [x] 24-01: Extract shared constants, unify hook config generators, extract marketplace manifest (Wave 1)
- [x] 24-02: Extract generateAllOutputs() pipeline and migrate all consumers (Wave 2)

### Phase 25: Test & API Cleanup

**Goal:** Extract shared test utilities, migrate to Bun APIs, fix code hygiene in test/build files.
**Depends on:** Phase 24 (build pipeline must be consolidated before migrating APIs)
**Requirements:** TEST-01, TEST-02, BUN-01, BUN-02, CLEAN-01

Plans:

- [x] 25-01: Extract shared test helpers + code hygiene fixes (Wave 1)
- [x] 25-02: Migrate check-drift.test.ts to async Bun.file and node:fs/promises APIs (Wave 2)

### Phase 26: Compiler Architecture Refactor

**Goal:** Refactor BaseCompiler class hierarchy to factory-function pattern per no-classes rule.
**Depends on:** Phase 24 (shared pipeline must exist so compiler changes don't break 3 consumers)
**Requirements:** ARCH-01, CLEAN-02

Plans:

- [x] 26-01: Create functional compiler module + rewrite tests (Wave 1)
- [x] 26-02: Migrate consumers to functional API + delete old class files (Wave 2)

### Phase 27: Security Hardening

**Goal:** Address all LOW security findings from the audit.
**Depends on:** Phase 25 (build-utils.ts must be migrated before adding root path guard)
**Requirements:** SEC-01, SEC-02, SEC-03, SEC-04, SEC-05

Plans:

- [x] 27-01: Hook script hardening — path validation, input sanitization, documentation (Wave 1)
- [x] 27-02: Build pipeline hardening — root path guard, manifest constraints (Wave 1, parallel)

---

## Phase Dependencies

```
Phase 24 (Build Pipeline Consolidation)
    ├── Phase 25 (Test & API Cleanup) ──┐
    └── Phase 26 (Compiler Refactor) ───┤
                                        ▼
                              Phase 27 (Security Hardening)
```

Phases 25 and 26 can execute in parallel after Phase 24 completes.

---

## History

- **v1.0.0** — Core CLI, Integrations, Enterprise Readiness ([View Archive](milestones/v1.0.0-ROADMAP.md))
- **v1.0.1** — Code Hardening: 6 phases, 433 tests, all passed ([View Archive](milestones/v1.0.1-ROADMAP.md))
- **v1.1.0** — Workflow Foundation: 4 phases, 11 plans, 27 requirements, 579 tests ([View Archive](milestones/v1.1.0-ROADMAP.md))
- **v1.2.0** — Intelligent Agent Engine: 5 phases, 25 plans, 29 requirements, 845 tests ([View Archive](milestones/v1.2.0-ROADMAP.md))
- **v1.3.0** — Claude Code Plugin Distribution: 5 phases, 19 plans, 25 requirements, 928 tests ([View Archive](milestones/v1.3.0-ROADMAP.md))
- **v1.3.1** — Post-Audit Cleanup & Plugin Autocomplete: 171 files, 938 tests ([View Archive](milestones/v1.3.1-ROADMAP.md))

---

_Roadmap updated: 2026-02-13 (Phase 27 complete — v1.3.2 milestone complete)_
