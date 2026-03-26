# Roadmap

## Overview

**Current Milestone:** v8.2.0 — Audit Gap Closure

---

## Active Phases

### Phase 204: Security Hardening

- [x] Git revert path allowlist + commit_sha hex validation (audit-security-revert)
- [x] ETag leak removal + localhost guard on git endpoints (audit-security-api)

**Goal:** Fix all 6 security findings from v8.1.0 audit: path allowlist on git revert, commit_sha hex-only regex, ETag removal from 409 response, localhost guard on mutating API routes, git log SHA validation, publish 409 file path redaction.
**Depends on:** None
**Files:** `packages/luca-studio/app/api/git/revert/route.ts`, `packages/luca-studio/app/api/git/publish/route.ts`, `packages/luca-studio/app/api/git/history/route.ts`, `packages/luca-studio/lib/config-section-handler.ts`

### Phase 205: Entity Hook DRY Extraction

- [ ] Extract useEntityDetail, useEntitySave, useEntityList generics (audit-entity-hook-dry)
- [ ] Schema-first metadata + dead undo cleanup (audit-entity-schema-cleanup)

**Goal:** Eliminate ~530 lines of entity hook triplication by extracting generic useEntityDetail, useEntitySave, and useEntityList hooks. Fix schema-first violations in save hooks with Zod metadata schemas. Remove dead canUndo/canRedo destructuring from 3 entity pages.
**Depends on:** None
**Files:** `packages/luca-studio/hooks/use-agent-detail.ts`, `packages/luca-studio/hooks/use-skill-detail.ts`, `packages/luca-studio/hooks/use-rule-detail.ts`, `packages/luca-studio/hooks/use-agent-save.ts`, `packages/luca-studio/hooks/use-skill-save.ts`, `packages/luca-studio/hooks/use-rule-save.ts`, `packages/luca-studio/hooks/use-agent-list.ts`, `packages/luca-studio/hooks/use-skill-list.ts`, `packages/luca-studio/hooks/use-rule-list.ts`, `packages/luca-studio/app/agents/page.tsx`, `packages/luca-studio/app/skills/page.tsx`, `packages/luca-studio/app/rules/page.tsx`

### Phase 206: Component DRY & Convention Alignment

- [ ] Tab container extraction + config form components (audit-component-dry)
- [ ] Pipeline Cmd+S fix + node:fs migration + convention fixes (audit-convention-alignment)

**Goal:** Extract shared tab container components (edit header, compiled fetch hook), unify config form section components, fix duplicate Cmd+S handler in pipeline save, migrate node:fs to Bun.file, fix JSDoc import ordering, add missing useCallback, replace JSON.parse/stringify clone with lodash cloneDeep, unify Switch component usage.
**Depends on:** Phase 205
**Files:** `packages/luca-studio/components/agents/agent-tab-container.tsx`, `packages/luca-studio/components/skills/skill-tab-container.tsx`, `packages/luca-studio/components/rules/rule-tab-container.tsx`, `packages/luca-studio/hooks/use-pipeline-save.ts`, `packages/luca-studio/lib/config-section-handler.ts`, `packages/luca-studio/hooks/use-sse.ts`, `packages/luca-studio/hooks/use-config-conflict.ts`, `packages/luca-studio/components/agents/agent-config-form.tsx`, `packages/luca-studio/components/skills/skill-config-form.tsx`, `packages/luca-studio/components/rules/rule-config-form.tsx`

### Phase 207: UI Token & Accessibility Polish

- [ ] Hardcoded color migration to CSS variable tokens (audit-ui-tokens)
- [ ] Accessibility fixes (focus-visible, aria, responsive heights) (audit-ui-a11y)

**Goal:** Replace all hardcoded green/amber color values with CSS variable tokens across 8+ components. Fix accessibility gaps: add focus-visible rings, aria-expanded attributes, aria-labels on tables. Fix responsive issues in command palette and CodeMirror heights. Unify icon button sizing to shadcn size="icon" pattern.
**Depends on:** Phase 206
**Files:** `packages/luca-studio/components/feedback/save-bar.tsx`, `packages/luca-studio/app/settings/page.tsx`, `packages/luca-studio/components/settings/config-history.tsx`, `packages/luca-studio/components/settings/vault-config.tsx`, `packages/luca-studio/components/settings/project-identity.tsx`, `packages/luca-studio/components/agents/agent-tab-container.tsx`, `packages/luca-studio/components/skills/skill-tab-container.tsx`, `packages/luca-studio/components/rules/rule-tab-container.tsx`, `packages/luca-studio/components/layout/command-palette.tsx`, `packages/luca-studio/components/settings/raw-config-editor.tsx`, `packages/luca-studio/components/home/quick-actions.tsx`

---

## Planned: v8.3.0 — Studio Feature Suite

Triaged via roadmap revision swarm (2026-03-26). 12 unplanned studio/skills todos grouped into 4 phases.

