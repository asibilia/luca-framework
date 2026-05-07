# Requirements — v1.5.0: Cognitive Architecture & State Machine

## Phase 34: XState Core Machine

| ID        | Requirement                                                                                                                                         | Phase | Status |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------ |
| XSTATE-01 | XState v5 state machine modeling full workflow lifecycle (idle → preflight → route → discuss → plan → execute → verify → learn → commit → complete) | 34    | [x]    |
| XSTATE-02 | Callable CLI functions for state transitions (`bun run state send --event=PHASE_COMPLETE`)                                                          | 34    | [x]    |
| XSTATE-03 | State persistence — serialize/deserialize machine state to/from disk for session resume                                                             | 34    | [x]    |
| XSTATE-04 | Transition guards encoding complexity gating, oversight levels, and gate config                                                                     | 34    | [x]    |
| XSTATE-05 | Event-driven architecture — workflow transitions emit events for hooks/skills                                                                       | 34    | [x]    |
| XSTATE-06 | Child actor model — phases as child actors, milestone as parent                                                                                     | 34    | [x]    |

## Phase 35: State Machine Integration

| ID       | Requirement                                                                  | Phase | Status |
| -------- | ---------------------------------------------------------------------------- | ----- | ------ |
| INTEG-01 | STATE.md reads replaced by state machine queries (`bun run state get`)       | 35    | [x]    |
| INTEG-02 | STATE.md writes replaced by state machine transitions (`bun run state send`) | 35    | [x]    |
| INTEG-03 | Autopilot skill uses state machine for phase loop and oversight gates        | 35    | [x]    |
| INTEG-04 | phase-execute skill uses state machine for wave/task tracking                | 35    | [x]    |
| INTEG-05 | Existing hooks (session-start, session-persist) integrate with state machine | 35    | [x]    |
| INTEG-06 | Backward compatibility — STATE.md still generated as human-readable snapshot | 35    | [x]    |

## Phase 36: Memory Compression & Monitoring

| ID     | Requirement                                                                       | Phase | Status |
| ------ | --------------------------------------------------------------------------------- | ----- | ------ |
| MEM-01 | Token-aware MEMORY.md compression via lu-learner reflection pass                  | 36    | [x]    |
| MEM-02 | Auto-summarize WORKING.md sections when size exceeds threshold mid-session        | 36    | [x]    |
| MEM-03 | Structured WORKING.md schemas (Zod-validated sections with merge semantics)       | 36    | [x]    |
| MEM-04 | Async context monitoring during execution (PostToolUse throttled, not just Stop)  | 36    | [x]    |
| MEM-05 | Phase quality scoring — composite score (tests, types, lint, verifier confidence) | 36    | [x]    |
| MEM-06 | Quality trend tracking in STATE.md/MEMORY.md for cross-phase regression detection | 36    | [x]    |

## Phase 37: Procedural Memory Layer

| ID      | Requirement                                                                          | Phase | Status |
| ------- | ------------------------------------------------------------------------------------ | ----- | ------ |
| PROC-01 | Procedural memory format — executable learned procedures as mini-skill templates     | 37    | [x]    |
| PROC-02 | PROCEDURES.md file (or MEMORY.md `## Procedures` section) for storage                | 37    | [x]    |
| PROC-03 | lu-learner extracts step sequences from successful verifications                     | 37    | [x]    |
| PROC-04 | Procedure recall during planning — relevant procedures offered as starting templates | 37    | [x]    |
| PROC-05 | Procedure validation — success rate tracking, retirement of stale procedures         | 37    | [x]    |

## Phase 38: Full Skill Migration to State Machine Bridge

| ID        | Requirement                                                                                          | Phase | Status |
| --------- | ---------------------------------------------------------------------------------------------------- | ----- | ------ |
| BRIDGE-01 | High-priority skills (state-writing) migrated to bridge transitions                                  | 38    | [x]    |
| BRIDGE-02 | Medium-priority skills (state-reading for gating) migrated to bridge queries                         | 38    | [x]    |
| BRIDGE-03 | Low-priority skills (display/utility) migrated to bridge queries                                     | 38    | [x]    |
| BRIDGE-04 | Snapshot command adopted for STATE.md regeneration (replacing manual heredoc/sed rewrites)           | 38    | [x]    |
| BRIDGE-05 | All skills maintain STATE.md fallback for backward compatibility until bridge is fully battle-tested | 38    | [x]    |

## Phase 39: Code Quality Cleanup

| ID       | Requirement                                                               | Phase | Status |
| -------- | ------------------------------------------------------------------------- | ----- | ------ |
| CLEAN-01 | Extract `getArg`, `hasFlag`, `escapeRegex` into `src/shared/cli-utils.ts` | 39    | [x]    |
| CLEAN-02 | All bridge/CLI modules import from shared instead of local definitions    | 39    | [x]    |
| CLEAN-03 | `calculatePhaseQuality()` input validated via Zod schema                  | 39    | [x]    |
| CLEAN-04 | `recallProcedures()` context validated via Zod schema                     | 39    | [x]    |
| CLEAN-05 | `evaluateRetirement()` options validated via Zod schema                   | 39    | [x]    |
| CLEAN-06 | Internal `.parse()` calls documented with intent comments                 | 39    | [x]    |
| CLEAN-07 | Shared CLI utils have comprehensive unit tests                            | 39    | [x]    |

---

## Summary

| Phase     | Requirement Count | Complexity | Effort |
| --------- | ----------------- | ---------- | ------ |
| 34        | 6                 | COMPLEX    | 8      |
| 35        | 6                 | COMPLEX    | 5      |
| 36        | 6                 | MODERATE   | 5      |
| 37        | 5                 | MODERATE   | 3      |
| 38        | 5                 | MODERATE   | 5      |
| 39        | 7                 | SIMPLE     | 1      |
| **Total** | **35**            |            | **27** |

---

_Requirements updated: 2026-02-15 (Phase 39 cleanup — all 7 requirements complete)_
