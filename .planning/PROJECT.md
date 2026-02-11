# Luca Framework

## What This Is

A distributable, CLI-installable agent development framework for Cursor IDE. Takes the battle-tested Luca workflow system and packages it for any team to adopt — with configurable branding, pluggable integrations, and enterprise-grade approval workflows. Install with `npx luca init`, answer a few questions, and get a complete AI-assisted development workflow.

## Core Value

**Zero-friction adoption of structured AI workflows.** Teams can adopt Luca in under 5 minutes with sensible defaults, then customize as their needs evolve.

## Current State (v1.1.0)

**Shipped:** 2026-02-11
**Version:** 1.1.0

The Luca framework has a fully automated quality enforcement pipeline built on registry-driven compilation, deterministic hooks, an automated verification harness, and complexity-scaled workflow.

**Capabilities:**

- **Zero-friction setup**: `npx luca init` scaffolds projects in < 5 minutes
- **Pluggable tracking**: Adapters for Jira, GitHub Issues, and Placeholder
- **Enterprise readiness**: `npx luca doctor`, security docs, and approval workflows
- **Safe updates**: `npx luca update` with conflict detection
- **Registry-driven builds**: All agents, skills, and rules compiled from source via typed registries
- **Deterministic hooks**: Post-edit formatting/typechecking, pre-commit quality gate, context monitoring, session persistence (Claude Code + Cursor)
- **Automated verification**: 4-parser harness (tsc, bun-test, eslint, generic) with failure-to-fix loops
- **Complexity gating**: 5-level system (TRIVIAL-CRITICAL) with 3 behavioral tiers scaling workflow steps

## Previous Milestones

- **v1.0.0** — Core CLI & Packaging (2026-02-05). CLI installer, branding, templates, tracking adapters, enterprise readiness.
- **v1.0.1** — Code Hardening (2026-02-10). 6 phases, 433 tests, Zod at all boundaries, clean architecture, 23ms startup.
- **v1.1.0** — Workflow Foundation (2026-02-11). 4 phases, 11 plans, 27 requirements, 579 tests. Registry-driven builds, hooks, verification harness, complexity gates.

## Next Milestone Goals

- **Additional Stack Templates**: Python, Node.js, Next.js
- **Multi-project Support**: Support monorepos with multiple projects
- **Cross-IDE Support**: VS Code extension
- **Agent Marketplace**: Registry for sharing agents and skills
- **Iterative Agent Loops**: Ralph Wiggum pattern for agent self-correction
- **Context-Modular Architecture**: Sub-agent context separation and progressive disclosure

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

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| CLI installer over npm package | Better UX for setup wizard, can prompt for config | — Pending |
| Branded skin over full rebrand | Cursor limitations on file names, enables upgradability | — Pending |
| React+TS template only for v1 | Ship one excellent template, prove pattern | — Pending |
| Notify on updates, not auto-update | Enterprise teams need update control | — Pending |
| Configurable approvals with secure defaults | Balance flexibility with safety | — Pending |

---
*Last updated: 2026-02-04 after initial questioning*
