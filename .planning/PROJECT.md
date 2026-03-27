# Luca Framework

## What This Is

A distributable, CLI-installable agent development framework for Cursor IDE. Takes the battle-tested Luca workflow system and packages it for any team to adopt — with configurable branding, pluggable integrations, and enterprise-grade approval workflows. Install with `npx luca init`, answer a few questions, and get a complete AI-assisted development workflow.

## Core Value

**Zero-friction adoption of structured AI workflows.** Teams can adopt Luca in under 5 minutes with sensible defaults, then customize as their needs evolve.

## Current State (v8.4.0 — Shipped)

**Last Shipped:** v8.4.0 — Studio Quality & Bug Fixes (2026-03-27)

5 phases, 7 plans, 29 commits, 92 files changed (+2,489 LOC). Fixed 8 Studio bugs: P0 Jotai save callback crash, P0 sidebar collapse, P1 home page fields, P1 sessions empty, P1 git routes runtime, P2 MuninnDB metrics, P3 code quality cleanup.

## Previous State (v8.3.0 — Shipped)

**Last Shipped:** v8.3.0 — Studio Feature Suite (2026-03-27)

6 phases, 4 plans, 35 commits, 99 files changed (+2,969 LOC).

## Previous State (v8.1.0 — Shipped)

**Last Shipped:** v8.1.0 — Studio Polish & Prompt Quality (2026-03-25)

### Key Deliverables

- Agent team prompt audit (8 fixes across 5 skill files)
- Studio W7 infrastructure: SSE, ETag locking, undo/redo
- Studio W7 pages: Home, Config, Skills, Rules, Memory consolidation, Edit/Observe modes
- Studio W8 polish: Settings page with raw config editor, Git rollback APIs, keyboard shortcuts, command palette, progressive disclosure

**Stats:** 4 phases, 10 plans, 58 commits, 123 files changed (+12,956 LOC)

## Previous State (v8.0.0 — Shipped)

**Last Shipped:** v8.0.0 — Luca Studio MVP (2026-03-25)

8 phases, 43 commits, 201 files changed. Fixed critical install bugs (vault path, MuninnDB URL, prefix templating, platform selection), added GitHub Actions auto-publish.

## Previous State (v5.0.0 — Shipped)

**Last Shipped:** v5.0.0 — Global NPM Package (2026-03-17)

9 phases, 86 commits, 102 files changed. Ship `@alecsibilia/luca-framework` as globally-installable NPM package with one-command setup, MuninnDB binary installation, artifact deployment, and guided vault configuration.

## Previous State (v4.5.0 — Shipped)

**Last Shipped:** v4.5.0 — Platform Simplification & Proactive Intelligence (2026-03-15)

14 phases, 93 commits, 793 files (+16,465/-157,273 LOC). Removed non-Claude platforms, migrated hooks to TypeScript, shadow debt scanner, proactive context management, observer memory redesign, security hardening, DRY cleanup.

## Previous State (v4.4.0)

v4.4.0 — Smart Context Management (2026-03-14). 7 phases, 23 commits, 74 files changed (+6,756/-101 LOC). Complete context management pipeline: hook schema expansion (5→18 canonical events), PreCompact checkpoint hook (MuninnDB + filesystem), context metrics JSON with proactive checkpointing, session compact restore hook, /context-restore skill for manual deep recovery, observer context window bar with real token metrics via statusLine API.

## Previous State (v4.3.0)

v4.3.0 — Observer Workflow Editor (2026-03-13). 7 phases, 35 commits, 79 files changed (+7,963/-23 LOC). Visual node-graph editor (ComfyUI-style) for the Observer app using React Flow v12.

## Previous State (v4.2.0)

v4.2.0 — Workflow Unification & Memory Architecture (2026-03-12). 5 phases, 8 plans, 15 commits, 312 files changed (+9,135/-16,048). Complexity gating reworked to model-tier-only. Multi-vault MuninnDB architecture formalized. Vault-routing rule, dual-vault recall, write routing, brain tree split.

## Previous State (v4.1.0)

v4.1.0 — Agentic Intelligence & Platform Maturity (2026-03-11). 10 phases, 17 plans, 77 commits, 229 files changed (+13,978/-1,050). Skill dependency orchestration, tribunal consensus model, multi-lens review gate, observer todo tracking, semantic memory embeddings, cross-agent interop scanner, memory effectiveness measurement, security hardening, DRY alignment, observer UI polish.

## Previous State (v4.0.0)

v4.0.0 — Process Intelligence & Self-Tuning Workflow (2026-03-10). 6 phases, 12 plans, 48 commits, 255 files changed (+64,528/-3,396). Fixed appetite/variable scope planning, pre-mortem risk analysis, process metrics collection, outcome tracking, self-tuning governance, process retrospective dashboard, divergent mode advisory.

## Previous State (v3.3.0)

v3.3.0 — Cognitive Maturity & Observer Depth (2026-03-09). 6 phases, 12 plans, 78 commits, 94 files changed. Learning loop closure, adaptive complexity self-tuning, deferred/lazy recall, 4 new observer views (Knowledge Graph, Semantic Search, Contradictions, Entity Deep Dive).

