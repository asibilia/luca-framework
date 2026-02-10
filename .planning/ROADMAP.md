# Roadmap

## Overview

**Current Milestone:** v1.1.0 — Workflow Foundation

Establish the enforcement and verification foundation that all future workflow improvements build on. The build pipeline compiles everything from source, hooks provide deterministic quality gates, an automated harness replaces manual verification, and complexity gates scale workflow with task scope.

**Goal:** Make quality enforcement automatic and unavoidable — advisory instructions become deterministic gates.

---

## Phase 10: Build Pipeline

**Goal:** Create agent and rule registries so the build compiles all entities from `src/` to both `.cursor/` and `.claude/`. Close the dogfooding gap where this repo is a first-party consumer of its own framework output.

**Status:** Pending

**Success Criteria:**

- `agentRegistry` in `src/agents/index.ts` exports all 23 general agents (luca-specific agents handled separately by build scripts)
- `ruleRegistry` in `src/rules/index.ts` exports all 20 general rules (luca-specific rules handled separately by build scripts)
- Build scripts iterate all three registries (agents, skills, rules)
- `bun run build:cursor` produces all agents, skills, and rules in `.cursor/`
- `bun run build:claude` produces all agents, skills, and rules in `.claude/`
- No stale output files — generated output matches source definitions

### Requirements Delivered

| REQ | Description | Priority | Status |
|-----|-------------|----------|--------|
| BUILD-01 | Agent registry | Critical | Pending |
| BUILD-02 | Rule registry | Critical | Pending |
| BUILD-03 | Registry-based build scripts | Critical | Pending |
| BUILD-04 | Full Cursor output | Critical | Pending |
| BUILD-05 | Full Claude output | Critical | Pending |
| BUILD-06 | No stale output files | High | Pending |

### Risks

- Existing hand-placed files in `.cursor/` may have manual edits not captured in `src/`
- Need to decide `.gitignore` policy for generated output directories

---

## Phase 11: Hooks

**Goal:** Implement deterministic quality gates using Claude Code hooks. Replace advisory enforcement (agents remembering to check) with automatic enforcement (hooks that always run).

**Status:** Pending

**Success Criteria:**

- Hook infrastructure exists and is distributable
- Post-edit hooks auto-format and type-check changed files
- Pre-commit hook blocks commits with failing tests or lint errors
- Context usage monitoring warns at configurable thresholds
- WORKING.md persistence on session stop
- Hook/skill boundary clearly documented
- Hooks included in `luca init` templates for downstream projects

### Requirements Delivered

| REQ | Description | Priority | Status |
|-----|-------------|----------|--------|
| HOOK-01 | Hook directory structure | Critical | Pending |
| HOOK-02 | Post-edit formatting | High | Pending |
| HOOK-03 | Post-edit type-checking | High | Pending |
| HOOK-04 | Pre-commit quality gate | Critical | Pending |
| HOOK-05 | Context usage monitor | Medium | Pending |
| HOOK-06 | WORKING.md persistence | Medium | Pending |
| HOOK-07 | Hook/skill boundary docs | High | Pending |
| HOOK-08 | Distributable via luca init | High | Pending |

### Dependencies

- Phase 10 (build pipeline must work so hooks can be part of compiled output)

### Risks

- Hook execution adds latency to every edit — lightweight checks must be fast
- Different projects have different toolchains (not all use TypeScript, bun test, etc.)
- Context usage monitoring requires API not available in all environments

---

## Phase 12: Verification Harness

**Goal:** Build an automated verification pipeline that runs tests, lint, typecheck, and build as the primary quality signal. Integrate into `lu-execute-phase` so verification is automatic, not manual.

**Status:** Pending

**Success Criteria:**

- Single orchestrated verification command runs all checks
- Harness runs automatically after wave execution, before agent-based verification
- Project-specific harness configuration in `.planning/config.json`
- Failure-to-fix loop: parse errors, feed to executor, re-run, max iterations
- Harness output provides structured data for lu-verifier
- Lightweight checks via hooks; full harness at phase boundaries