### Phase 208: API Layer Foundation

- [ ] SSE event stream + useSSE hook (studio-w7-sse-layer)
- [ ] ETag-based optimistic locking middleware (studio-w7-etag-locking)
- [ ] Git rollback with batch-commit-on-publish (studio-w8-git-rollback)

**Goal:** Build foundational API infrastructure (event streaming, concurrency control, git safety) required by all downstream Studio pages.
**Depends on:** Phase 207 (v8.2.0 complete)
**Risk:** HIGH (arch + QA) — Full+Manual verification required

### Phase 209: Core Pages

- [ ] Config page with Complexity/Gates/Harness tabs (studio-w7-config-page)
- [ ] Home page with status card and recent activity (studio-w7-home-page)
- [ ] Skills + Rules browser pages (studio-w7-skills-rules-pages)

**Goal:** Deliver core Studio page layer on stable API foundation.
**Depends on:** Phase 208

### Phase 210: Advanced UI & State

- [ ] Undo/redo with jotai-history (studio-w7-undo-redo)
- [ ] Keyboard shortcuts + progressive disclosure (studio-w8-keyboard-shortcuts)
- [ ] Consolidate Memory page (studio-w7-memory-consolidation)

**Goal:** Advanced UX features (state history, keyboard shortcuts, page consolidation) on stable pages.
**Depends on:** Phase 209

### Phase 211: Observability & Polish

- [ ] Edit/observe visual mode distinction (studio-w7-edit-observe-modes)
- [ ] Settings page (studio-w8-settings-page)
- [ ] Agent team prompt audit fixes (agent-team-prompt-audit-fixes)

**Goal:** Polish pass — visual modes, settings aggregation, and prompt quality fixes.
**Depends on:** Phase 210

---

## Deferred to Future Milestones

| Todo Group                  | Target   | Scope                                  | Reason                                               |
| --------------------------- | -------- | -------------------------------------- | ---------------------------------------------------- |
| v2-phase-6                  | v9.0.0   | Orchestrator integration (lu.skill.ts) | HIGH arch risk + VERY HIGH QA risk, needs test infra |
| v2-enhanced-existing-agents | v9.0.0   | Agent enhancements (4 agents)          | Pairs with v2-phase-6, needs behavioral tests        |
| agent-cross-talk-protocol   | v10.0.0+ | Inter-agent messaging protocol         | Needs design spike, no existing infrastructure       |
| agent-collaboration-ui      | v10.0.0+ | Agent collaboration UI                 | Depends on cross-talk + adapters + Studio            |

## Closed (Reference / Not Actionable)

| Todo                          | Reason                                                          |
| ----------------------------- | --------------------------------------------------------------- |
| v2-external-research-patterns | Reference document, not an implementation task. Moved to docs/. |
| runtime-d01–d11               | Superseded by studio-w\* todos in v8.0.0 (scope revised)        |

## Closed (v8.0.0 Backlog Cleanup)

| Todo                          | Reason                                                                                                    |
| ----------------------------- | --------------------------------------------------------------------------------------------------------- |
| studio-w1 (1 todo)            | Package rename (luca-observer → luca-studio) shipped in v8.0.0                                            |
| studio-w2 (4 todos)           | Foundation (compilation sidecar, Jotai atoms, new deps, TS round-trip) shipped in v8.0.0                  |
| studio-w3 (5 todos)           | API layer (read routes, compile routes, config write, entity CRUD, validation pipeline) shipped in v8.0.0 |
| studio-w4 (2 todos)           | UI layout (layout components, navigation restructure) shipped in v8.0.0                                   |
| studio-w5 (3 todos)           | Editor components (editor, feedback, visualization) shipped in v8.0.0                                     |
| studio-w6 (2 todos)           | Core pages (agents page, pipeline page) shipped in v8.0.0                                                 |
| runtime-e04                   | Adapter compatibility report (schema + validator + CLI) shipped in v7.x/v8.0.0                            |
| v2-external-research-patterns | Reference document, not implementation task (already in Closed section above)                             |

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
- **v7.1.0** — Multi-IDE Adapter Completion: 3 phases, 3 plans, 10 commits, 22 files changed (+1,780 LOC) ([View Archive](milestones/v7.1.0-ROADMAP.md))
- **v7.2.0** — Audit Gap Closure: 1 phase, 1 plan, 3 commits, 8 files changed (-140 LOC) ([View Archive](milestones/v7.2.0-ROADMAP.md))
- **v8.0.0** — Luca Studio MVP: 12 phases, 23 plans, 45 commits, 365 files changed (+17,647 LOC) ([View Archive](milestones/v8.0.0-ROADMAP.md))
- **v8.1.0** — Studio Polish & Prompt Quality: 4 phases, 10 plans, 58 commits, 123 files changed (+12,956 LOC) ([View Archive](milestones/v8.1.0-ROADMAP.md))

---

_Roadmap created: 2026-03-16 — v5.0.0 milestone started_
