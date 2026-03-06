# Roadmap

## Overview

**Current Milestone:** v3.0.0 — Data Integrity, Agentic Reliability & Model Routing Redesign

---

## v3.0.0 Phases

### Phase 1: Documentation & DX Quick Wins

**Goal:** Close documentation drift, fix DX blockers, build momentum
**Depends on:** Nothing
**Verification:** Quick
**Est:** ~1 day

- [x] PLAN: Document observability domain in architecture docs (#50)
- [x] PLAN: Add stale session lock cleanup to build system (#51)
- [x] PLAN: Fix bridge CLI documentation (14 vs 15 subcommands) (#45)

### Phase 2: DRY & Code Health

**Goal:** Eliminate code duplication, complete Bun API migration
**Depends on:** Nothing (parallel-safe with Phase 1)
**Verification:** Quick
**Est:** ~1 day

- [x] PLAN: Deduplicate sanitizeJsonParse — 3 copies to shared (#46)
- [x] PLAN: Complete node:fs to Bun API migration (#63)

### Phase 3: SpacetimeDB Schema Migrations

**Goal:** Harden SpacetimeDB schema correctness, add retention policies, fix naming
**Depends on:** Nothing (but must complete before Phase 4)
**Verification:** Standard
**Est:** ~2-3 days

- [x] PLAN: Rename SpacetimeDB memory fields *Json to *Md (#65) — already complete (prior milestone)
- [x] PLAN: Add unique constraints to singleton tables (#48) — already enforced by PK design
- [x] PLAN: Implement TTL cleanup + indexes for high-volume tables (#42) — eventType/timestamp indexes added
- [x] PLAN: Fix sequence number race condition in ledger (#43) — already fixed server-side atomically

> Schema migration note: Single `--clear-database` after all changes land.

### Phase 4: Observer Dashboard Polish

**Goal:** Bring observer dashboard to production quality — error handling, accessibility, empty states
**Depends on:** Phase 3 (schema field renames affect observer data hooks)
**Verification:** Standard
**Est:** ~2 days

- [ ] PLAN: Standardize loading states with LoadingSkeleton (#40)
- [ ] PLAN: Add React error boundaries to observer pages (#41)
- [ ] PLAN: Add missing empty states to observer pages (#49)
- [ ] PLAN: Accessibility pass on observer dashboard (#47)
- [ ] PLAN: Add todo tracking to observer dashboard (#64)

### Phase 5: Agentic Reliability

**Goal:** Add safety nets to agent execution — stall detection, health checks, dependency ordering
**Depends on:** Nothing (can parallel with Phases 3-4)
**Verification:** Full
**Est:** ~3-4 days

- [x] PLAN: Add stall detection and retry limits to verification loop (#53) — already implemented (state machine + stall-detector)
- [x] PLAN: Add agent health check system (#52) — already implemented (health-check.ts)
- [x] PLAN: Implement skill dependency graph (#54) — already implemented (dependency-graph.ts + schemas)
- [x] PLAN: Enhance tribunal debate with consensus model (#55) — already implemented (consensus-resolver.ts + schemas)

### Phase 6: Model Routing Redesign

**Goal:** Replace complexity gating step-skipping with per-agent model routing
**Depends on:** Phase 5 (agent system must be stable before architectural redesign)
**Verification:** Full + Human
**Est:** ~4-5 days

- [ ] PLAN: Replace complexity gating with per-agent model routing (replace-complexity-gating)

> Architectural note: T0 Foundation change affecting all complexity consumers.
> Must complete before #13 (self-tuning, deferred to v3.1.0).

### Phase 7: Hook & Ecosystem Infrastructure

**Goal:** Hook portability, first-run experience, distribution flexibility
**Depends on:** Phase 6 (hooks reference complexity/model routing)
**Verification:** Standard
**Est:** ~3-4 days

- [ ] PLAN: Hook portability abstraction layer (#09)
- [ ] PLAN: Post-init interactive tour (#20)
- [ ] PLAN: Selective skill scaffolding — core vs extended (#23)

### Phase 8: Learning Pipeline Foundation

**Goal:** Close the learning loop — procedures auto-replay, cross-project memory
**Depends on:** Phase 6 (learning features reference model routing for tier decisions)
**Verification:** Full
**Est:** ~3-4 days

- [ ] PLAN: Cross-session procedure replay engine (#12)
- [ ] PLAN: Portable cognitive profiles — cross-project memory (#14)

---

## Deferred (v3.1.0+)

| Todo | Title                                 | Reason                                                        |
| ---- | ------------------------------------- | ------------------------------------------------------------- |
| #37  | Test suite fragility                  | Testing reintroduction is a dedicated future effort           |
| #56  | JSON blob normalization               | BREAKING schema change — defer until #65 field rename settles |
| #13  | Adaptive complexity self-tuning       | Depends on Phase 6 (model routing) completing and stabilizing |
| #15  | Reflective meta-cognition             | Depends on #12 (procedure replay) from Phase 8                |
| #16  | Cross-agent interop scanner           | New domain creation — needs #50 first, defer to v3.1.0        |
| #18  | Semantic memory embeddings            | Depends on learning pipeline (Phase 8) stabilizing            |
| #66  | Observer Lucide icons sidebar         | UI polish — beyond Phase 4 scope, dedicated UI milestone      |
| #67  | Observer color system depth           | UI polish — beyond Phase 4 scope, dedicated UI milestone      |
| #68  | Observer typography overhaul          | UI polish — beyond Phase 4 scope, dedicated UI milestone      |
| #69  | Observer dashboard layout redesign    | Major redesign — new milestone territory                      |
| #70  | Observer charting library             | New dependency — beyond Phase 4 scope, dedicated UI milestone |
| #71  | Observer animations/motion            | UI polish — beyond Phase 4 scope, dedicated UI milestone      |
| #72  | Observer state diagram redesign       | Feature enhancement — beyond Phase 4 scope                    |
| #73  | Observer time range/session picker    | Feature enhancement — beyond Phase 4 scope                    |
| #74  | Observer command palette/keyboard nav | Feature enhancement — beyond Phase 4 scope                    |

## New Milestone Candidates

| Todo | Target | Reason                                                                                 |
| ---- | ------ | -------------------------------------------------------------------------------------- |
| #17  | v4.0.0 | Plugin Marketplace — CRITICAL effort, needs registry infra, T3->T2 tier violation risk |

## Closed (By Design)

| Todo | Reason                                                                                  |
| ---- | --------------------------------------------------------------------------------------- |
| #59  | Context pruning works correctly in memory/ (T1). Domain placement question, not a bug.  |
| #60  | Harness-aware update command works. Verification gap, not functionality gap.            |
| #61  | Duplicate of #37. Tests intentionally removed per MEMORY.md.                            |
| #62  | Dual-write atomicity — current JSON backup is pragmatic. Over-engineering for dev tool. |

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
- **v2.1.0** — Pi Library Integration: 7 phases, 22 plans, 2106 tests ([View Archive](milestones/v2.1.0-ROADMAP.md))
- **v2.2.0** — Pi Platform Maturity: 4 phases, 10 plans, 2271 tests ([View Archive](milestones/v2.2.0-ROADMAP.md))
- **v2.3.0** — Distribution & Model Routing: 7 phases, 7 plans, 2315 tests ([View Archive](milestones/v2.3.0-ROADMAP.md))
- **v2.4.0** — Pi Platform Completion: 3 phases, 3 plans, 2411 tests ([View Archive](milestones/v2.4.0-ROADMAP.md))
- **v2.5.0** — Operational Intelligence & Distribution Hardening: 6 phases, 6 plans, 2694 tests ([View Archive](milestones/v2.5.0-ROADMAP.md))
- **v2.5.1** — Code Health & Test Reliability: 2 phases, 4 plans, 52 files changed ([View Archive](milestones/v2.5.1-ROADMAP.md))
- **v2.6.0** — Code Health, Context Intelligence & Debate Architecture: 6 phases, 17 plans, 60 commits, 250 files changed, 3109 tests ([View Archive](milestones/v2.6.0-ROADMAP.md))
- **v2.6.1** — Audit Gap Closure: 2 phases, 9 requirements, 95 files changed, 3146 tests ([View Archive](milestones/v2.6.1-ROADMAP.md))
- **v2.6.2** — Convention & DRY Cleanup: 2 phases, 6 plans, 85 files changed, 3150 tests ([View Archive](milestones/v2.6.2-ROADMAP.md))
- **v2.7.0** — Observability & Verification Infrastructure: 21 phases, 54 plans, 205 commits, 210 files changed, 3477 tests ([View Archive](milestones/v2.7.0-ROADMAP.md))
- **v2.8.0** — Critical Remediation, Audit Persistence & Skill Eval: 3 phases, 5 commits, 27 files changed, 3514 tests ([View Archive](milestones/v2.8.0-ROADMAP.md))
- **v2.9.0** — Audit Gap Closure & Test Reliability: 14 phases, 52 commits, 572 files changed ([View Archive](milestones/v2.9.0-ROADMAP.md))

---

_Roadmap updated: 2026-03-06 (v3.0.0 milestone created from 35-todo backlog triage)_
