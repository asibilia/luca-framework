# Luca Framework

## What This Is

A distributable, CLI-installable agent development framework for Cursor IDE. Takes the battle-tested Luca workflow system and packages it for any team to adopt — with configurable branding, pluggable integrations, and enterprise-grade approval workflows. Install with `npx luca init`, answer a few questions, and get a complete AI-assisted development workflow.

## Core Value

**Zero-friction adoption of structured AI workflows.** Teams can adopt Luca in under 5 minutes with sensible defaults, then customize as their needs evolve.

## Current State (v1.3.1 — Shipped)

**Last Shipped:** v1.3.1 — Post-Audit Cleanup & Plugin Autocomplete (2026-02-12)

The Luca framework is now a distributable Claude Code plugin with clean naming conventions, full "/" autocomplete support, and 938 passing tests. Built on the v1.2.0 intelligent agent engine and v1.3.0 plugin distribution infrastructure, v1.3.1 resolves all critical audit findings, adopts scope-first skill naming for plugin namespace clarity, and generates command stub files for autocomplete discovery.

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

## Current Milestone: v1.3.2 — Audit Tech Debt Cleanup

Address all remaining findings from the v1.3.0 audit (12 HIGH, 18 MEDIUM, 18 LOW). Focuses on build pipeline consolidation, Bun API migration, compiler architecture refactor, security hardening, and code hygiene.

**17 requirements across 6 categories:**

- Build Pipeline Consolidation (4): Extract shared compilation pipeline, marketplace manifest, parameterized hook config
- Test Quality (2): Extract shared test utilities, remove unused variables
- Bun API Migration (2): Migrate build-utils.ts and check-drift.test.ts from node:fs to Bun APIs
- Compiler Architecture (1): Refactor BaseCompiler class hierarchy to factory-function pattern
- Security Hardening (5): Validate paths, sanitize inputs, add guards and constraints
- Code Hygiene (4): Fix unused variables, remove dead parameters, add consistency

## Next Milestone Goals (Post-v1.3.2)

- **Additional Stack Templates**: Python, Node.js, Next.js
- **Multi-project Support**: Support monorepos with multiple projects
- **Cross-IDE Support**: VS Code extension
- **Agent Marketplace**: Registry for sharing agents and skills
- **Procedural Memory Layer**: 4th memory type for learned skills/procedures
- **TDD-First Verification**: Test-driven generative development pattern

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

_Last updated: 2026-02-12 — v1.3.2 milestone started_