### Requirements Delivered

| REQ | Description | Priority | Status |
|-----|-------------|----------|--------|
| VERI-01 | Single harness command | Critical | Pending |
| VERI-02 | Integration into lu-execute-phase | Critical | Pending |
| VERI-03 | Project-specific configuration | High | Pending |
| VERI-04 | Failure-to-fix pipeline | High | Pending |
| VERI-05 | Structured output for lu-verifier | Medium | Pending |
| VERI-06 | Lightweight hooks + full harness split | High | Pending |

### Dependencies

- Phase 11 (hooks provide the lightweight check layer that complements the harness)

### Risks

- Parsing error output from diverse toolchains (bun test, tsc, eslint) requires structured parsers
- Max iteration loops need escape hatches to prevent infinite fix cycles
- Harness adds execution time — must be fast enough to not frustrate workflow

---

## Phase 13: Complexity Gates

**Goal:** Design and implement a structured system where workflow complexity scales with task scope. Core steps always run; additional steps activate based on complexity level.

**Status:** Pending

**Success Criteria:**

- Clear complexity levels defined with measurable criteria
- Always-on steps identified (verification runs for all levels)
- Complexity-gated steps mapped per level
- Both manual override and automatic inference supported
- Complexity matrix documented as reference
- Skill and rule definitions enforce gating
- Sub-agent count, iteration limits, and review depth scale with complexity

### Requirements Delivered

| REQ | Description | Priority | Status |
|-----|-------------|----------|--------|
| CPLX-01 | Complexity level definitions | Critical | Pending |
| CPLX-02 | Always-on steps | Critical | Pending |
| CPLX-03 | Gated step mapping | Critical | Pending |
| CPLX-04 | Manual + automatic gating | High | Pending |
| CPLX-05 | Complexity matrix reference | High | Pending |
| CPLX-06 | Skill/rule enforcement | High | Pending |
| CPLX-07 | Scaling sub-agent behavior | Medium | Pending |

### Dependencies

- Phase 12 (harness provides the verification layer that complexity gates route to)

### Risks

- Automatic complexity inference may be unreliable — need good manual override UX
- Over-engineering the matrix creates more ceremony than it saves
- Gating boundaries are subjective — needs iteration with real usage

---

## Timeline (Relative)

| Phase | Scope | Sequence | Status |
|-------|-------|----------|--------|
| Phase 10 | Build Pipeline | First | Pending |
| Phase 11 | Hooks | After Phase 10 | Pending |
| Phase 12 | Verification Harness | After Phase 11 | Pending |
| Phase 13 | Complexity Gates | After Phase 12 | Pending |

**Sequential dependency chain:** Each phase builds on the previous. Phase 10 fixes the foundation, Phase 11 adds enforcement, Phase 12 adds automated verification, Phase 13 adds intelligent routing.

---

## Success Metrics

### Phase 10
- [ ] `bun run build:all` compiles all 25 agents, 38 skills, 21 rules
- [ ] `.cursor/` and `.claude/` output is fully generated, not hand-placed
- [ ] Build runs without errors

### Phase 11
- [ ] Post-edit hooks execute within 2 seconds
- [ ] Pre-commit gate catches at least: test failures, type errors, lint errors
- [ ] Hooks work in fresh `luca init` project

### Phase 12
- [ ] Full harness runs all 4 checks (test, lint, typecheck, build)
- [ ] Failure-to-fix loop resolves common errors within 3 iterations
- [ ] lu-execute-phase calls harness automatically

### Phase 13
- [ ] 5 complexity levels with clear, documented criteria
- [ ] Complexity matrix covers all workflow steps
- [ ] Manual override works for all levels

---

## History

- **v1.0.0** — Core CLI, Integrations, Enterprise Readiness ([View Archive](milestones/v1.0.0-ROADMAP.md))
- **v1.0.1** — Code Hardening: 6 phases, 433 tests, all passed ([View Archive](milestones/v1.0.1-ROADMAP.md))

---

*Roadmap created: 2026-02-10*