## Previous State (v3.2.0)

v3.2.0 — Observer Rebirth (2026-03-09). 8 phases, 20 plans, 48 commits, 193 files changed. SpacetimeDB replaced with MuninnDB across observer stack, 4 new views, design system established.

## Previous State (v3.1.0)

v3.1.0 — Memory Intelligence & Platform Cleanup (2026-03-09). 7 phases, 10 commits, 151 files changed. Complexity-gated recall depth, automatic session memory cleanup, SpacetimeDB removed from framework.

**Capabilities (shipped):**

- **Zero-friction setup**: `npx luca init` scaffolds projects in < 5 minutes
- **Pluggable tracking**: Adapters for Jira, GitHub Issues, and Placeholder
- **Enterprise readiness**: `npx luca doctor`, security docs, and approval workflows
- **Safe updates**: `npx luca update` with conflict detection
- **Registry-driven builds**: All agents, skills, and rules compiled from source via typed registries
- **Deterministic hooks**: Post-edit formatting/typechecking, pre-commit quality gate, context monitoring, session persistence (Claude Code + Cursor)
- **Automated verification**: 4-parser harness (tsc, bun-test, eslint, generic) with failure-to-fix loops
- **Complexity gating**: 5-level system (TRIVIAL-CRITICAL) with model-tier-only routing (all steps always run)
- **Multi-vault MuninnDB**: Dual-vault architecture with config-driven vault resolution, type-based recall routing, and write routing heuristic
- **Goal-backward verification**: Specification anchoring re-injects PLAN.md at checkpoints to prevent drift
- **4-tier cognition system**: T0 (Stateless) through T3 (Fully-Cognitive) with selective memory recall via 14 domain tags
- **Context-modular sub-agents**: Context isolation, writer/reviewer separation, universal result envelope
- **Iterative agent loops (Ralph Wiggum)**: External loop control, convergence detection, checkpoint/rollback, HITL/AFK modes
- **Usage-aware sprint planning**: WSJF scoring, Big Rock First scheduling, quality zones, weekly allocation
- **XState workflow state machine**: 12-state deterministic machine with persistence, guards, child actors, event architecture
- **Typed bridge CLI**: 18 commands (10 state-machine + 8 memory) replacing markdown reads/writes
- **Token-aware memory compression**: Age/staleness scoring, 5 strategies (keep/summarize/archive/drop/merge)
- **Async context monitoring**: Quality zones (peak/good/degrading/stop), compression triggers, PostToolUse throttled
- **Phase quality scoring**: Weighted composite (tests 40%, types 20%, verification 25%, learnings 15%) with trend tracking
- **Procedural memory**: Learned skill templates from successful executions with relevance-ranked recall and retirement

## Previous Milestones

