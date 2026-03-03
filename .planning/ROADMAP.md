# Roadmap

## Overview

**Current Milestone:** v2.6.2 — Convention & DRY Cleanup

---

## Current Milestone

### v2.6.2 — Convention & DRY Cleanup

**Goal:** Close convention gaps and tech debt identified by v2.6.1 milestone audit. Two phases: mechanical fixes (barrel imports, convention alignment, security hardening), then DRY pattern extraction.

**Source:** `.planning/v2.6.1-MILESTONE-AUDIT.md`

#### Phase 97: Import Barrel & Convention Fixes

**Goal:** Fix Rule 4 barrel violations, remaining convention gaps, and security hardening edge cases.

- [x] 97-A — Fix 3x `complexity/__helpers/` direct imports in `tribunal-detector.ts`, `verification-tribunal.ts`, `root-cause-tribunal.ts` → use `~/complexity` barrel. Fix 2x `~/complexity/__schemas/` direct imports in `milestone-debate.ts` and `milestone-debate.schemas.ts` → use barrel. Remove dual-export of tribunal symbols from `agents/index.ts`.
- [x] 97-B — Fix 1x `.sort()` → lodash `orderBy` in `tribunal-consensus.ts:106`. Convert 2x `.parse()` → `.safeParse()` in `hydration-snapshot.ts:308,372`. Add `sanitizeForTemplate()` to 2x unsanitized fields: `source_agent`/`file` in `tribunal-rebuttals.ts:121` and `milestoneVersion` in `milestone-debate.ts:153`. Fix 2x bare `"crypto"` → `"node:crypto"` in `tribunal-detector.ts` and `convergence.ts`. Fix `sanitizeForTemplate` to strip trailing `}` after `${` removal and add Unicode bidi control character defense.

#### Phase 98: DRY Pattern Extraction

**Goal:** Extract shared helpers for duplicated patterns identified in the v2.6.1 audit.

- [ ] 98-A — Extract resolution-counting helper from 3 duplicated filter patterns (upheld/withdrawn/modified) in `tribunal-rebuttals.ts`, `buildTribunalResult`, and `milestone-debate.ts:274`.
- [ ] 98-B — Refactor 3 diagnostic prompt builders in `verification-tribunal.ts:137` that share ~80% identical structure into a factory/template pattern.
- [ ] 98-C — Extract safeParse-or-throw utility from repeated 4-case switch pattern in `metrics-collector.ts:316`.
- [ ] 98-D — Replace manual "group into Map" idiom with lodash `groupBy` in 4 files including `tribunal-rebuttals.ts:200`.

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
- **v2.6.1** — Audit Gap Closure: 2 phases, 9 requirements, 95 files changed, 3146 tests. Tribunal architecture extraction to shared, entity isolation fix, DRY cleanup, Bun API migration, sanitizeForTemplate, lodash alignment, safeParse conversion ([View Archive](milestones/v2.6.1-ROADMAP.md))

---

_Roadmap updated: 2026-03-03 (v2.6.2 convention & DRY cleanup phases added from v2.6.1 audit)_
