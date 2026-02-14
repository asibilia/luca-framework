# Requirements — v1.4.0: Developer Experience & Verification

## Phase 30: Dogfood Build Stability

| ID         | Requirement                                                          | Phase | Status |
| ---------- | -------------------------------------------------------------------- | ----- | ------ |
| DOGFOOD-01 | Plugin output consumed as workspace self-reference                   | 30    | [x]    |
| DOGFOOD-02 | Explicit rebuild script gates recompilation                          | 30    | [x]    |
| DOGFOOD-03 | No file watchers trigger plugin recompilation during active sessions | 30    | [x]    |
| DOGFOOD-04 | Session-start snapshot of compiled artifacts to stable location      | 30    | [x]    |

## Phase 31: TDD-First Verification Pattern

| ID     | Requirement                                                                                                 | Phase | Status |
| ------ | ----------------------------------------------------------------------------------------------------------- | ----- | ------ |
| TDD-01 | lu-test-writer agent generates tests from plan verification criteria                                        | 31    | [ ]    |
| TDD-02 | Red phase confirmation — tests fail before implementation begins                                            | 31    | [ ]    |
| TDD-03 | Green phase confirmation — tests pass after implementation                                                  | 31    | [ ]    |
| TDD-04 | lu-executor integrates TDD cycle (read plan -> generate tests -> confirm red -> implement -> confirm green) | 31    | [ ]    |
| TDD-05 | lu-verifier uses test pass/fail as primary T1 signal, goal-backward as secondary T3                         | 31    | [ ]    |
| TDD-06 | Fallback for non-testable work (docs, config) defined and documented                                        | 31    | [ ]    |

## Phase 32: Auto-Discuss Web Research Agent

| ID      | Requirement                                                         | Phase | Status |
| ------- | ------------------------------------------------------------------- | ----- | ------ |
| AUTO-01 | `--auto` flag on phase-discuss skill                                | 32    | [ ]    |
| AUTO-02 | Auto-selects all gray areas (skips manual prompt)                   | 32    | [ ]    |
| AUTO-03 | Per-question web research agent uses WebSearch/WebFetch             | 32    | [ ]    |
| AUTO-04 | Research scoped to project tech stack (from BRAIN.md)               | 32    | [ ]    |
| AUTO-05 | Summary with citations presented before CONTEXT.md write            | 32    | [ ]    |
| AUTO-06 | User override — review and change any auto-answer before finalizing | 32    | [ ]    |

## Phase 33: Workflow Documentation (Mermaid Mind Maps)

| ID      | Requirement                                                              | Phase | Status |
| ------- | ------------------------------------------------------------------------ | ----- | ------ |
| DOCS-01 | Full workflow mind map (overview level)                                  | 33    | [ ]    |
| DOCS-02 | Agent orchestration diagram (spawning, context flow, result aggregation) | 33    | [ ]    |
| DOCS-03 | Cognition flow diagram (BRAIN/MEMORY/WORKING data flow)                  | 33    | [ ]    |
| DOCS-04 | Complexity gate diagram (always-on vs gated steps)                       | 33    | [ ]    |
| DOCS-05 | Diagrams placed in docs/ and render on GitHub                            | 33    | [ ]    |

---

## Summary

| Phase     | Requirement Count | Complexity | Effort |
| --------- | ----------------- | ---------- | ------ |
| 30        | 4                 | MODERATE   | 3      |
| 31        | 6                 | COMPLEX    | 5      |
| 32        | 6                 | MODERATE   | 3      |
| 33        | 5                 | SIMPLE     | 2      |
| **Total** | **21**            |            | **13** |

---

_Requirements created: 2026-02-14 (v1.4.0 milestone)_
