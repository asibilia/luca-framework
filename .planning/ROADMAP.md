# Roadmap

## Overview

**Current Milestone:** v2.8.0 — Critical Remediation, Audit Persistence & Skill Eval

---

## v2.8.0 — Critical Remediation, Audit Persistence & Skill Eval

### Phase 118: Security & Data Reliability

**Goal:** Fix all P0 data/security issues and harden SpacetimeDB persistence layer.

- [ ] Fix SQL injection risk in ledger query builder (#33)
- [ ] Add retry + error logging to fire-and-forget reducer calls (#31)
- [ ] Improve dual-write consistency between SpacetimeDB and JSON (#36)
- [ ] Add debug logging for SpacetimeDB fallback behavior (#39)

### Phase 119: UI Migration Cleanup

**Goal:** Complete SpacetimeDB migration in observer UI — fix broken pages and remove stale references.

- [ ] Fix notes page — calls deleted API endpoints (#30)
- [ ] Fix header — shows 'SSE Connected' with hardcoded green dot (#32)
- [ ] Clean up all stale SSE/API references in observer UI (#38)

### Phase 120: Audit Findings Persistence

**Goal:** Build structured audit findings persistence layer using SpacetimeDB so review findings survive context compaction.

**Depends on:** Phase 118

- [ ] Audit Findings Persistence & Retrieval System (#57)

### Phase 121: Skill Eval Framework

**Goal:** Add eval testing, description optimization, and measurement infrastructure for agent skills.

- [ ] Skill Eval Framework: Test, Measure, and Refine Agent Skills (#58)

---

## Backlog (Future)

### Remaining Audit Remediation (from repo review audit, 2026-03-04)

_P1 — Agentic:_

- Define missing `shouldRunDiscussion` guard in XState machine (#34)
- Add timeout/auto-transition to phase actor idle state (#35)

_P1 — DX:_

- Document and fix test suite fragility — 29 tests fail in full run (#37)

_P2 — UI:_

- Standardize loading states with LoadingSkeleton component (#40)
- Add React error boundaries to observer dashboard pages (#41)
- Accessibility pass on observer dashboard (#47)
- Add missing empty states to observer pages (#49)

_P2 — Data:_

- Implement TTL cleanup for high-volume SpacetimeDB tables (#42)
- Fix sequence number race condition in ledger (#43)
- Add unique constraints to singleton SpacetimeDB tables (#48)

_P2 — DX:_

- Fix bridge CLI documentation — 14 vs 15 subcommands (#45)
- Deduplicate sanitizeJsonParse — 3 copies in codebase (#46)
- Document observability domain in architecture docs (#50)
- Add automatic stale session lock cleanup to build system (#51)

_P2 — Agentic:_

- Enforce complexity gating matrix in XState guards (#44)
- Add agent health check system (#52)
- Add stall detection and retry limits to verification loop (#53)

_P3 — Agentic:_

- Implement skill dependency graph (#54)
- Enhance tribunal debate with consensus model (#55)

_P3 — Data:_

- Evaluate normalizing JSON blob fields in SpacetimeDB schema (#56)

**Ecosystem & Learning:**

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
- **v2.7.0** — Observability & Verification Infrastructure: 21 phases, 54 plans, 205 commits, 210 files changed, 3477 tests. luca-observer web dashboard (10+ pages), SpacetimeDB real-time infrastructure (16 tables, 19 reducers), event ledger + verification pipeline, security hardening (SSRF, CSP, API auth, SQL injection), DRY consolidation (useFilteredTable, readWithFallback, safeJsonParse, EmptyState), hook portability (3-platform) ([View Archive](milestones/v2.7.0-ROADMAP.md))

---

_Roadmap updated: 2026-03-05 (v2.8.0 active — 4 phases, 9 todos)_
