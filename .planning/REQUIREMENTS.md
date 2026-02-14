# Requirements — v1.5.0: Cognitive Architecture & State Machine

## Phase 34: XState Core Machine

| ID        | Requirement                                                                                                                                         | Phase | Status |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------ |
| XSTATE-01 | XState v5 state machine modeling full workflow lifecycle (idle → preflight → route → discuss → plan → execute → verify → learn → commit → complete) | 34    | [ ]    |
| XSTATE-02 | Callable CLI functions for state transitions (`bun run state send --event=PHASE_COMPLETE`)                                                          | 34    | [ ]    |
| XSTATE-03 | State persistence — serialize/deserialize machine state to/from disk for session resume                                                             | 34    | [ ]    |
| XSTATE-04 | Transition guards encoding complexity gating, oversight levels, and gate config                                                                     | 34    | [ ]    |
| XSTATE-05 | Event-driven architecture — workflow transitions emit events for hooks/skills                                                                       | 34    | [ ]    |
| XSTATE-06 | Child actor model — phases as child actors, milestone as parent                                                                                     | 34    | [ ]    |

## Phase 35: State Machine Integration

| ID       | Requirement                                                                  | Phase | Status |
| -------- | ---------------------------------------------------------------------------- | ----- | ------ |
| INTEG-01 | STATE.md reads replaced by state machine queries (`bun run state get`)       | 35    | [ ]    |
| INTEG-02 | STATE.md writes replaced by state machine transitions (`bun run state send`) | 35    | [ ]    |
| INTEG-03 | Autopilot skill uses state machine for phase loop and oversight gates        | 35    | [ ]    |
| INTEG-04 | phase-execute skill uses state machine for wave/task tracking                | 35    | [ ]    |
| INTEG-05 | Existing hooks (session-start, session-persist) integrate with state machine | 35    | [ ]    |
| INTEG-06 | Backward compatibility — STATE.md still generated as human-readable snapshot | 35    | [ ]    |

## Phase 36: Memory Compression & Monitoring

| ID     | Requirement                                                                       | Phase | Status |
| ------ | --------------------------------------------------------------------------------- | ----- | ------ |
| MEM-01 | Token-aware MEMORY.md compression via lu-learner reflection pass                  | 36    | [ ]    |
| MEM-02 | Auto-summarize WORKING.md sections when size exceeds threshold mid-session        | 36    | [ ]    |
| MEM-03 | Structured WORKING.md schemas (Zod-validated sections with merge semantics)       | 36    | [ ]    |
| MEM-04 | Async context monitoring during execution (PostToolUse throttled, not just Stop)  | 36    | [ ]    |
| MEM-05 | Phase quality scoring — composite score (tests, types, lint, verifier confidence) | 36    | [ ]    |
| MEM-06 | Quality trend tracking in STATE.md/MEMORY.md for cross-phase regression detection | 36    | [ ]    |

## Phase 37: Procedural Memory Layer

| ID      | Requirement                                                                          | Phase | Status |
| ------- | ------------------------------------------------------------------------------------ | ----- | ------ |
| PROC-01 | Procedural memory format — executable learned procedures as mini-skill templates     | 37    | [ ]    |
| PROC-02 | PROCEDURES.md file (or MEMORY.md `## Procedures` section) for storage                | 37    | [ ]    |
| PROC-03 | lu-learner extracts step sequences from successful verifications                     | 37    | [ ]    |
| PROC-04 | Procedure recall during planning — relevant procedures offered as starting templates | 37    | [ ]    |
| PROC-05 | Procedure validation — success rate tracking, retirement of stale procedures         | 37    | [ ]    |

---

## Summary

| Phase     | Requirement Count | Complexity | Effort |
| --------- | ----------------- | ---------- | ------ |
| 34        | 6                 | COMPLEX    | 8      |
| 35        | 6                 | COMPLEX    | 5      |
| 36        | 6                 | MODERATE   | 5      |
| 37        | 5                 | MODERATE   | 3      |
| **Total** | **23**            |            | **21** |

---

_Requirements created: 2026-02-14 (v1.5.0 milestone)_
