# QA & Testing Gap Analysis — Backlog Audit

**Analyst:** lu-roadmap-qa
**Date:** 2026-03-08
**Scope:** 55 pending todos in `.planning/todos/pending/`
**Context Tier:** T1 (Recall-Aware)

---

## 1. Critical Finding: Test Infrastructure Is Absent

All `__tests__/` directories have been deleted. `bunfig.toml` is empty (test config intentionally removed). The pre-commit gate runs **typecheck only** (`bunx --bun tsc --noEmit`). The harness runner (`src/harness/__helpers/runner.ts`) still contains SpacetimeDB emission code (lines 276-297) that is dead code post-migration.

**Verification currently available:**

- TypeScript type checking (`bunx --bun tsc --noEmit`)
- Harness runner (can run test+typecheck+lint+build, but test step will no-op)
- Manual verification by the developer

**Verification NOT available:**

- Unit tests (all deleted)
- Integration tests (never existed separately)
- End-to-end tests (never existed)
- Regression test suite (deleted)

**Implication:** Every todo in this backlog will be implemented with zero automated regression protection. The only safety net is the TypeScript compiler.

---

## 2. Tech Debt Severity Matrix (All 55 Items)

### CRITICAL Tech Debt (5 items)

| #   | Title                             | Debt Type         | Rationale                                                                                                                                 |
| --- | --------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 37  | Test suite fragility              | **ROOT CAUSE**    | Original bug that caused all tests to be removed. Without fixing this, no other item can be safely verified.                              |
| 75  | Remove SpacetimeDB from framework | Dead code         | ~200+ lines of dead SpacetimeDB code in state/, harness runner still emits to SpacetimeDB (runner.ts:276-297). Active maintenance burden. |
| 76  | Delete luca-spacetime package     | Dead package      | Entire package is vestigial. Workspace reference overhead.                                                                                |
| 95  | Close learning loop               | Architectural gap | Learning system captures+recalls but never acts. The entire memory pipeline is 66% implemented — this is the missing third.               |
| 92  | Inject memory into sub-agents     | Architectural gap | Sub-agents operate with ~10-20% context. Fundamental pipeline deficiency.                                                                 |

### HIGH Tech Debt (11 items)

| #   | Title                             | Debt Type             | Rationale                                                                                                    |
| --- | --------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------ |
| 46  | Deduplicate sanitizeJsonParse     | DRY violation         | 3 identical copies with NOTE comments linking them. Known maintenance hazard.                                |
| 63  | Complete node:fs to Bun migration | Incomplete migration  | 19 files still use node:fs (7 in src/, 12 in packages/). Partially done migration is worse than not started. |
| 77  | Build MuninnDB emission layer     | Missing capability    | Replaces dead SpacetimeDB emitter. No observability pipeline until this exists.                              |
| 78  | Strip SpacetimeDB from observer   | Dead code             | 30+ auto-generated binding files, 17 dead hooks, dead provider.                                              |
| 88  | Cleanup SpacetimeDB docs/planning | Doc drift             | Docs reference a deleted system. Misleads every agent and developer.                                         |
| 53  | Stall detection retry limit       | Safety gap            | Unbounded retry loop in verification. Can consume infinite tokens.                                           |
| 51  | Build session lock cleanup        | DX friction           | Stale lock blocks all rebuilds permanently until --force used.                                               |
| 93  | Session memory cleanup            | Data leak             | Session engrams never cleaned up on crash/abandonment. Unbounded growth.                                     |
| 13  | Adaptive complexity self-tuning   | Over/under-resourcing | Tasks classified once, never reassessed. Under-resourced tasks fail silently.                                |
| 43  | Sequence number race condition    | Correctness bug       | In-memory sequence counter has theoretical race (low probability in single-threaded Bun).                    |
| 65  | Rename SpacetimeDB memory fields  | **OBSOLETE**          | SpacetimeDB being deleted entirely. Renaming fields in a package being deleted is wasted effort.             |

