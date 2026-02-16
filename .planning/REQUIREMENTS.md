# Requirements: Luca Framework v1.6.0

**Defined:** 2026-02-16
**Core Value:** Make Luca's core components publishable, complete memory resilience, and support multi-stack conventions.

## v1.6.0 Requirements

Requirements for v1.6.0 — Package & Publish milestone. Each maps to roadmap phases.

### XState Workflow State Package

- [ ] **PKG-01**: Package structure with separate `packages/luca-state/` directory, own `package.json`, `tsconfig.json`
- [ ] **PKG-02**: Core machine definition extracted from `src/state-machine/` with zero framework dependencies
- [ ] **PKG-03**: Callable CLI entry point (`luca-state transition`, `luca-state read-status`, etc.)
- [ ] **PKG-04**: State persistence (serialize/deserialize to disk) as standalone feature
- [ ] **PKG-05**: Transition guards extracted with configurable complexity/oversight/gate rules
- [ ] **PKG-06**: TypeScript types and Zod schemas exported for consumer type safety
- [ ] **PKG-07**: Comprehensive test suite (unit + integration) for standalone package
- [ ] **PKG-08**: Internal framework updated to consume from `packages/luca-state/` instead of `src/state-machine/`

### Memory Improvements

- [ ] **MEM-01**: Suspend/resume with persistent state — step-level checkpoints within phases
- [ ] **MEM-02**: Auto-persist WORKING.md on context HIGH warning
- [ ] **MEM-03**: Explicit suspend semantics in phase-execute (mark phase `suspended` with resume metadata)
- [ ] **MEM-04**: Milestone-scoped memory recall — weight current milestone entries higher during recall
- [ ] **MEM-05**: Milestone tags on MEMORY.md entries for temporal relevance scoring

### Tech Stack Profiles

- [ ] **STACK-01**: Tech stack profile structure (typescript, python, go, rust directories)
- [ ] **STACK-02**: Migrate existing TS-specific rules under `typescript` profile
- [ ] **STACK-03**: Config toggle (`workflow.opinionated_guidelines: true/false`)
- [ ] **STACK-04**: Integration with `lu-map-codebase` stack detection for auto-selection
- [ ] **STACK-05**: Build system conditionally includes/excludes guidelines per selected profile

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Advanced Memory

- **AMEM-01**: Model-aware task routing (complexity-to-model mapping per agent)
- **AMEM-02**: Procedure evolution via reinforcement learning patterns

### Multi-Stack Expansion

- **MSTACK-01**: Python tech stack profile with PEP 8, typing conventions
- **MSTACK-02**: Go tech stack profile with Go idioms, error handling patterns
- **MSTACK-03**: Rust tech stack profile
- **MSTACK-04**: Mixed-stack project support (multiple profiles active simultaneously)

## Out of Scope

| Feature                                 | Reason                                                          |
| --------------------------------------- | --------------------------------------------------------------- |
| npm registry publishing                 | Package extraction only; actual npm publish is manual/CI step   |
| Database-backed memory storage          | File-based approach is correct for dev workflow context         |
| Vector/semantic search for memory       | Overkill for Luca's use case; tag-based recall is sufficient    |
| MCP server for persistent state machine | Performance optimization deferred; CLI approach proven adequate |
| Class-based architecture for packages   | Functional patterns only per project conventions                |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase    | Status  |
| ----------- | -------- | ------- |
| PKG-01      | Phase 40 | Pending |
| PKG-02      | Phase 40 | Pending |
| PKG-03      | Phase 40 | Pending |
| PKG-04      | Phase 40 | Pending |
| PKG-05      | Phase 40 | Pending |
| PKG-06      | Phase 40 | Pending |
| PKG-07      | Phase 40 | Pending |
| PKG-08      | Phase 41 | Pending |
| MEM-01      | Phase 42 | Pending |
| MEM-02      | Phase 42 | Pending |
| MEM-03      | Phase 42 | Pending |
| MEM-04      | Phase 42 | Pending |
| MEM-05      | Phase 42 | Pending |
| STACK-01    | Phase 43 | Pending |
| STACK-02    | Phase 43 | Pending |
| STACK-03    | Phase 43 | Pending |
| STACK-04    | Phase 43 | Pending |
| STACK-05    | Phase 43 | Pending |

**Coverage:**

- v1.6.0 requirements: 18 total
- Mapped to phases: 18
- Unmapped: 0

---

_Requirements defined: 2026-02-16_
_Last updated: 2026-02-16 after initial definition_
