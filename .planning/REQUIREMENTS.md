# Requirements — v1.1.0 Workflow Foundation

## Overview

Establish the enforcement and verification foundation for all future workflow improvements. Fix the build pipeline to compile everything from source, add deterministic hooks, automate verification, and gate workflow complexity.

**Core Value:** Zero-friction adoption of structured AI workflows
**Motivation:** v1.0.1 hardened the code; v1.1.0 hardens the workflow. All quality enforcement is currently advisory — this milestone makes it automatic and unavoidable.

---

## v1.1.0 Requirements

### Build Pipeline

- [x] **BUILD-01**: Agent registry exports all general agents from `src/agents/general/` (luca-specific agents handled separately by build scripts, matching `skillRegistry` pattern)
- [x] **BUILD-02**: Rule registry exports all general rules from `src/rules/general/` (luca-specific rules handled separately by build scripts, matching `skillRegistry` pattern)
- [x] **BUILD-03**: Build scripts iterate over agent, skill, and rule registries (no hardcoded entities)
- [x] **BUILD-04**: `bun run build:cursor` generates all agents, skills, and rules in `.cursor/`
- [x] **BUILD-05**: `bun run build:claude` generates all agents, skills, and rules in `.claude/`
- [x] **BUILD-06**: Build output matches source — no stale files in `.cursor/` or `.claude/`

### Hooks

- [x] **HOOK-01**: Hook directory structure exists (`.claude/hooks/` and/or project config)
- [x] **HOOK-02**: Post-edit hook auto-runs formatter after file writes
- [x] **HOOK-03**: Post-edit hook runs type-checker on TypeScript file changes
- [x] **HOOK-04**: Pre-commit hook blocks commits when tests fail or lint errors exist
- [x] **HOOK-05**: Context usage monitor warns at threshold levels (configurable)
- [x] **HOOK-06**: Session persistence hook saves WORKING.md on session end
- [x] **HOOK-07**: Hook/skill boundary is clearly defined and documented
- [x] **HOOK-08**: Hooks are distributable via `luca init` templates

### Verification Harness

- [x] **VERI-01**: Single harness command runs all checks: test, lint, typecheck, build
- [x] **VERI-02**: Harness integrates into `lu-execute-phase` after wave execution, before agent verification
- [x] **VERI-03**: Harness configuration is project-specific via `.planning/config.json`
- [x] **VERI-04**: Failure-to-fix pipeline: parse errors, feed to executor, re-run, loop until pass or max iterations
- [x] **VERI-05**: Harness output provides structured data for lu-verifier analysis
- [x] **VERI-06**: Lightweight checks (typecheck on changed files) run via hooks; full harness at phase boundaries

### Complexity Gates

- [ ] **CPLX-01**: Complexity levels defined with clear criteria (trivial, simple, moderate, complex, critical)
- [ ] **CPLX-02**: Always-on workflow steps identified (verification runs for all levels)
- [ ] **CPLX-03**: Complexity-gated steps mapped: which activate at which level
- [ ] **CPLX-04**: Gating mechanism supports manual override and automatic inference
- [ ] **CPLX-05**: Complexity matrix documented: level -> required steps -> optional steps -> skipped steps
- [ ] **CPLX-06**: Skill and rule definitions updated to enforce gating
- [ ] **CPLX-07**: Complexity level influences sub-agent count, iteration limits, and review depth

## Out of Scope

| Feature | Reason |
|---------|--------|
| New stack templates (Python, Node.js, Next.js) | Deferred to v1.2.0 — workflow foundation must be solid first |
| Agent marketplace / sharing registry | Requires distribution infrastructure beyond current scope |
| CI/CD pipeline implementation | Document expectations, don't implement pipeline |
| Cross-IDE support (VS Code) | Cursor-first, expand later |
| Ralph Wiggum iterative loops | Depends on harness completion — Phase B/D todo |
| Writer/reviewer separation | Depends on complexity gates — Phase B todo |
| Procedural memory layer | Depends on complexity gates — Phase C todo |

## Traceability

| Requirement | Phase | Priority | Status |
|-------------|-------|----------|--------|
| BUILD-01 | Phase 10 (Build Pipeline) | Critical | **Complete** |
| BUILD-02 | Phase 10 (Build Pipeline) | Critical | **Complete** |
| BUILD-03 | Phase 10 (Build Pipeline) | Critical | **Complete** |
| BUILD-04 | Phase 10 (Build Pipeline) | Critical | **Complete** |
| BUILD-05 | Phase 10 (Build Pipeline) | Critical | **Complete** |
| BUILD-06 | Phase 10 (Build Pipeline) | High | **Complete** |
| HOOK-01 | Phase 11 (Hooks) | Critical | **Complete** |
| HOOK-02 | Phase 11 (Hooks) | High | **Complete** |
| HOOK-03 | Phase 11 (Hooks) | High | **Complete** |
| HOOK-04 | Phase 11 (Hooks) | Critical | **Complete** |
| HOOK-05 | Phase 11 (Hooks) | Medium | **Complete** |
| HOOK-06 | Phase 11 (Hooks) | Medium | **Complete** |
| HOOK-07 | Phase 11 (Hooks) | High | **Complete** |
| HOOK-08 | Phase 11 (Hooks) | High | **Complete** |
| VERI-01 | Phase 12 (Verification Harness) | Critical | **Complete** |
| VERI-02 | Phase 12 (Verification Harness) | Critical | **Complete** |
| VERI-03 | Phase 12 (Verification Harness) | High | **Complete** |
| VERI-04 | Phase 12 (Verification Harness) | High | **Complete** |
| VERI-05 | Phase 12 (Verification Harness) | Medium | **Complete** |
| VERI-06 | Phase 12 (Verification Harness) | High | **Complete** |
| CPLX-01 | Phase 13 (Complexity Gates) | Critical | Pending |
| CPLX-02 | Phase 13 (Complexity Gates) | Critical | Pending |
| CPLX-03 | Phase 13 (Complexity Gates) | Critical | Pending |
| CPLX-04 | Phase 13 (Complexity Gates) | High | Pending |
| CPLX-05 | Phase 13 (Complexity Gates) | High | Pending |
| CPLX-06 | Phase 13 (Complexity Gates) | High | Pending |
| CPLX-07 | Phase 13 (Complexity Gates) | Medium | Pending |

**Coverage:**
- v1.1.0 requirements: 27 total
- Mapped to phases: 27
- Unmapped: 0

---

*Requirements created: 2026-02-10*
*Continues from v1.0.1 (REQ-101 through REQ-106, all complete)*