### MEDIUM Tech Debt (14 items)

| #   | Title                                   | Debt Type          |
| --- | --------------------------------------- | ------------------ |
| 45  | Bridge docs mismatch (14 vs 15 subcmds) | Doc accuracy       |
| 50  | Document observability domain           | Doc completeness   |
| 52  | Agent health check                      | Missing validation |
| 54  | Skill dependency graph                  | Missing ordering   |
| 55  | Tribunal consensus model                | Incomplete feature |
| 79  | Observer MuninnDB API layer             | New capability     |
| 89  | Complexity-gated recall depth           | Optimization       |
| 90  | Session context digest reuse            | Optimization       |
| 91  | Milestone-scoped recall                 | Optimization       |
| 94  | Deferred/lazy recall                    | Optimization       |
| 15  | Reflective meta-cognition               | Incomplete feature |
| 16  | Cross-agent interop scanner             | New capability     |
| 41  | Error boundaries in observer            | Missing resilience |
| 64  | Observer todo tracking                  | Missing feature    |

### LOW Tech Debt (18 items — mostly UI/observer polish)

| #   | Title                        | Debt Type       |
| --- | ---------------------------- | --------------- |
| 17  | Plugin marketplace           | New feature     |
| 18  | Semantic memory embeddings   | Enhancement     |
| 40  | Loading skeleton consistency | UI consistency  |
| 47  | Accessibility pass           | Accessibility   |
| 49  | Missing empty states         | UI completeness |
| 66  | Observer Lucide icons        | UI polish       |
| 67  | Observer color system        | UI polish       |
| 68  | Observer typography          | UI polish       |
| 69  | Observer dashboard layout    | UI polish       |
| 70  | Observer charting library    | UI polish       |
| 71  | Observer animations          | UI polish       |
| 72  | Observer state diagram       | UI polish       |
| 73  | Observer time range picker   | UI feature      |
| 74  | Observer command palette     | UI feature      |
| 80  | Observer session explorer    | New view        |
| 81  | Observer decision trail      | New view        |
| 82  | Observer learning evolution  | New view        |
| 83  | Observer knowledge graph     | New view        |

### NONE (7 items — new views, no existing debt)

| #   | Title                                  |
| --- | -------------------------------------- |
| 84  | Observer semantic search view          |
| 85  | Observer contradiction view            |
| 86  | Observer entity deep dive view         |
| 87  | Observer vault health view             |
| 42  | Unbounded table growth (OBSOLETE)      |
| 48  | Singleton table constraints (OBSOLETE) |
| 56  | JSON blob normalization (OBSOLETE)     |

---

## 3. Items Flagged as OBSOLETE

Seven items target SpacetimeDB internals that are being deleted:

| #   | Title                                                | Why Obsolete                     | Superseded By           |
| --- | ---------------------------------------------------- | -------------------------------- | ----------------------- |
| 42  | Unbounded table growth (TTL cleanup for SpacetimeDB) | SpacetimeDB being deleted        | #88 (cleanup docs)      |
| 43  | Sequence number race condition (SpacetimeDB ledger)  | Ledger moving to MuninnDB/local  | #77 (MuninnDB emission) |
| 48  | Singleton table constraints (SpacetimeDB schema)     | SpacetimeDB schema being deleted | #76 (delete package)    |
| 56  | JSON blob normalization (SpacetimeDB schema)         | SpacetimeDB schema being deleted | #76 (delete package)    |
| 65  | Rename SpacetimeDB memory fields                     | SpacetimeDB being deleted        | #88 (cleanup docs)      |

**Partially obsolete (scope reduced):**

