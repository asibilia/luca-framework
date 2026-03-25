# Roadmap

## Overview

**Current Milestone:** v6.0.0 — Runtime Foundation & Adapter Layer

---

## v6.0.0 — Runtime Foundation & Adapter Layer

**Goal:** Build the typed DAG workflow engine, adapter architecture, eval domain, and v2 research infrastructure. Establishes the runtime foundation for multi-IDE compilation, behavioral evaluation, and enhanced research workflows.

**Todos:** runtime-a01–a11, runtime-b01–b10, runtime-c01–c10, runtime-x01–x08, v2-config, v2-open-questions, v2-phase-1–5

**Complexity:** COMPLEX

### Phase 1 — Architecture Docs + Boundary Script

**Goal:** Register new domains (workflow T1, eval T1, adapters T3) in architecture docs and boundary check script before any implementation begins.

**Depends on:** None

- [x] X01: Update domain-architecture and module-boundary docs for new domains
- [x] X02: Update boundary check script for workflow, adapters, eval domains

### Phase 2 — Workflow Domain Scaffolding + Schemas

**Goal:** Create src/workflow/ directory structure, core Zod schemas (WorkflowStep, WorkflowDAG, StepResult), and step contract schemas.

**Depends on:** Phase 1

- [x] A01: Create workflow domain scaffolding
- [x] A02: Define core workflow schemas
- [x] A03: Define step contract schemas

### Phase 3 — DAG Builder, Sorter, Validator

**Goal:** Implement the DAG builder fluent API, topological sorter with wave grouping, and DAG validator with 5 static checks.

**Depends on:** Phase 2

- [x] A04: Implement DAG builder fluent API
- [x] A05: Implement topological sorter with wave grouping
- [x] A06: Implement DAG validator with 5 static checks

### Phase 4 — DAG Executor, Serializer, Visualizer, Pipeline, Registration

**Goal:** Complete the workflow domain with the DAG executor, checkpoint/resume serializer, topology transformer, reference phase pipeline, and domain registration.

**Depends on:** Phase 3

- [x] A07: Implement DAG executor with wave execution
- [x] A08: Implement DAG serializer for checkpoint/resume
- [x] A09: DAG-to-topology transformer for luca-observer
- [x] A10: Define reference phase pipeline DAG
- [x] A11: Register workflow domain in boundary check and docs

### Phase 5 — Eval Domain (Full Build)

**Goal:** Build the complete eval domain: scaffolding, graders (code/LLM/composite), runner, reporter, comparator, seed eval suites for lu-router/lu-verifier/convergence, CLI integration, and domain registration.

**Depends on:** Phase 1

- [x] C01: Eval domain scaffolding + schemas
- [x] C02: Eval graders (code, LLM, composite)
- [x] C03: Eval runner
- [x] C04: Eval reporter
- [x] C05: Eval comparator
- [x] C06: Seed eval suite for lu-router
- [x] C07: Seed eval suite for lu-verifier
- [x] C08: Seed eval suite for convergence detector
- [x] C09: CLI integration for luca eval
- [x] C10: Domain barrel + boundary check registration

### Phase 6 — Adapter Architecture (B01–B07, B09, B10)

**Goal:** Build the adapter domain: schemas, registry, Claude agent/skill emitters, API executor, adapter assembly, DAG-adapter integration, and domain registration. Excludes B08 (compiler refactoring — isolated in Phase 7).

**Depends on:** Phase 4

- [x] B01: Adapter schemas (AdapterConfigSchema, Adapter type, EmitResult)
- [x] B02: Adapter registry with discovery priority
- [x] B03: Claude adapter agent emitter
- [x] B04: Claude adapter skill emitter
- [x] B05: Claude adapter main (wire emitters into Adapter interface)
- [x] B06: API adapter executor (Claude Agent SDK)
- [x] B07: API adapter main (wire executor into Adapter interface)
- [x] B09: DAG-adapter integration (wire dag-executor to adapter.executeStep)
- [x] B10: Domain barrel, boundary registration, built-in adapter pre-registration

### Phase 7 — Compiler Refactoring (B08 ISOLATED)

