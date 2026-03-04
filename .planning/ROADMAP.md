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

- [x] Observer test infrastructure: package-local `__tests__/`, bun:test config, mock patterns
- [x] Observer scaffolding cleanup: gitignore `.next/`, fix `base.css`, remove unused deps, clean empty `machines/` dir
- [x] Tests for `observer-emitter.ts` in luca-framework
- [x] Append-only session ledger (`ledger.ts`) in state domain extending `bridge.ts` (#6)
- [x] Ledger schema + bridge CLI commands (read-ledger, filter, tail)

### Phase 98 — Verification Pipeline

**Goal:** Build harness middleware so observer's verification pages have real data to display.

**Depends on:** Phase 97

- [x] CheckMiddlewareSchema in harness schemas (#24)
- [x] Middleware pipeline in harness runner (workspace-scoping, output-capture, timing)
- [x] Integration with existing harness runner
- [x] Middleware tests (pipeline ordering, error handling, empty pipeline)

### Phase 99 — Observer Foundation MVP

**Goal:** Complete core observer pages with real data from ledger + harness middleware.

**Depends on:** Phase 98

- [x] Schema bridge connecting observer to luca-framework state (#25)
- [x] Dashboard overview page (real data, not stubs)
- [x] Workflow state machine page (state visualization, transitions)
- [x] Harness/verification results page
- [x] SSE event stream integration tests

### Phase 100 — Observer Deep Pages & Hook Portability

**Goal:** Complete remaining observer pages and canonicalize hook format.

**Depends on:** Phase 99

- [x] Iterations & convergence page (#25)
- [x] Planning (WSJF) page (#25)
- [x] Memory system page (#25)
- [x] Tribunal & debate page (#25)
- [x] Agent activity page (#25)
- [x] Canonical hook format with platform adapters (claude, cursor, pi) (#9)
- [x] Hook portability regression tests across all 3 platforms

### Phase 101 — Polish, DX & Finalization

**Goal:** Polish observer UI, add interactive tour, finalize all packages.

**Depends on:** Phase 100

- [ ] Observer UI polish: loading states, error boundaries, responsive layout, dark mode (#25)
- [ ] Post-init interactive tour with @clack/prompts (#20)
- [ ] End-to-end integration test: hooks fire -> ledger records -> observer displays
- [ ] Hook portability finalization and drift check (#9)
- [ ] Documentation for observer deployment

### Phase 102 — Tailwind Build Commands

**Goal:** Add Tailwind CSS build commands to the luca-observer package.json for proper CSS compilation workflow.

**Depends on:** Phase 99

- [x] Add Tailwind build/dev/watch scripts to luca-observer package.json
- [x] Verify Tailwind CSS compilation pipeline works end-to-end

### Phase 103 — ESLint Config

**Goal:** Port ESLint configuration from joes-book--next repo (https://github.com/asibilia/joes-book--next) into luca-observer, including installing ESLint and all required plugins/presets.

**Depends on:** None

- [x] Clone/fetch ESLint config from asibilia/joes-book--next repo
- [x] Install ESLint and required dependencies in luca-observer
- [x] Adapt config for luca-observer's project structure
- [x] Verify lint passes on existing codebase

### Phase 104 — Observer Directory Restructure

**Goal:** Move luca-observer content folders (app/, lib/, components/, etc.) from under `src/` to the package root, following standard Next.js conventions.

**Depends on:** None

- [ ] Move content folders from `src/` to package root
- [ ] Update all import paths and tsconfig path mappings
- [ ] Update Next.js config if needed
- [ ] Verify build and dev server work after restructure

### Phase 105 — Remove PostCSS & Align Tailwind Setup

**Goal:** Remove PostCSS and align Tailwind CSS setup with the joes-book--next repo (https://github.com/asibilia/joes-book--next), using the same Tailwind configuration approach.

**Depends on:** Phase 102

- [ ] Remove postcss and postcss.config from luca-observer
- [ ] Port Tailwind setup from joes-book--next repo
- [ ] Update CSS imports and Tailwind directives to match reference repo
- [ ] Verify Tailwind styles compile correctly without PostCSS

### Phase 106 — Modernize Next.js Config

**Goal:** Update luca-observer's Next.js config to match the joes-book--next repo (https://github.com/asibilia/joes-book--next) and align with latest Next.js + Bun documentation.

**Depends on:** Phase 104

- [ ] Fetch and review next.config from joes-book--next repo
- [ ] Research latest Next.js docs for Bun runtime compatibility
- [ ] Update luca-observer next.config to modern conventions
- [ ] Verify dev server and build work with updated config

### Phase 107 — SpacetimeDB Integration

**Goal:** Integrate SpacetimeDB (https://spacetimedb.com/) into luca-observer for real-time data persistence and synchronization.

**Depends on:** Phase 99

- [ ] Research SpacetimeDB SDK and TypeScript/Bun compatibility
- [ ] Install SpacetimeDB client SDK
- [ ] Design schema modules for observer data (events, state, sessions)
- [ ] Replace or augment existing data layer with SpacetimeDB reducers/subscriptions
- [ ] Verify real-time sync works end-to-end with observer dashboard

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
