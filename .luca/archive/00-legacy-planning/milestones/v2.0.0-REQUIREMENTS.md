# Requirements — v2.0.0 Unified Package & Intelligent Routing

## Phase 56 — Repo Structure Architect Agent

- [ ] R56-1: `lu-repo-architect` agent registered via `createAgent()` factory pattern
- [ ] R56-2: Agent performs structural audits: orphaned files, naming violations, empty dirs, circular imports
- [ ] R56-3: `repo-audit` skill registered via `createSkill()` with interactive + automated modes
- [ ] R56-4: Complexity gating: lightweight checks at TRIVIAL/SIMPLE, full audit at COMPLEX/CRITICAL
- [ ] R56-5: Hook integration fires at phase boundaries when complexity >= MODERATE
- [ ] R56-6: Self-audit on framework repo produces clean health report

## Phase 57 — Package Consolidation

- [ ] R57-1: Single `packages/luca-framework/` package exports all functionality
- [ ] R57-2: `luca-state` source absorbed into unified package with all APIs re-exported
- [ ] R57-3: All 11 `luca-state` test files migrated and passing
- [ ] R57-4: `create-luca` scaffolding absorbed into `init` command
- [ ] R57-5: `luca-state` and `create-luca` package directories removed
- [ ] R57-6: Workspace config, tsconfig paths, and all internal imports updated
- [ ] R57-7: Bridge CLI commands still function through unified package
- [ ] R57-8: All 1763+ existing tests pass after consolidation

## Phase 58 — CLI Commands & Plugin Distribution

- [ ] R58-1: `luca run:claude` command invokes `claude --plugin-dir` with correct path
- [ ] R58-2: `luca run:cursor` stub command exists for future use
- [ ] R58-3: `luca init` scaffolds `.claude/` and/or `.cursor/` directories interactively
- [ ] R58-4: `dist/` structured so `--plugin-dir` finds compiled rules, skills, hooks, settings
- [ ] R58-5: `npm pack` produces clean package with correct files
- [ ] R58-6: Package.json `bin`, `exports`, and `files` fields configured correctly

## Phase 59 — Model-Aware Task Routing

- [ ] R59-1: `AgentFrontmatterSchema` extended with optional `model_routing` field
- [ ] R59-2: `ComplexityGateSchema` extended with `default_model` field
- [ ] R59-3: `lu-router` outputs model recommendation in routing decision
- [ ] R59-4: 3-5 key agents have model routing preferences defined
- [ ] R59-5: Documentation in JSDoc and rules file

## Phase 60 — Integration Testing & Release Prep

- [ ] R60-1: Fresh install + init + run:claude works end-to-end
- [ ] R60-2: State machine bridge commands work through unified package
- [ ] R60-3: ROADMAP archived, version bumped to 2.0.0
- [ ] R60-4: Repo structure audit passes clean
- [ ] R60-5: CHANGELOG updated with v2.0.0 entries

---

_Requirements created: 2026-02-26_