**Goal:** Refactor compile.ts to delegate to new adapter emitters. CRITICAL: requires manual `bun run build:all` + diff verification outside Claude Code session. Byte-identical output constraint.

**Depends on:** Phase 6

- [x] B08: Compiler refactoring — delegate compile.ts to Claude adapter emitters

### Phase 8 — Cross-Cutting Integration

**Goal:** Complete cross-cutting work: backlog integration audit, targeted recompilation script, behavioral equivalence criteria, state machine integration plan, iteration system plan, open questions resolution.

**Depends on:** Phase 7

- [x] X03: Backlog integration audit — v2 pipeline overlap resolution
- [x] X04: Targeted recompilation script
- [x] X05: Behavioral equivalence acceptance criteria
- [x] X06: State machine integration plan
- [x] X07: Iteration system integration plan
- [x] X08: Open questions resolution

### Phase 9 — v2 Research Infrastructure + Review Loop + MuninnDB Graduation

**Goal:** Build v2 research system: 4 parallel researcher agents, convergence-based review loop, and MuninnDB graduation for research files.

**Depends on:** Phase 8

- [x] v2-phase-1: Research Infrastructure — 4 parallel researcher agents
- [x] v2-phase-2: Review Loop — convergence-based research review
- [x] v2-phase-3: MuninnDB Graduation — research files to semantic memory

### Phase 10 — v2 Plan/Executor Enhancement + Config Updates

**Goal:** Enhance plan and executor with research refs, per-task MuninnDB recall, config schema updates, and resolve open questions.

**Depends on:** Phase 9

- [x] v2-phase-4: Plan Enhancement — research refs + plan review loop
- [x] v2-phase-5: Executor Enhancement — per-task MuninnDB recall
- [x] v2-config-and-schema-updates: Config & schema updates for v2
- [x] v2-open-questions-to-resolve: Open questions resolution

---

## Deferred to M2

| Todo Group                    | Scope                                  | Reason                                         |
| ----------------------------- | -------------------------------------- | ---------------------------------------------- |
| runtime-d01–d11               | Luca Studio (dev server + UI views)    | WSJF 2.8, CRITICAL effort, independent package |
| runtime-e01–e04               | IDE adapters (Cursor/Windsurf/VS Code) | Depends on B-group stability                   |
| v2-phase-6                    | Orchestrator integration (lu.skill.ts) | HIGH blast radius, Full+Human verification     |
| v2-enhanced-existing-agents   | Agent enhancements                     | Sequential dependency on v2-phase-5            |
| v2-external-research-patterns | External research patterns             | Design reference, low urgency                  |

## Backlog (Unassigned)

| Todo | Title                | Target           | Reason                                                              |
| ---- | -------------------- | ---------------- | ------------------------------------------------------------------- |
| #37  | Test suite fragility | Dedicated effort | Testing reintroduction per `.planning/notes/0-reintroduce-tests.md` |

---

## Closed (v5.0.0 Completed)

| Todo | Reason                                                                                                                                                         |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #17  | Global NPM Package: 9 phases, 86 commits, 102 files changed. CLI installer, MuninnDB binary management, artifact deployment, vault setup, doctor/update/reinit |

## Closed (v4.5.0 Completed)

| Todo | Reason                                                                                                                                                                                                                                                                              |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #77  | Platform Simplification & Proactive Intelligence: 14 phases, 93 commits, 793 files (+16,465/-157,273 LOC). Removed non-Claude platforms, migrated hooks to TypeScript, shadow debt scanner, proactive context management, observer memory redesign, security hardening, DRY cleanup |

## Closed (v4.4.0 Completed)

| Todo | Reason                                                                                                                                                                                                                 |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #75  | Smart Context Management: 7 phases, 23 commits, 74 files (+6,756 LOC). Hook schema expansion (18 events), PreCompact checkpoint, context metrics, session restore, /context-restore skill, observer context window bar |

## Closed (v4.3.0 Completed)

| Todo | Reason                                                                                                                                                                                                   |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #73  | Observer Workflow Editor: 7 phases, 35 commits, 79 files (+7,963 LOC). React Flow v12, stage-group containers, custom nodes, complexity filter, grouped column layout, Zod safeParse, ARIA accessibility |

---

## Closed (By Design)

