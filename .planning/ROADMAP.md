# Roadmap

## Overview

**Current Milestone:** v1.1.0 — Workflow Foundation

Establish the enforcement and verification foundation that all future workflow improvements build on. The build pipeline compiles everything from source, hooks provide deterministic quality gates, an automated harness replaces manual verification, and complexity gates scale workflow with task scope.

**Goal:** Make quality enforcement automatic and unavoidable — advisory instructions become deterministic gates.

---

## Phase 10: Build Pipeline

**Goal:** Create agent and rule registries so the build compiles all entities from `src/` to both `.cursor/` and `.claude/`. Close the dogfooding gap where this repo is a first-party consumer of its own framework output.

**Status:** Complete

**Success Criteria:**

- [x] `agentRegistry` in `src/agents/index.ts` exports all 23 general agents (luca-specific agents handled separately by build scripts)
- [x] `ruleRegistry` in `src/rules/index.ts` exports all 20 general rules (luca-specific rules handled separately by build scripts)
- [x] Build scripts iterate all three registries (agents, skills, rules)
- [x] `bun run build:cursor` produces all agents, skills, and rules in `.cursor/`
- [x] `bun run build:claude` produces all agents, skills, and rules in `.claude/`
- [x] No stale output files — generated output matches source definitions

### Requirements Delivered

| REQ | Description | Priority | Status |
|-----|-------------|----------|--------|
| BUILD-01 | Agent registry | Critical | **Complete** |
| BUILD-02 | Rule registry | Critical | **Complete** |
| BUILD-03 | Registry-based build scripts | Critical | **Complete** |
| BUILD-04 | Full Cursor output | Critical | **Complete** |
| BUILD-05 | Full Claude output | Critical | **Complete** |
| BUILD-06 | No stale output files | High | **Complete** |

### Verification

- Verification report: `.planning/phases/10-build-pipeline/10-VERIFICATION.md`
- Score: 6/6 must-haves verified
- 29 new tests (all passing)
- Commits: `a16ed5a`, `09e1cf7`, `a3bf90e`, `8eac628`, `8dc9b30`, `4cf506a`

---

## Phase 11: Hooks

**Goal:** Implement deterministic quality gates using Claude Code hooks. Replace advisory enforcement (agents remembering to check) with automatic enforcement (hooks that always run).

**Status:** Complete

**Success Criteria:**

- [x] Hook infrastructure exists and is distributable
- [x] Post-edit hooks auto-format and type-check changed files
- [x] Pre-commit hook blocks commits with failing tests or lint errors
- [x] Context usage monitoring warns at configurable thresholds
- [x] WORKING.md persistence on session end
- [x] Hook/skill boundary clearly documented
- [x] Hooks included in `luca init` templates for downstream projects

### Requirements Delivered

| REQ | Description | Priority | Status |
|-----|-------------|----------|--------|
| HOOK-01 | Hook directory structure | Critical | **Complete** |
| HOOK-02 | Post-edit formatting | High | **Complete** |
| HOOK-03 | Post-edit type-checking | High | **Complete** |
| HOOK-04 | Pre-commit quality gate | Critical | **Complete** |
| HOOK-05 | Context usage monitor | Medium | **Complete** |
| HOOK-06 | WORKING.md persistence | Medium | **Complete** |
| HOOK-07 | Hook/skill boundary docs | High | **Complete** |
| HOOK-08 | Distributable via luca init | High | **Complete** |

### Verification

- Verification report: `.planning/phases/11-hooks/11-VERIFICATION.md`
- Score: 8/8 requirements verified
- hookRegistry: 5 entries, ruleRegistry: 21 entries (+1 hook-skill-boundary)
- Build output: 5 executable hook scripts, 4 event types in settings.json
- Template distribution: 5 scripts + settings-hooks.json + config.json hooks section
- Commits: `10d0e6b`, `c421f95`, `447e763`

### Dependencies

- Phase 10 (build pipeline must work so hooks can be part of compiled output)

### Notes