| #   | Title                        | Status                                                                 |
| --- | ---------------------------- | ---------------------------------------------------------------------- |
| 41  | Error boundaries in observer | Still valid but scope changes when SpacetimeDB hooks are deleted (#78) |
| 64  | Observer todo tracking       | Still valid but SpacetimeDB option mentioned in notes is moot          |

**Recommendation:** Mark #42, #48, #56, #65 as DONE/OBSOLETE immediately. Item #43 should be re-scoped to address ledger sequence numbers in the local JSONL implementation only (remove SpacetimeDB references).

---

## 4. Items Requiring Test Reintroduction BEFORE/DURING Implementation

### Must Have Tests Before Implementation (Gate: #37)

These items modify core framework logic where type checking alone is insufficient to catch regressions:

| #   | Title                           | Why Tests Required                                                                               | Domain                |
| --- | ------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------- |
| 13  | Adaptive complexity self-tuning | Modifies complexity classification + iteration budgets. Wrong reassessment = cascading failures. | complexity, iteration |
| 53  | Stall detection retry limit     | Modifies XState state machine guards. Incorrect guard = infinite loops or premature halts.       | state machine         |
| 92  | Inject memory into sub-agents   | Modifies skill Task() prompts. Malformed injection = agent spawning failures.                    | skills, agents        |
| 95  | Close learning loop (Phase A)   | Modifies lu-planner and lu-executor behavior. Wrong pattern application = plan corruption.       | agents, skills        |
| 77  | MuninnDB emission layer         | New data pipeline. Must verify engram structure, fire-and-forget resilience, circuit breaker.    | infrastructure        |

### Should Have Tests During Implementation

These items are safer but would benefit from regression tests:

| #   | Title                             | Why Tests Help                                                           |
| --- | --------------------------------- | ------------------------------------------------------------------------ |
| 46  | Deduplicate sanitizeJsonParse     | Consolidating 3 implementations — must verify behavior parity.           |
| 63  | Complete node:fs to Bun migration | 19 file changes — need to verify no filesystem behavior changes.         |
| 52  | Agent health check                | New validation system — needs tests for missing agent, broken tool, etc. |
| 54  | Skill dependency graph            | Topological sort algorithm — classic unit test candidate.                |
| 15  | Reflective meta-cognition         | Plan confidence scoring — needs test coverage for scoring edge cases.    |

### Can Safely Proceed Without Tests (typecheck sufficient)

- All observer UI items (#40, #41, #47, #49, #64, #66-74, #78-87) — visual changes, no core logic
- Doc fixes (#45, #50, #88) — no code changes or trivial changes
- Cleanup items (#51, #75, #76) — deletion is verified by successful typecheck + build
- Memory config changes (#89, #91) — agent frontmatter/config, verified by typecheck

---

## 5. Data Integrity Risk Items (Ranked)

Items that touch state management, persistence, or cross-cutting data flows, ordered by risk:

| Rank | #   | Title                             | Risk Level   | Data Flow Affected                                                                                                   |
| ---- | --- | --------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------- |
| 1    | 77  | MuninnDB emission layer           | **CRITICAL** | New persistence pipeline for ALL observability data. Wrong engram structure = corrupted memory vault.                |
| 2    | 95  | Close learning loop               | **CRITICAL** | Modifies how recalled data drives execution. Wrong application = feedback loops that degrade code quality over time. |
| 3    | 92  | Inject memory into sub-agents     | **HIGH**     | Modifies data flow between orchestrator and sub-agents. Incorrect injection = agents receive corrupted context.      |
| 4    | 93  | Session memory cleanup            | **HIGH**     | Deletes engrams from MuninnDB. Wrong cleanup logic = permanent data loss of valuable learnings.                      |
| 5    | 75  | Remove SpacetimeDB from framework | **HIGH**     | Removes persistence code paths from state/, ledger.ts. Must preserve local JSON/JSONL fallback writes.               |
| 6    | 13  | Adaptive complexity self-tuning   | **MEDIUM**   | Modifies iteration budgets mid-execution. Wrong promotion = under/over-resourced phases.                             |
| 7    | 90  | Session context digest reuse      | **MEDIUM**   | Creates new engram type (session:digest). Must ensure digest is well-formed for downstream consumers.                |
| 8    | 53  | Stall detection retry limit       | **MEDIUM**   | Modifies state machine transitions. Wrong guard = workflow hangs or premature halts.                                 |
| 9    | 43  | Sequence number race (re-scoped)  | **LOW**      | Local ledger only. Bun is single-threaded so actual race probability is near zero.                                   |
| 10   | 46  | Deduplicate sanitizeJsonParse     | **LOW**      | JSON parsing utility. Consolidation must preserve identical behavior across 3 call sites.                            |

---

## 6. Recommended Verification Strategy Per Category

### Category A: Core Framework Logic (items #13, #15, #53, #92, #95)

- **Verification:** Full (typecheck + manual integration testing)
- **Pre-requisite:** #37 (test reintroduction) should ideally precede or accompany these
- **Strategy:** Implement in isolation, manually test each code path, verify with `bunx --bun tsc --noEmit`
- **Risk mitigation:** Small, reviewable PRs. Each item in its own branch.

### Category B: SpacetimeDB Removal (items #75, #76, #78, #88, and obsolete #42, #43, #48, #56, #65)

- **Verification:** Standard (typecheck + build)
- **Strategy:** Delete code, verify clean typecheck and build. Ordered: #75 first (framework), then #76 (package), then #78 (observer), then #88 (docs).
- **Risk mitigation:** `bunx --bun tsc --noEmit` will catch any remaining references to deleted code. `bun run build` verifies compilation.

### Category C: MuninnDB Pipeline (items #77, #79, #89, #90, #91, #93, #94)

- **Verification:** Standard to Full depending on item
- **Strategy:** #77 (emission layer) must come first — it's the foundation. Config-level items (#89, #91) are safe quick wins. #93 (cleanup) needs careful testing of forget() logic.
- **Risk mitigation:** MuninnDB operations are idempotent (remember/recall). Test with a scratch vault first.

### Category D: Observer UI (items #40, #41, #47, #49, #64, #66-74, #80-87)

- **Verification:** Quick (typecheck + visual inspection)
- **Strategy:** Batch related UI changes. No core logic affected.
- **Risk mitigation:** Visual review. These are isolated to `packages/luca-observer/`.

### Category E: DX & Documentation (items #45, #46, #50, #51, #63)

- **Verification:** Quick to Standard
- **Strategy:** Low-risk changes. #46 (sanitizeJsonParse dedup) needs behavior verification. #63 (node:fs migration) needs per-file testing.
- **Risk mitigation:** Typecheck covers import changes. Manual smoke test for filesystem operations.

### Category F: New Capabilities (items #16, #17, #18, #52, #54, #55)

- **Verification:** Standard (typecheck + manual testing)
- **Strategy:** New domains/features. Should include tests when test infrastructure is restored.
- **Risk mitigation:** New code doesn't break existing code (additive). Barrel re-exports from `index.ts` verified by typecheck.

---

## 7. CI/CD Impact Assessment

### Items That Affect Build Pipeline

| #   | Title                             | CI/CD Impact                                                                                                                 |
| --- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 37  | Test suite fragility              | **CRITICAL** — This IS the CI/CD blocker. Must fix before `bun test` can be re-enabled in pre-commit gate.                   |
| 75  | Remove SpacetimeDB from framework | **HIGH** — Removes dead SpacetimeDB emission from harness runner (runner.ts:276-297). Changes what `bun run build` includes. |
| 76  | Delete luca-spacetime package     | **HIGH** — Removes workspace package. `bun install` dependency tree changes.                                                 |
| 63  | Complete node:fs to Bun migration | **MEDIUM** — Changes import resolution behavior. Could affect build output.                                                  |
| 51  | Build session lock cleanup        | **MEDIUM** — Changes `bun run build:all` behavior (auto-cleanup of stale locks).                                             |
| 77  | MuninnDB emission layer           | **LOW** — New module, additive. No build changes.                                                                            |

### Items That Affect Harness Verification System

| #   | Title                           | Harness Impact                                                                                                   |
| --- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 37  | Test suite fragility            | Harness test check is currently no-op. Fixing this re-enables the test check.                                    |
| 53  | Stall detection retry limit     | Changes how many times harness fix loop retries. Config change in `.planning/config.json`.                       |
| 13  | Adaptive complexity self-tuning | Changes harness iteration budgets dynamically. Could increase or decrease verification thoroughness mid-session. |

### Items That Affect Pre-Commit Gate

| #   | Title                | Gate Impact                                                               |
| --- | -------------------- | ------------------------------------------------------------------------- |
| 37  | Test suite fragility | Would re-enable `bun test` in pre-commit gate (currently typecheck only). |

No other items affect the pre-commit gate since it only runs typecheck.

---

## 8. Ordering Implications From QA Perspective

### Phase 0: Foundation (must come first)

1. **#37 — Test suite fragility** — Unblocks all verification. Without this, every subsequent item ships with zero regression protection.
2. **#75 — Remove SpacetimeDB from framework** — Removes dead code that clutters review of all state/ changes.
3. **#76 — Delete luca-spacetime package** — Clean workspace.

### Phase 1: Quick wins with high verification confidence

4. **#89 — Complexity-gated recall depth** — Config change, low risk, typecheck sufficient.
5. **#91 — Milestone-scoped recall** — Single file change, low risk.
6. **#46 — Deduplicate sanitizeJsonParse** — DRY fix, behavior must be identical.
7. **#51 — Session lock cleanup** — DX improvement, low risk.
8. **#45 — Bridge docs mismatch** — Doc fix.
9. **#50 — Document observability domain** — Doc fix.
10. **#88 — Cleanup SpacetimeDB docs** — Doc cleanup.

### Phase 2: Core pipeline improvements (need careful verification)

11. **#93 — Session memory cleanup** — Data safety concern. Test forget() logic carefully.
12. **#90 — Session context digest** — New engram type. Moderate risk.
13. **#92 — Inject memory into sub-agents** — Highest impact fix. Needs integration testing.
14. **#77 — MuninnDB emission layer** — New pipeline. Needs thorough testing.
15. **#53 — Stall detection** — State machine change. Needs careful review.

### Phase 3: Ambitious items (need test infrastructure)

16. **#95 — Close learning loop** — Most transformational but highest risk.
17. **#13 — Adaptive complexity self-tuning** — Cross-cutting complexity change.
18. **#15 — Reflective meta-cognition** — Subset of #95, may merge.

### Phase 4: Observer rebuild (independent track)

19. **#78 — Strip SpacetimeDB from observer**
20. **#79 — MuninnDB API layer**
21. **#80-87 — New MuninnDB-native views** (can be parallelized)
22. **#66-74 — UI polish** (can be parallelized)

### Phase 5: Future capabilities

23. **#16, #17, #18, #52, #54, #55** — New features, lower urgency.

---

## 9. Summary

- **55 total items** analyzed
- **5 OBSOLETE** items should be closed immediately (#42, #48, #56, #65, and partially #43)
- **5 CRITICAL** tech debt items need priority attention (#37, #75, #76, #95, #92)
- **#37 (test suite fragility) is the single most important item** — it is the root cause of the zero-test-coverage situation and blocks reliable verification of all other work
- **19 files still use node:fs** (more than the 7 documented in #63) — the migration gap is larger than recorded
- **Harness runner contains dead SpacetimeDB code** (runner.ts:276-297) that should be removed with #75
- **No item in the backlog can be verified with automated tests** until #37 is resolved
- **Data integrity risk is concentrated** in 5 items (#77, #95, #92, #93, #75) that all touch persistence/memory pipelines
- **Observer UI items (18 total)** are low-risk and can proceed with visual verification only