| Todo | Reason                                                                                  |
| ---- | --------------------------------------------------------------------------------------- |
| #59  | Context pruning works correctly in memory/ (T1). Domain placement question, not a bug.  |
| #60  | Harness-aware update command works. Verification gap, not functionality gap.            |
| #61  | Duplicate of #37. Tests intentionally removed per MEMORY.md.                            |
| #62  | Dual-write atomicity — current JSON backup is pragmatic. Over-engineering for dev tool. |

## Closed (Backlog Audit 2026-03-08)

| Todo   | Reason                                                        |
| ------ | ------------------------------------------------------------- |
| #15    | Absorbed into #95 (learning loop Phase A)                     |
| #40    | Superseded — observer pages deleted by #78                    |
| #41    | Absorbed into #78/#80 (error boundaries built into new views) |
| #42    | Obsolete — SpacetimeDB tables being deleted                   |
| #43    | Obsolete — SpacetimeDB ledger race, moot after removal        |
| #47    | Deferred — apply to new MuninnDB views post-rebuild           |
| #48    | Obsolete — SpacetimeDB schema being deleted                   |
| #49    | Superseded — new views include empty states natively          |
| #56    | Obsolete — SpacetimeDB schema being deleted                   |
| #64    | Re-scoped as #96 (MuninnDB-native)                            |
| #65    | Obsolete — SpacetimeDB package being deleted                  |
| #66-74 | Absorbed into observer design requirements doc                |

## Closed (v3.2.0 Completed)

| Todo | Reason                                                              |
| ---- | ------------------------------------------------------------------- |
| #77  | MuninnDB emission layer built (fire-and-forget + circuit breaker)   |
| #78  | SpacetimeDB stripped from observer (30+ bindings, 17 hooks deleted) |
| #79  | MuninnDB API layer with 7+ routes and filtering                     |
| #80  | Session Explorer view with design system established                |
| #81  | Decision Trail view with filtering and search                       |
| #82  | Learning Evolution view with CSS charting patterns                  |
| #87  | Vault Health Dashboard with stats and metrics                       |

## Closed (v3.3.0 Completed)

| Todo | Reason                                                                    |
| ---- | ------------------------------------------------------------------------- |
| #95  | Close learning loop: Apply-Measure-Refine (calibration engrams)           |
| #13  | Adaptive complexity self-tuning (reassessment at 4 checkpoints)           |
| #94  | Deferred/lazy recall (session-scoped cache, eager_recall flag)            |
| #83  | Knowledge Graph Explorer (force-directed graph, cluster supernodes, zoom) |
| #84  | Semantic Search (on-demand search, advanced options, explain breakdown)   |
| #85  | Contradiction view (side-by-side cards, forget, cross-view navigation)    |
| #86  | Entity Deep Dive (4-tab interface, 6 components, dynamic routing)         |

## Closed (v4.0.0 Completed)

| Todo | Reason                                                                                  |
| ---- | --------------------------------------------------------------------------------------- |
| #97  | Fix MuninnDB orphan ratio (memory linking in lu-learner and workflow-save)              |
| #98  | Compaction-resilient orchestrators (wave progress journaling + context budget checks)   |
| #106 | State machine context extensions (appetite, cooldown, bridge updates)                   |
| #99  | Appetite declaration system (levels, budgets, wave-boundary guard, planner awareness)   |
| #100 | Pre-mortem agent lu-premortem (failure scenarios, risk brief, developer checkpoint)     |
| #101 | Process data agent lu-process-data (5 per-phase + 4 aggregate metrics)                  |
| #102 | Outcome tracking (/outcome skill + lu-cognition outcome_check)                          |
| #103 | Self-tuning governance (graduation criteria, auto-skip, gate checks)                    |
| #104 | Process retrospective (dashboard + developer question at milestone boundaries)          |
| #105 | Divergent mode advisory (nudge after 8+ consecutive milestones)                         |
| #108 | PREMORTEM_COMPLETE bridge fix (emit-event to transition)                                |
| #109 | Metric key alignment (outcome-completion-rate to outcome-completion)                    |
| #110 | Mechanical cleanup (duplicate imports, memory tags, section ordering, bracket notation) |

