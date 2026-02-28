# Roadmap

## Overview

**Current Milestone:** v2.4.0 — Pi Platform Completion (Phase 78-80)

---

## v2.3.0 — Distribution & Model Routing

**Goal:** Publish `@alecsibilia/luca-framework` as an installable npm package with multi-harness scaffolding (`bun add -d @alecsibilia/luca-framework && bun luca init`), and replace complexity gating with per-agent model routing for consistent workflows.

### Phase 71 — Distribution Foundation

**Goal:** Rename npm scope, add HarnessId type, export bridge CLI, update package.json bin entries. No behavior changes — purely structural.

**Depends on:** None

- [x] Plan 71-A: Rename scope, HarnessId type, runBridgeCli(), bin entry, version bump

### Phase 72 — Wizard & Harness Selection

**Goal:** Add harness multi-select to wizard, update config/init with `--harness` arg, refactor files.ts for conditional per-harness scaffolding.

**Depends on:** Phase 71 (scope and types must exist)

- [x] Plan 72-A: Wizard multiselect, CLI arg, conditional scaffolding

### Phase 73 — Template Infrastructure

**Goal:** Create template copy script, establish `templates/harness/` structure, chain build pipeline (`build:all` -> `build:templates` -> `build`).

**Depends on:** Phase 71 (HarnessId type needed for template structure)

- [x] Plan 73-A: Copy script, build pipeline chain, gitignore, tsconfig exclude

### Phase 74 — Hook Script Portability

**Goal:** Add PATH export to hook scripts, replace bridge resolution with cascading lookup, update remaining `@asibilia` references.

**Depends on:** Phase 71 (scope rename must be complete)

- [x] Plan 74-A: PATH export, cascading bridge lookup, hook sync

### Phase 75 — Update Command & Doctor

**Goal:** Make `update.ts` harness-aware, add per-harness verification to `doctor.ts`, update init success output.

**Depends on:** Phase 72 (harness selection must exist), Phase 73 (templates must exist)

- [x] Plan 75-A: Harness-aware update, manifest harnesses field, doctor harness check

### Phase 76 — Distribution Testing

**Goal:** Comprehensive test suite: wizard harness tests, conditional file generation, bridge CLI dispatch, manifest backward compat, integration test in temp dir.

**Depends on:** Phase 75 (all distribution features must be complete)

- [x] Plan 76-A: Wizard harness, files harness, manifest harness, doctor harness tests (32 new tests)

### Phase 77 — Model Routing Architecture

**Goal:** Replace complexity gating skip/run matrix with per-agent model routing. Keep complexity levels for estimation, remove workflow step gating. Add `modelTier` field to agent definitions.

**Depends on:** None (independent of distribution work)

- [x] Plan 77-A: ModelTierSchema, per-agent model_tier, 5-step resolve chain, deprecate step gating

---

## v2.4.0 — Pi Platform Completion

**Goal:** Activate runtime model routing via `pi.setModel()`, add interactive dialogs and keyboard shortcuts, and improve tool resilience with AbortSignal support and session lifecycle handling.

### Phase 78 — Runtime Model Routing

**Goal:** Wire v2.3.0's model routing infrastructure into Pi runtime so agents run on their designated model tier. Add context introspection for adaptive behavior.

**Depends on:** None

- [x] Plan 78-A: model-routing.ts helper, pi.setModel() in roles, model-aware spawn, context introspection

### Phase 79 — Interactive Dialogs & Shortcuts

**Goal:** Add interactive user prompts for workflow gates and keyboard shortcuts for common actions.

**Depends on:** Phase 78 (model routing needed for /switch-model command)

- [ ] Plan 79-A: dialogs.ts helper, interactive commands (/switch-model, /set-complexity, /config), keyboard shortcuts

### Phase 80 — Tool Resilience & Session Lifecycle

**Goal:** Add AbortSignal cancellation support, session lifecycle handling (compact/shutdown), structured details in tool returns, and custom message rendering.

**Depends on:** None (independent of Phase 78-79)

- [ ] Plan 80-A: AbortSignal in verify/tilldone/subagents, session_compact/shutdown events, details field, message renderer

---

## Backlog (Future)

### v2.5.0 — Multi-Language Profiles

- Python, Go, Rust tech stack profiles with full opinionated rules
- Mixed-stack project support (multiple profiles active simultaneously)

### v2.6.0+ — Adaptive Learning

- Procedure evolution via reinforcement learning patterns

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

---

_Roadmap updated: 2026-02-28 (v2.4.0 milestone started)_