- **v1.0.0** — Core CLI & Packaging (2026-02-05). CLI installer, branding, templates, tracking adapters, enterprise readiness.
- **v1.0.1** — Code Hardening (2026-02-10). 6 phases, 433 tests, Zod at all boundaries, clean architecture, 23ms startup.
- **v1.1.0** — Workflow Foundation (2026-02-11). 4 phases, 11 plans, 27 requirements, 579 tests. Registry-driven builds, hooks, verification harness, complexity gates.
- **v1.2.0** — Intelligent Agent Engine (2026-02-12). 5 phases, 25 plans, 29 requirements, 845 tests. Verification audit, cognition profiling, context isolation, iterative loops, sprint planning.
- **v1.3.0** — Claude Code Plugin Distribution (2026-02-12). 5 phases, 19 plans, 25 requirements, 928 tests. Plugin compiler, skills/agents packaging, hooks runtime, marketplace distribution, integration testing.
- **v1.3.1** — Post-Audit Cleanup & Plugin Autocomplete (2026-02-12). 171 files, 938 tests. Rule class cleanup, skill naming overhaul, plugin autocomplete commands.
- **v1.3.2** — Audit Tech Debt Cleanup (2026-02-13). 4 phases, 8 plans, 17 requirements, 992 tests. Build pipeline consolidation, compiler functional refactor, Bun API migration, security hardening.
- **v1.3.3** — Final Audit Sweep (2026-02-13). 2 phases, 4 plans, 10 requirements, 992 tests. Build script deprecation, pipeline decomposition, registry factory refactor, drift test DRY-up, plugin spec async migration.
- **v1.4.0** — Developer Experience & Verification (2026-02-14). 4 phases, 8 plans, 21 requirements, 1042 tests (1036 pass, 6 skip). Dogfood build stability, TDD-first verification, auto-discuss research agent, workflow documentation.
- **v1.5.0** — Cognitive Architecture & State Machine (2026-02-15). 6 phases, 14 plans, 35 requirements, 1660 tests (1654 pass, 6 skip). XState workflow machine, typed bridge CLI, memory compression/monitoring, procedural memory, full skill migration, code quality cleanup.
- **v1.6.0** — Package & Publish (2026-02-16). 4 phases, 9 plans, 18 requirements, 1755 tests (1749 pass, 6 skip). XState package extraction, framework rewire, memory suspend/resume, tech stack profiles, class-to-functional refactor.
- **v1.7.0** — Codebase Health & Build Stability (2026-02-23). 8 phases, 13 plans, 1763 tests. TypeScript compilation cleanup, test consolidation, Bun API alignment, shared utility extraction, dead code elimination.
- **v1.8.0** — Functional Architecture & Bridge Unification (2026-02-25). 3 phases, 8 plans, 8 requirements, 1763 tests. Agent/skill factory migration, deep freeze immutability, 100% bridge adoption, audit sweep.
- **v1.9.0 — v2.9.0** — See ROADMAP.md history for full details.
- **v3.0.0** — Data Integrity, Agentic Reliability & Model Routing Redesign (2026-03-08). 14 phases, 42 plans, 151 commits. MuninnDB migration, model routing redesign, convention compliance.
- **v3.1.0** — Memory Intelligence & Platform Cleanup (2026-03-09). 7 phases, 10 commits. Recall depth, session cleanup, SpacetimeDB removed.
- **v3.2.0** — Observer Rebirth (2026-03-09). 8 phases, 20 plans, 48 commits. MuninnDB observer stack, 4 views, design system.
- **v3.3.0** — Cognitive Maturity & Observer Depth (2026-03-09). 6 phases, 12 plans, 78 commits. Learning loop, self-tuning, 4 advanced observer views.
- **v4.0.0** — Process Intelligence & Self-Tuning Workflow (2026-03-10). 6 phases, 12 plans, 48 commits, 255 files changed. Appetite system, pre-mortem, process metrics, outcome tracking, self-tuning governance.
- **v4.1.0** — Agentic Intelligence & Platform Maturity (2026-03-11). 10 phases, 17 plans, 77 commits, 229 files changed. Skill dependencies, tribunal consensus, multi-lens review, observer todos, semantic embeddings, interop scanner, memory effectiveness, security hardening.
- **v4.2.0** — Workflow Unification & Memory Architecture (2026-03-12). 5 phases, 8 plans, 15 commits, 312 files changed. Complexity gating model-tier-only, multi-vault MuninnDB, vault-routing rule, dual-vault recall/write, brain tree split.
- **v4.3.0** — Observer Workflow Editor (2026-03-13). 7 phases, 35 commits, 79 files changed. React Flow v12, stage-group containers, custom nodes, complexity filter, grouped column layout, Zod safeParse, ARIA accessibility.
- **v4.4.0** — Smart Context Management (2026-03-14). 7 phases, 23 commits, 74 files changed. Hook schema expansion, PreCompact checkpoint, context metrics, session restore, /context-restore skill, observer context bar.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] CLI installer (`npx luca init`) with setup wizard
- [ ] Configurable branding (command prefix, output headers, ticket patterns)
- [ ] Pluggable work tracking interface (Jira, Linear, GitHub Issues, custom)
- [ ] Configurable approval workflows (plans, destructive actions, external actions)
- [ ] React + TypeScript BRAIN.md template with conventions
- [ ] Version notification on init (check for updates)
- [ ] Remove hardcoded company references (PT-, ENG-, Percent)
- [ ] Abstract `.cursor/luca/` path dependencies

### Out of Scope

- Auto-updating framework — Enterprise teams need control over updates
- Multiple stack templates v1 — Start with React+TS, prove pattern, then expand
- Multi-project in same repo — Single `.planning/` directory per repo
- SSO/authentication integration — Beyond framework scope, users handle auth
- CLI-only mode (no Cursor) — Tight Cursor integration is core value proposition

## Context

**Current state:** The Luca framework exists and works well in the Percent codebase. It has 26+ agents, 30+ skills, comprehensive workflow documentation, and a two-tier memory system (BRAIN/MEMORY/WORKING). However, it's heavily coupled to Percent-specific conventions.

**Packageability concerns identified:**

- 10+ locations with hardcoded PT-/ENG- ticket prefixes
- Company-specific references
- Hardcoded GitHub repository references
- Absolute path dependencies to `.cursor/luca/`
- No npm package or installation script
- No version management

**Target audience:** Enterprise development teams wanting consistent AI-assisted workflows with compliance and security considerations.

## Constraints

- **Platform**: Cursor IDE only — MCP integration is core dependency
- **Node.js**: CLI installer requires Node.js 18+ runtime
- **Git**: Framework assumes git-based workflow (branches, commits, PRs)
- **Compatibility**: Must not break existing Luca installations during transition

## Key Decisions

| Decision                                    | Rationale                                               | Outcome   |
| ------------------------------------------- | ------------------------------------------------------- | --------- |
| CLI installer over npm package              | Better UX for setup wizard, can prompt for config       | — Pending |
| Branded skin over full rebrand              | Cursor limitations on file names, enables upgradability | — Pending |
| React+TS template only for v1               | Ship one excellent template, prove pattern              | — Pending |
| Notify on updates, not auto-update          | Enterprise teams need update control                    | — Pending |
| Configurable approvals with secure defaults | Balance flexibility with safety                         | — Pending |

---

_Last updated: 2026-03-14 — v4.4.0 milestone archived_