## Closed (v4.2.0 Completed)

| Todo | Reason                                                                           |
| ---- | -------------------------------------------------------------------------------- |
| #38  | Complexity gating reworked: model-tier-only, all steps always run at every level |
| #39  | Multi-vault MuninnDB: default vault cross-cutting, repo vault project-specific   |

## Closed (v3.1.0 Completed)

| Todo | Reason                                                               |
| ---- | -------------------------------------------------------------------- |
| #45  | Bridge CLI docs fixed (13 subcommands)                               |
| #46  | sanitizeJsonParse deduplicated (2 copies across isolated boundaries) |
| #50  | Observability domain documented in architecture docs                 |
| #51  | Stale session lock auto-cleanup added                                |
| #52  | Agent health check system implemented                                |
| #53  | Stall detection & retry limits added                                 |
| #63  | node:fs to Bun migration completed                                   |
| #75  | SpacetimeDB removed from framework                                   |
| #76  | luca-spacetime package deleted                                       |
| #88  | SpacetimeDB docs/planning cleaned up                                 |
| #89  | Complexity-gated recall depth implemented                            |
| #90  | Session context digest reuse implemented                             |
| #91  | Milestone-scoped recall scoring implemented                          |
| #92  | Memory injection into sub-agent prompts                              |
| #93  | Automatic session memory cleanup                                     |

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
- **v3.0.0** — Data Integrity, Agentic Reliability & Model Routing Redesign: 14 phases, 42 plans, 151 commits, 810 files changed ([View Archive](milestones/v3.0.0-ROADMAP.md))
- **v3.1.0** — Memory Intelligence & Platform Cleanup: 7 phases, 10 commits, 151 files changed ([View Archive](milestones/v3.1.0-ROADMAP.md))
- **v3.2.0** — Observer Rebirth: 8 phases, 20 plans, 48 commits, 193 files changed ([View Archive](milestones/v3.2.0-ROADMAP.md))
- **v3.3.0** — Cognitive Maturity & Observer Depth: 6 phases, 12 plans, 78 commits, 94 files changed ([View Archive](milestones/v3.3.0-ROADMAP.md))
- **v4.0.0** — Process Intelligence & Self-Tuning Workflow: 6 phases, 12 plans, 48 commits, 255 files changed ([View Archive](milestones/v4.0.0-ROADMAP.md))
- **v4.1.0** — Agentic Intelligence & Platform Maturity: 10 phases, 17 plans, 77 commits, 229 files changed ([View Archive](milestones/v4.1.0-ROADMAP.md))
- **v4.2.0** — Workflow Unification & Memory Architecture: 5 phases, 8 plans, 15 commits, 312 files changed ([View Archive](milestones/v4.2.0-ROADMAP.md))
- **v4.3.0** — Observer Workflow Editor: 7 phases, 35 commits, 79 files changed ([View Archive](milestones/v4.3.0-ROADMAP.md))
- **v4.4.0** — Smart Context Management: 7 phases, 23 commits, 74 files changed ([View Archive](milestones/v4.4.0-ROADMAP.md))
- **v4.5.0** — Platform Simplification & Proactive Intelligence: 14 phases, 93 commits, 793 files changed ([View Archive](milestones/v4.5.0-ROADMAP.md))
- **v5.1.0** — Workflow Quality & Skill Simplification: 2 phases, 13 commits, 33 files changed ([View Archive](milestones/v5.1.0-ROADMAP.md))
- **v5.0.0** — Global NPM Package: 9 phases, 86 commits, 102 files changed ([View Archive](milestones/v5.0.0-ROADMAP.md))
- **v5.2.0** — Distribution & Install Quality: 8 phases, 43 commits, 201 files changed ([View Archive](milestones/v5.2.0-ROADMAP.md))
- **v5.3.0** — Dogfood via Global Install: 9 phases, 32 commits, 69 files changed ([View Archive](milestones/v5.3.0-ROADMAP.md))
- **v5.4.0** — Branding & Personalization: 3 phases, 3 commits, 37 files changed ([View Archive](milestones/v5.4.0-ROADMAP.md))

---

_Roadmap created: 2026-03-16 — v5.0.0 milestone started_
