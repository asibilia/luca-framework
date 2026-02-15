# Luca Framework

## What This Is

A distributable, CLI-installable agent development framework for Cursor IDE. Takes the battle-tested Luca workflow system and packages it for any team to adopt — with configurable branding, pluggable integrations, and enterprise-grade approval workflows. Install with `npx luca init`, answer a few questions, and get a complete AI-assisted development workflow.

## Core Value

**Zero-friction adoption of structured AI workflows.** Teams can adopt Luca in under 5 minutes with sensible defaults, then customize as their needs evolve.

## Current State (v1.4.0 — Shipped)

**Last Shipped:** v1.4.0 — Developer Experience & Verification (2026-02-14)

Dogfood build stability (session lock guard, build manifest, harness safety), TDD-first verification pattern (lu-test-writer agent, red-green cycle, T1/T3 signal priority), auto-discuss web research agent (--auto flag with lu-discuss-researcher), and workflow documentation (4 Mermaid diagrams). 1042 tests (1036 pass, 6 skip), 28 agents, 45 skills.

**Capabilities (shipped):**

- **Zero-friction setup**: `npx luca init` scaffolds projects in < 5 minutes
- **Pluggable tracking**: Adapters for Jira, GitHub Issues, and Placeholder
- **Enterprise readiness**: `npx luca doctor`, security docs, and approval workflows
- **Safe updates**: `npx luca update` with conflict detection
- **Registry-driven builds**: All agents, skills, and rules compiled from source via typed registries
- **Deterministic hooks**: Post-edit formatting/typechecking, pre-commit quality gate, context monitoring, session persistence (Claude Code + Cursor)
- **Automated verification**: 4-parser harness (tsc, bun-test, eslint, generic) with failure-to-fix loops
- **Complexity gating**: 5-level system (TRIVIAL-CRITICAL) with 3 behavioral tiers scaling workflow steps
- **Goal-backward verification**: Specification anchoring re-injects PLAN.md at checkpoints to prevent drift
- **4-tier cognition system**: T0 (Stateless) through T3 (Fully-Cognitive) with selective memory recall via 14 domain tags
- **Context-modular sub-agents**: Context isolation, writer/reviewer separation, universal result envelope
- **Iterative agent loops (Ralph Wiggum)**: External loop control, convergence detection, checkpoint/rollback, HITL/AFK modes
- **Usage-aware sprint planning**: WSJF scoring, Big Rock First scheduling, quality zones, weekly allocation

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

## Current Milestone

**v1.5.0 — Cognitive Architecture & State Machine**

Replace markdown-based state management with a deterministic XState state machine, improve memory systems with compression/quality scoring, and add procedural memory for learned skills.

### Goals

- **XState Workflow State Machine**: Deterministic state transitions via XState v5 actor model, replacing LLM-driven markdown reads/writes with callable functions
- **Memory Improvements**: Token-aware compression, structured WORKING.md schemas, async context monitoring, phase quality scoring
- **Procedural Memory Layer**: 4th memory type encoding reusable workflows extracted from successful executions

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
- Company-specific references (Percent, percent-ui, mypercent.atlassian.net)
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

_Last updated: 2026-02-15 — v1.5.0 milestone complete_
