# Roadmap

## Overview

**Current Milestone:** v2.5.0 — Operational Intelligence & Distribution Hardening (Phase 81-86)

---

## v2.5.0 — Operational Intelligence & Distribution Hardening

**Goal:** Make Luca's runtime smarter (real token accounting, context pruning, convergence detection, role-based routing), fix distribution blockers (version sync, harness-aware update), and lay the DX foundation (status command, doctor, presets) for community adoption.

### Phase 81 — Distribution Blockers

**Goal:** Fix the version sync bug, harness-aware update command, and npm publishing readiness so the distributed package actually works correctly.

**Depends on:** None

- [x] Plan 81-A: npm version sync fix, LUCA_VERSION propagation, publishing pipeline (#5, #10)

### Phase 82 — CLI/DX Foundation

**Goal:** Ship the status command, harness-aware doctor, and progressive config presets so new users have a solid first experience.

**Depends on:** Phase 81 (status and doctor should report corrected version)

- [x] Plan 82-A: bun luca status command, harness-aware doctor, Starter/Standard/Full config presets (#19, #21, #11)

### Phase 83 — Runtime Intelligence

**Goal:** Replace heuristic token counting with real tokenizer, add role-based model routing, and connect them so model selection responds to actual budget consumption.

**Depends on:** Phase 81

- [x] Plan 83-A: Real tokenizer integration, role-based model routing with quality-zone-aware upgrades (#2, #1)

### Phase 84 — Context Resilience

**Goal:** Implement context pruning and WORKING.md auto-compaction so sessions survive longer without quality degradation.

**Depends on:** Phase 83 (needs real token counts for accurate zone detection)

- [x] Plan 84-A: Context pruning extensions, WORKING.md auto-compaction at degrading zone (#4, #25)

### Phase 85 — Verification Hardening

**Goal:** Add cross-harness verification parity and semantic convergence detection so multi-platform output is provably consistent and iteration loops terminate intelligently.

**Depends on:** Phase 83

- [x] Plan 85-A: Verification parity matrix across targets, semantic convergence detection (#22, #3)

### Phase 86 — Observability Foundation

**Goal:** Ship agent effectiveness scorecard and compiler plugin registry, laying the data and extensibility foundations for v2.6.0 learning features.

**Depends on:** Phase 84, Phase 85

- [ ] Plan 86-A: Agent effectiveness scorecard, compiler plugin registry (#7, #8)

---

## Backlog (Future)

### v2.6.0 — Adaptive Learning & Ecosystem

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

---

_Roadmap updated: 2026-03-01 (v2.4.0 milestone archived)_
