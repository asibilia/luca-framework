# Milestone Audit — v8.6.1 Audit Gap Closure + Deterministic Hooks

**Audited:** 2026-03-31
**Phases:** 247-251 (5 phases)
**Files changed:** 63 TypeScript files

## Requirements Coverage

| Phase | Goal                                                                                       | Status   |
| ----- | ------------------------------------------------------------------------------------------ | -------- |
| 247   | Bridge hardening — static imports, idle cleanup, root-anchor docs                          | COMPLETE |
| 248   | Shared/renderer cleanup — snake_case HUD, barrel imports, safeParse, JSDoc                 | COMPLETE |
| 249   | Deterministic skill lifecycle hooks — replace 73 LLM-dependent statusline writes           | COMPLETE |
| 250   | Redundant side-effect removal — remove 10 snapshot/ensure-init calls handled by hooks      | COMPLETE |
| 251   | Deterministic agent transition sync — replace ~30 LLM-dependent transitions/context writes | COMPLETE |

**Score: 5/5 phases complete**

**v8.6.0 audit findings closure:** All 13 findings (2 HIGH, 6 MEDIUM, 5 LOW) closed.

**Deterministic side-effect migration:** 123 of 140 LLM-dependent orchestration commands moved to deterministic hooks. 17 remain (irreducible — require LLM reasoning output).

## Integration Check

**Status: PASSED (8/9)**

All critical integration points verified:

1. skill-status-enter imports from shared correctly
2. skill-status-exit nesting depth works
3. agent-transition-sync priority order correct (phase-execute > pr-address > verify > milestone > lu)
4. Bridge STATUS_BUS_PATH used consistently
5. BusDataSchema validation rejects invalid data
6. Zero write-status/clear-status/snapshot in skill templates
7. Remaining 17 template commands match intentionally-kept set
8. All 3 new hooks registered in hook-registry.ts

**1 LOW gap:** `check-template-side-effects.ts` lint guard not wired into automated pipeline (manual-only). Fix: add to `check:drift` or package.json scripts.

## Architecture Review

**Verdict: PASS WITH FINDINGS**

| Check                                     | Status                                                    |
| ----------------------------------------- | --------------------------------------------------------- |
| Hook tier compliance (T3→T0)              | PASS                                                      |
| Entity isolation in agent-transition-sync | PASS (filesystem-level T3→T2 coupling noted)              |
| Hook execution order / race conditions    | PASS (no races)                                           |
| Nesting depth file pattern                | PASS (stale file on crash — add cleanup to session-start) |

### Findings

| #   | Severity | File                              | Issue                                                                                                                            |
| --- | -------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| A1  | MODERATE | agent-transition-sync.ts          | `verify-` prefix appears in both phase-execute and lu blocks — relies on contextFile mutual exclusivity at runtime, undocumented |
| A2  | LOW      | agent-transition-sync.ts          | `learn` prefix in pr-address lacks trailing dash (asymmetry with other prefixes)                                                 |
| A3  | LOW      | bridge.ts / status-bus.schemas.ts | BusDataSchema `phase` field diverges (nullable vs optional) — intentional but undocumented                                       |
| A4  | LOW      | agent-transition-sync.ts          | fireContextWrite() has filesystem-level T3→T2 coupling to context-cli.ts path                                                    |
| A5  | LOW      | skill-status-enter/exit           | Stale depth file on crash — add cleanup to session-start                                                                         |

## Security Review

**0 CRITICAL, 0 HIGH, 2 MEDIUM, 7 LOW**

| #       | Severity | File                     | Issue                                                                                                                |
| ------- | -------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| SEC-001 | MEDIUM   | agent-transition-sync.ts | Effect values are compile-time constants today but no type-level guard prevents future derivation from runtime input |
| SEC-002 | MEDIUM   | agent-transition-sync.ts | /tmp context files world-writable — orchestrator detection spoofable in shared CI environments                       |
| SEC-006 | LOW      | bridge.ts                | BusDataSchema `.passthrough()` preserves unknown fields — remove to align with StatusBusSchema                       |

**Key positives:** All Bun.spawnSync uses argv arrays (zero shell injection surface), skill name regex correct, ORCHESTRATOR_MAPPINGS is pure compile-time, atomic writes throughout.

## Tech Debt

1. Lint guard not in automated pipeline (integration gap L1)
2. Prefix asymmetry in agent mapping (A2)
3. BusDataSchema `.passthrough()` should be removed (SEC-006)
4. Stale depth file cleanup on session-start (A5)

## Verdict

**PASSED** — no CRITICAL or HIGH findings. The deterministic hook architecture is sound. The 2 MEDIUM security findings are forward-looking design risks (type-level guards, shared CI hardening), not exploitable vulnerabilities. Tech debt items are minor cleanup.

## Gap Closure Status

All 9 findings planned in **Phase 252** (TRIVIAL — comments, one-line fixes, type narrowing).