- Context monitor uses transcript file size as proxy (Claude Code doesn't expose context % directly)
- Session persistence is SessionEnd best-effort; Stop agent hook deferred as future enhancement
- Config template hooks section is declarative — configuration wiring is a future enhancement

---

## Phase 12: Verification Harness

**Goal:** Build an automated verification pipeline that runs tests, lint, typecheck, and build as the primary quality signal. Integrate into `lu-execute-phase` so verification is automatic, not manual.

**Status:** Complete

**Success Criteria:**

- [x] Single orchestrated verification command runs all checks
- [x] Harness runs automatically after wave execution, before agent-based verification
- [x] Project-specific harness configuration in `.planning/config.json`
- [x] Failure-to-fix loop: parse errors, feed to executor, re-run, max iterations
- [x] Harness output provides structured data for lu-verifier
- [x] Lightweight checks via hooks; full harness at phase boundaries

### Requirements Delivered

| REQ | Description | Priority | Status |
|-----|-------------|----------|--------|
| VERI-01 | Single harness command | Critical | **Complete** |
| VERI-02 | Integration into lu-execute-phase | Critical | **Complete** |
| VERI-03 | Project-specific configuration | High | **Complete** |
| VERI-04 | Failure-to-fix pipeline | High | **Complete** |
| VERI-05 | Structured output for lu-verifier | Medium | **Complete** |
| VERI-06 | Lightweight hooks + full harness split | High | **Complete** |

### Verification

- Verification report: `.planning/phases/12-verification-harness/VERIFICATION.md`
- Score: 6/6 requirements verified
- 65 new tests (all passing), full suite: 551 pass, 6 fail (pre-existing)
- 4 parsers (tsc, bun-test, eslint, generic), runner with CLI, 22 rules (+1 harness-verification)
- Build output: 180 files

### Dependencies

- Phase 11 (hooks provide the lightweight check layer that complements the harness)

---

## Phase 13: Complexity Gates

**Goal:** Design and implement a structured system where workflow complexity scales with task scope. Core steps always run; additional steps activate based on complexity level.

**Status:** Complete

**Success Criteria:**

- [x] Clear complexity levels defined with measurable criteria
- [x] Always-on steps identified (verification runs for all levels)
- [x] Complexity-gated steps mapped per level
- [x] Both manual override and automatic inference supported
- [x] Complexity matrix documented as reference
- [x] Skill and rule definitions enforce gating
- [x] Sub-agent count, iteration limits, and review depth scale with complexity

### Requirements Delivered

| REQ | Description | Priority | Status |
|-----|-------------|----------|--------|
| CPLX-01 | Complexity level definitions | Critical | **Complete** |
| CPLX-02 | Always-on steps | Critical | **Complete** |
| CPLX-03 | Gated step mapping | Critical | **Complete** |
| CPLX-04 | Manual + automatic gating | High | **Complete** |
| CPLX-05 | Complexity matrix reference | High | **Complete** |
| CPLX-06 | Skill/rule enforcement | High | **Complete** |
| CPLX-07 | Scaling sub-agent behavior | Medium | **Complete** |

### Verification

- Verification report: `.planning/phases/13-complexity-gates/VERIFICATION.md`
- Score: 7/7 requirements verified
- 29 new tests (all passing), full suite: 579 pass, 7 fail (pre-existing)
- Complexity module: types, defaults, index; 21 rules (+1 complexity-gating)
- Build output: 178 files

### Dependencies

- Phase 12 (harness provides the verification layer that complexity gates route to)

---

## Timeline (Relative)

| Phase | Scope | Sequence | Status |
|-------|-------|----------|--------|
| Phase 10 | Build Pipeline | First | **Complete** |
| Phase 11 | Hooks | After Phase 10 | **Complete** |
| Phase 12 | Verification Harness | After Phase 11 | **Complete** |
| Phase 13 | Complexity Gates | After Phase 12 | **Complete** |

**Sequential dependency chain:** Each phase builds on the previous. Phase 10 fixes the foundation, Phase 11 adds enforcement, Phase 12 adds automated verification, Phase 13 adds intelligent routing.

---

## Success Metrics

### Phase 10
- [x] `bun run build:all` compiles all 25 agents, 37 skills, 20 rules (per output directory)
- [x] `.cursor/` and `.claude/` output is fully generated, not hand-placed
- [x] Build runs without errors

### Phase 11
- [x] Post-edit hooks execute within 2 seconds
- [x] Pre-commit gate catches at least: test failures, type errors, lint errors
- [x] Hooks work in fresh `luca init` project

### Phase 12
- [x] Full harness runs all 4 checks (test, lint, typecheck, build)
- [x] Failure-to-fix loop resolves common errors within 3 iterations
- [x] lu-execute-phase calls harness automatically

### Phase 13
- [x] 5 complexity levels with clear, documented criteria
- [x] Complexity matrix covers all workflow steps
- [x] Manual override works for all levels

---

## History

- **v1.0.0** — Core CLI, Integrations, Enterprise Readiness ([View Archive](milestones/v1.0.0-ROADMAP.md))
- **v1.0.1** — Code Hardening: 6 phases, 433 tests, all passed ([View Archive](milestones/v1.0.1-ROADMAP.md))

---

*Roadmap created: 2026-02-10*
