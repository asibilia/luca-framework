# Roadmap

## Overview

**Current Milestone:** v2.6.1 — Audit Gap Closure

---

## Current Milestone

### v2.6.1 — Audit Gap Closure

**Goal:** Close gaps identified by v2.6.0 milestone audit. Two phases: structural architecture cleanup (High priority), then convention alignment and security hardening (Medium priority).

**Source:** `.planning/v2.6.0-MILESTONE-AUDIT.md`

#### Phase 95: Tribunal Architecture & DRY Cleanup

**Goal:** Resolve the CRITICAL entity isolation violation and HIGH-priority code duplication.

- [x] 95-A — Extract shared tribunal infrastructure to `src/shared/` (T0): move tribunal schemas (`reviewFindingSchema`, `disagreementSchema`, `rebuttalSchema`, `unifiedRecommendationSchema`, `tribunalResultSchema`) and helpers (`normalizeFindings`, `detectDisagreements`, `shouldRunTribunal`, `buildRebuttalPrompts`, `buildTribunalResult`) from `src/agents/` to `src/shared/__schemas/tribunal.schemas.ts` and `src/shared/__helpers/tribunal-*.ts`. Update imports in both agents and skills domains.
- [x] 95-B — Extract shared `resolveMajorityVote<T>()` utility from duplicated logic in `verification-tribunal.ts` and `root-cause-tribunal.ts` (~40 lines identical). Place in `src/shared/__helpers/tribunal-consensus.ts`.
- [x] 95-C — Extract `isDebateComplexity(complexity: string): boolean` helper from 3 duplicated checks in `tribunal-detector.ts`, `root-cause-tribunal.ts`, `verification-tribunal.ts`. Place in `src/complexity/__helpers/complexity-gate.ts`.
- [x] 95-D — Deduplicate `getArg()`/`hasFlag()` local closures in 5 iteration helpers (`convergence.ts`, `metrics-collector.ts`, `classifier.ts`, `checkpoint.ts`, `budget.ts`). Replace with imports from `~/shared/__helpers/cli-utils`.
- [x] 95-E — Update `module-boundary.md` documented exceptions table if any cross-tier imports remain after extraction.

#### Phase 96: Convention Alignment & Security Hardening

**Goal:** Align all v2.6.0 files with project conventions (Bun APIs, lodash, safeParse) and close prompt injection gaps.

- [x] 96-A — Migrate `src/iteration/__helpers/metrics-collector.ts` from bare `'fs'` to Bun.file()/Bun.write() APIs. Migrate `src/context/__helpers/hydration-snapshot.ts` from `node:fs` to Bun.file().
- [x] 96-B — Add `sanitizeForTemplate()` to tribunal prompt construction in `root-cause-tribunal.ts`, `verification-tribunal.ts`, `tribunal-rebuttals.ts`, and `pr-verdict-debate.ts`. Apply to all AI-generated free-text fields before prompt interpolation.
- [x] 96-C — Replace native `.sort()` with lodash `orderBy` and native `.filter()` with lodash `filter` across all v2.6.0 debate/tribunal files (~10 files, ~20 call sites).
- [x] 96-D — Convert `.parse()` to `.safeParse()` with error handling across ~25 call sites in tribunal result builders and metrics-collector.

---

## Backlog (Future)

### v2.7.0 — Adaptive Learning & Ecosystem

- Cross-session procedure replay engine (#12)
- Adaptive complexity self-tuning (#13)
- Reflective meta-cognition for plan quality (#15)
- Append-only session ledger / DAG (#6)
- Hook portability abstraction layer (#9)
- Portable cognitive profiles / cross-project memory (#14)
- Cross-agent interop scanner (#16)
- Plugin marketplace with community registry (#17)
- Semantic memory embeddings with vector recall (#18)
- Post-init interactive tour (#20)
- Selective skill scaffolding (#23)
- Harness tool middleware for verification (#24)

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

---

_Roadmap updated: 2026-03-03 (v2.6.1 gap closure phases added from v2.6.0 audit)_
