# Roadmap

## Overview

**Current Milestone:** v7.1.0 — Multi-IDE Adapter Completion

---

## v7.1.0 — Multi-IDE Adapter Completion

Continues v7.0.0 foundation. All 3 adapters (Cursor, Windsurf, VS Code) already exist from v7.0.0 with compile methods, hook maps, and compatibility validators. Remaining work: wire emit() stubs, CLI integration, and prompt quality improvements.

**Branch:** 101--v7-ide-adapter-layer

### Phase 1: Adapter Emit Wiring (E01+E02+E03)

**Goal:** Complete emit() implementation for all 3 IDE adapters so compiled output is written to disk (.cursor/, .windsurf/, .github/).

**Depends on:** None (B01/B02 prerequisites completed in v6.0.0, adapter implementations completed in v7.0.0)

- [x] Plan 1 — Wire emit() for Cursor, Windsurf, and VS Code adapters

**Todos absorbed:** runtime-e01, runtime-e02, runtime-e03 (rescoped to emit() wiring only)

### Phase 2: Compatibility Report CLI (E04)

**Goal:** Wire validate() into emit results and add CLI integration (stdout summary + dist/compatibility-report.json).

**Depends on:** Phase 1 (validators need wired emit output to inspect)

- [x] Plan 1 — Compatibility report CLI integration

**Todos absorbed:** runtime-e04 (rescoped — schemas + validators already exist)

### Phase 3: Agent Team Prompt Audit Fixes

**Goal:** Implement 8 prioritized prompt quality improvements across 5 skill files (XML blocks, recipient declarations, output formats, team size caps).

**Depends on:** None (architecturally independent from adapter work)

- [x] Plan 1 — Prompt audit fixes across phase-execute, phase-research, phase-discuss, lu, pr-address

**Todos absorbed:** agent-team-prompt-audit-fixes

---

## Deferred to Future Milestones

| Todo Group                  | Target   | Scope                                  | Reason                                               |
| --------------------------- | -------- | -------------------------------------- | ---------------------------------------------------- |
| runtime-d01–d11             | v8.0.0   | Luca Studio (dev server + UI views)    | WSJF 1.6, CRITICAL effort, test reintro opportunity  |
| v2-phase-6                  | v9.0.0   | Orchestrator integration (lu.skill.ts) | HIGH arch risk + VERY HIGH QA risk, needs test infra |
| v2-enhanced-existing-agents | v9.0.0   | Agent enhancements (4 agents)          | Pairs with v2-phase-6, needs behavioral tests        |
| agent-cross-talk-protocol   | v10.0.0+ | Inter-agent messaging protocol         | Needs design spike, no existing infrastructure       |
| agent-collaboration-ui      | v10.0.0+ | Agent collaboration UI                 | Depends on cross-talk + adapters + Studio            |

## Closed (Reference / Not Actionable)

| Todo                          | Reason                                                          |
| ----------------------------- | --------------------------------------------------------------- |
| v2-external-research-patterns | Reference document, not an implementation task. Moved to docs/. |

## Backlog (Blocked)

| Todo | Title                | Blocker          | Reason                                                                  |
| ---- | -------------------- | ---------------- | ----------------------------------------------------------------------- |
| #37  | Test suite fragility | no-tests.md rule | Testing reintroduction per dedicated effort. v8.0.0 Studio may unblock. |

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

## Closed (v6.1.0 Completed)

| Todo        | Reason                                                                                                                                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Audit #1-24 | All 24 code quality findings from v6.0.0 audit resolved: 1 CRITICAL bug fix, 3 HIGH import violations, 5 DRY extractions, 2 schema placements, naming collisions, import style fixes |

## Closed (v6.0.0 Completed)

| Todo              | Reason                                                                                                                                    |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| runtime-a01–a11   | Workflow domain: DAG engine with builder, sorter, validator, executor, serializer, visualizer, pipeline, registration                     |
| runtime-b01–b10   | Adapter architecture: schemas, registry, Claude agent/skill emitters, API executor, compiler refactoring, DAG integration                 |
| runtime-c01–c10   | Eval domain: graders (code/LLM/composite), runner, reporter, comparator, seed eval suites, CLI integration                                |
| runtime-x01–x08   | Cross-cutting: architecture docs, boundary script, integration audit, recompilation script, behavioral equivalence, state/iteration plans |
| v2-phase-1–5      | v2 research infrastructure: 4 parallel researchers, convergence review loop, MuninnDB graduation, plan/executor enhancement               |
| v2-config         | Config & schema updates: WorkflowVersionSchema, ResearchConfigSchema, complexity matrix extensions                                        |
| v2-open-questions | 7 open questions resolved (Q5, Q6, Q8, Q9, Q11, Q15, Q16) in CANONICAL-DECISIONS.md                                                       |

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
- **v6.0.0** — Runtime Foundation & Adapter Layer: 10 phases, 129 commits, 205 files changed (+25,371 LOC) ([View Archive](milestones/v6.0.0-ROADMAP.md))
- **v6.1.0** — Audit Gap Closure: 3 phases, 20 commits, 30 files changed ([View Archive](milestones/v6.1.0-ROADMAP.md))
- **v7.0.0** — IDE Adapter Layer: 2 phases, 6 plans, 27 commits, 15 files changed (+2,378 LOC) ([View Archive](milestones/v7.0.0-ROADMAP.md))

---

_Roadmap created: 2026-03-16 — v5.0.0 milestone started_
