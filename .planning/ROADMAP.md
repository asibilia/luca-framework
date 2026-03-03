# Roadmap

## Overview

**Current Milestone:** v2.6.0 — Code Health, Context Intelligence & Debate Architecture

---

## Current Milestone

### v2.6.0 — Code Health, Context Intelligence & Debate Architecture

**Goal:** Resolve v2.5.1 carryover (test isolation, barrel purity), tighten iteration tuning, improve context efficiency (rule scoping, pre-flight hydration), build debate infrastructure (ground truth tracking, Design Tribunal PoC), and expand debate patterns across verification, debugging, and milestone audit.

**Scoped by:** Autopilot roadmap revision swarm (3 specialists + synthesizer, 2026-03-03); debate architecture absorbed per user request (2026-03-03)

#### Phase 89: Code Health Carryover

**Goal:** Fix CI-blocking test isolation bug, clean remaining impure barrels, tighten iteration caps.

- [x] 89-A — Fix validateBranding module resolution / test suite isolation (todo-29)
- [x] 89-B — Refactor remaining impure barrel files (todo-28, reduced scope — 5 of 7 already cleaned in v2.5.1)
- [x] 89-C — Tighten harness iteration caps: MODERATE 3→2, COMPLEX 3→2, CRITICAL 5→3 (todo-32)

**Depends on:** None

#### Phase 90: Context Intelligence

**Goal:** Reduce context saturation via directory-scoped rules, expand pre-flight hydration for better first-pass accuracy.

- [ ] 90-A — Scope rules by directory/domain (todo-33)
- [ ] 90-B — Expand pre-flight context hydration (todo-34)

**Depends on:** Phase 89

#### Phase 91: Debate Foundation

**Goal:** Build debate infrastructure: ground truth tracking for measurement, lightweight stall-vs-retry debate PoC, and Design Tribunal as the full debate pattern proof-of-concept.

- [ ] 91-A — Ground truth tracking for debate measurement (todo-41)
- [ ] 91-B — Stall-vs-retry convergence debate (todo-40)
- [ ] 91-C — Design Tribunal: phase-execute code review debate PoC (todo-36)

**Depends on:** Phase 89 (specifically 89-C for 91-B; 91-A is independent)

#### Phase 92: Debate Expansion

**Goal:** Expand debate patterns to milestone audit, verification conflicts, and PR address validation — all building on Design Tribunal infrastructure from Phase 91.

- [ ] 92-A — Milestone audit adversarial debate round (todo-35)
- [ ] 92-B — Verification Tribunal for T1/T3 conflicts (todo-37)
- [ ] 92-C — PR address split verdict debate (todo-39)

**Depends on:** Phase 91 (specifically 91-C — Design Tribunal PoC)

#### Phase 93: Debate Advanced

**Goal:** Root cause tribunal combining debug diagnosis with verification tribunal patterns.

- [ ] 93-A — Root Cause Tribunal for debug fix validation (todo-38)

**Depends on:** Phase 92 (specifically 92-B — Verification Tribunal)

#### Phase 94: Milestone Verification & Release

**Goal:** Full harness verification, milestone audit, archive.

- [ ] 94-A — Full harness (test + typecheck + drift), milestone audit, archive

**Depends on:** Phases 89, 90, 91, 92, 93

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

---

_Roadmap updated: 2026-03-03 (v2.6.0 milestone scoped by autopilot swarm; debate architecture absorbed into milestone per user request)_
