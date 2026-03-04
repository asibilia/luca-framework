# Roadmap

## Overview

**Current Milestone:** v2.7.0 — Observability & Verification Infrastructure

---

## v2.7.0 — Observability & Verification Infrastructure

**Theme:** Make Luca's internal operations visible and verifiable. The luca-observer web dashboard is the centerpiece, supported by event infrastructure (ledger), verification pipeline (middleware), hook canonicalization, and DX polish.

**Included Todos:** #25, #6, #24, #9, #20

### Phase 97 — Test Infrastructure & Event Foundation

**Goal:** Establish test infrastructure for observer package and build the event ledger that feeds dashboard data.

**Depends on:** None

- [ ] Observer test infrastructure: package-local `__tests__/`, bun:test config, mock patterns
- [ ] Observer scaffolding cleanup: gitignore `.next/`, fix `base.css`, remove unused deps, clean empty `machines/` dir
- [ ] Tests for `observer-emitter.ts` in luca-framework
- [ ] Append-only session ledger (`ledger.ts`) in state domain extending `bridge.ts` (#6)
- [ ] Ledger schema + bridge CLI commands (read-ledger, filter, tail)

### Phase 98 — Verification Pipeline

**Goal:** Build harness middleware so observer's verification pages have real data to display.

**Depends on:** Phase 97

- [ ] CheckMiddlewareSchema in harness schemas (#24)
- [ ] Middleware pipeline in harness runner (workspace-scoping, output-capture, timing)
- [ ] Integration with existing harness runner
- [ ] Middleware tests (pipeline ordering, error handling, empty pipeline)

### Phase 99 — Observer Foundation MVP

**Goal:** Complete core observer pages with real data from ledger + harness middleware.

**Depends on:** Phase 98

- [ ] Schema bridge connecting observer to luca-framework state (#25)
- [ ] Dashboard overview page (real data, not stubs)
- [ ] Workflow state machine page (state visualization, transitions)
- [ ] Harness/verification results page
- [ ] SSE event stream integration tests

### Phase 100 — Observer Deep Pages & Hook Portability

**Goal:** Complete remaining observer pages and canonicalize hook format.

**Depends on:** Phase 99

- [ ] Iterations & convergence page (#25)
- [ ] Planning (WSJF) page (#25)
- [ ] Memory system page (#25)
- [ ] Tribunal & debate page (#25)
- [ ] Agent activity page (#25)
- [ ] Canonical hook format with platform adapters (claude, cursor, pi) (#9)
- [ ] Hook portability regression tests across all 3 platforms

### Phase 101 — Polish, DX & Finalization

**Goal:** Polish observer UI, add interactive tour, finalize all packages.

**Depends on:** Phase 100

- [ ] Observer UI polish: loading states, error boundaries, responsive layout, dark mode (#25)
- [ ] Post-init interactive tour with @clack/prompts (#20)
- [ ] End-to-end integration test: hooks fire -> ledger records -> observer displays
- [ ] Hook portability finalization and drift check (#9)
- [ ] Documentation for observer deployment

---

## Backlog (Future)

### v2.8.0 — Adaptive Learning & Ecosystem

- Cross-session procedure replay engine (#12)
- Adaptive complexity self-tuning (#13)
- Reflective meta-cognition for plan quality (#15)
- Portable cognitive profiles / cross-project memory (#14)
- Cross-agent interop scanner (#16)
- Plugin marketplace with community registry (#17)
- Semantic memory embeddings with vector recall (#18)
- Selective skill scaffolding (#23)

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
- **v2.2.0** — Pi Platform Maturity: 4 phases, 10 plans, 2271 tests. DRY cleanup, E2E runtime validation, background subagent spawning, Pi API learnings — 15 extensions, 49 tools ([View Archive](milestones/v2.2.0-ROADMAP.md))
- **v2.3.0** — Distribution & Model Routing: 7 phases, 7 plans, 2315 tests. npm package distribution with multi-harness scaffolding, ModelTierSchema with per-agent model routing, 5-step resolve chain ([View Archive](milestones/v2.3.0-ROADMAP.md))
- **v2.4.0** — Pi Platform Completion: 3 phases, 3 plans, 2411 tests. Runtime model routing via pi.setModel(), interactive dialogs & keyboard shortcuts, AbortSignal tool resilience, session lifecycle handling, agent role content refresh ([View Archive](milestones/v2.4.0-ROADMAP.md))
- **v2.5.0** — Operational Intelligence & Distribution Hardening: 6 phases, 6 plans, 2694 tests. Real token accounting, context pruning, semantic convergence, role-based model routing, distribution blockers, CLI/DX foundation, observability scorecard, compiler plugin registry ([View Archive](milestones/v2.5.0-ROADMAP.md))
- **v2.5.1** — Code Health & Test Reliability: 2 phases, 4 plans, 52 files changed. State domain type safety, 5 barrels purified, 134 context tests added, security hardening ([View Archive](milestones/v2.5.1-ROADMAP.md))
- **v2.6.0** — Code Health, Context Intelligence & Debate Architecture: 6 phases, 17 plans, 60 commits, 250 files changed, 3109 tests. Test isolation fix, JSON-first memory bridge, directory-scoped rules, pre-flight hydration, 7 debate/tribunal patterns (Design Tribunal, Verification Tribunal, Root Cause Tribunal, milestone audit debate, PR split verdict, stall-vs-retry, ground truth metrics) ([View Archive](milestones/v2.6.0-ROADMAP.md))
- **v2.6.1** — Audit Gap Closure: 2 phases, 9 requirements, 95 files changed, 3146 tests. Tribunal architecture extraction to shared, entity isolation fix, DRY cleanup, Bun API migration, sanitizeForTemplate, lodash alignment, safeParse conversion ([View Archive](milestones/v2.6.1-ROADMAP.md))
- **v2.6.2** — Convention & DRY Cleanup: 2 phases, 6 plans, 85 files changed, 3150 tests. Barrel import fixes, convention alignment (orderBy, safeParse, sanitize hardening, node:crypto), DRY extraction (countResolutions, safeParseOrThrow, diagnostic prompt factory, groupBy migration) ([View Archive](milestones/v2.6.2-ROADMAP.md))

---

_Roadmap updated: 2026-03-04 (v2.7.0 milestone started)_
