# Luca Framework

## What This Is

A distributable, CLI-installable agent development framework for Cursor IDE. Takes the battle-tested Luca workflow system and packages it for any team to adopt — with configurable branding, pluggable integrations, and enterprise-grade approval workflows. Install with `npx luca init`, answer a few questions, and get a complete AI-assisted development workflow.

## Core Value

**Zero-friction adoption of structured AI workflows.** Teams can adopt Luca in under 5 minutes with sensible defaults, then customize as their needs evolve.

## Current State (v1.8.0 — Shipped)

**Last Shipped:** v1.8.0 — Functional Architecture & Bridge Unification (2026-02-25)

Completed the functional architecture migration: all 28 agents and 45 skills migrated from class-based patterns to `createAgent()`/`createSkill()` factory functions, matching the `createRule()` pattern established in v1.6.0. All three entity types now use identical factory patterns with Zod validation and deep freeze immutability. Verified 100% state machine bridge adoption across all 20 stateful skills. Resolved all audit findings: deep freeze, naming utils, stale comments, double validation, PascalCase configs, duplicate types, index signatures. Net code reduction of 343 lines. 1763 tests (1763 pass, 6 skip), 28 agents, 45 skills, 19 rules.

## Previous State (v1.7.0)

v1.7.0 — Codebase Health & Build Stability (2026-02-23)

Resolved accumulated tech debt from v1.6.0: clean TypeScript compilation (0 errors across all packages), consolidated test conventions (`__tests__/` directory), full Bun API alignment (Bun.file, Bun.$, node:fs prefixes). Extracted shared utilities (parse-frontmatter.ts), applied sanitizeJsonParse consistently across all 3 isolated domains, eliminated dead code (duplicate agents, stale generators), deduplicated VALID_TRACKERS constant. 1763 tests (1763 pass, 6 skip), 28 agents, 45+ skills, 19 rules.

## Previous State (v1.6.0)

v1.6.0 — Package & Publish (2026-02-16)

Standalone XState workflow state package (`packages/luca-state/`) with zero framework dependencies, 347 tests, 12-subcommand CLI. Full framework rewire (83 source files + 327 generated files). Memory suspend/resume with checkpoint persistence and auto-persist on context warnings. Milestone-scoped memory recall with version distance scoring. Tech stack guideline profiles with conditional rule loading, config toggle, and auto-detection integration. Post-milestone tech debt cleanup: class-to-functional rule refactor (19 rules), duplicate state-machine deletion (-8,300 lines), type deduplication. 1755 tests (1749 pass, 6 skip), 30 agents, 45+ skills, 19 rules.

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

_Last updated: 2026-02-25 — v1.8.0 milestone completed_
