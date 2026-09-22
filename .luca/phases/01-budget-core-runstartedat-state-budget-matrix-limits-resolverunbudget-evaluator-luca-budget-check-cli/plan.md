---
id: 01-budget-core
title: "Budget-core — runStartedAt state, budget-matrix limits, resolveRunBudget evaluator, luca budget check CLI"
wave: 2
tasks: 8
---

# Plan: Budget-core (Phase 1 of #319 budget-guard)

## Objective
Ship the deterministic core of the #319 budget guard: a state-stamped `runStartedAt`, wall/tool/cost ceilings in the budget matrix, a pure `evaluateRunBudget` evaluator plus `.luca/config.json` overlay, and a read-only `luca budget check` CLI that prints an advisory JSON verdict and always exits 0. Wall-time is the only guaranteed trip wire; tool-call and cost are best-effort and never force a halt when absent. Phase-2 wiring (statusline bridge, /lu loop, phase-execute, config docs) is explicitly out of scope.

## Context
Design is locked by the implementation-plan comment on GitHub issue #319 and grounded by `research.md` (zero deltas — all ten Phase-1 anchors confirmed). Phase-1 = issue changes 1–5 + tests. Default ceilings and rationale come from `context.md` (tuning table + defensive executor notes); mirror the pure-core style of `withinFixBudget` (`state/machine/guards.ts:39`) and the read-only `gate` leaf of `confidence.ts` (`confidence.ts:281-322`). `warnFraction` defaults 0.8; warn ≥80% of any limit, halt ≥100%.

## Phases

### Phase 1: Budget-core

#### Wave 1: luca-core (schema, matrix, evaluator+test, barrel)
One coherent unit in `packages/luca-core`. All four surfaces land together and are provable in isolation. No dependency on Wave 2.

- [ ] **Task 1.1.1**: Add `runStartedAt: z.string().optional()` to `lucaStateSchema` at line 132, beside `reviewStartedAt` in the `// --- Review-mode entry timestamp ---` block. No cost/turn/tool fields — only the timestamp.
  - Files: `packages/luca-core/src/state/schemas.ts`
  - Verification: ac-01, ac-02, anti-01

- [ ] **Task 1.1.2**: Extend `BudgetLimits` with `maxWallClockMs`, `maxToolCalls`, `softCostCeilingUsd`; add the `context.md` tuning-table values to all 5 `BUDGET_BY_COMPLEXITY` rows and `DEFAULT_BUDGET` (DEFAULT = COMPLEX-level; `softCostCeilingUsd` = 0 disabled everywhere).
  - Files: `packages/luca-core/src/state/configs/budget-matrix.ts`
  - Verification: ac-01, ac-03, ac-04, ac-05

- [ ] **Task 1.1.3**: New `resolve-run-budget.ts` — pure `evaluateRunBudget(input): RunBudgetVerdict` (per-dimension fraction-of-limit, worst-of `status` ok|warn|halt, `tripped: string[]`, echoed `signals`; undefined optional signals skipped, never halt; `warnFraction` default 0.8) plus `resolveRunBudgetOverrides(config): Partial<BudgetLimits>` (reads optional `budget` section, Zod `.safeParse`, failure → `{}`). No I/O in the evaluator.
  - Files: `packages/luca-core/src/state/helpers/resolve-run-budget.ts`
  - Verification: ac-01, ac-06, ac-07
  - Dependencies: Task 1.1.2

- [ ] **Task 1.1.4**: New `resolve-run-budget.test.ts` covering below-warn→ok, one dim ≥80%→warn, one dim ≥100%→halt, missing optional signals never halt, config override widens/narrows a limit.
  - Files: `packages/luca-core/src/state/helpers/resolve-run-budget.test.ts`
  - Verification: ac-08
  - Dependencies: Task 1.1.3

- [ ] **Task 1.1.5**: Re-export `evaluateRunBudget` and `resolveRunBudgetOverrides` from the `// Helpers` block of the state barrel.
  - Files: `packages/luca-core/src/state/index.ts`
  - Verification: ac-01, ac-09.1, ac-09.2
  - Dependencies: Task 1.1.3

#### Wave 2: luca-cli (command, registration, run-start stamp)
Depends on Wave 1's new exports/fields. Consumes `evaluateRunBudget`, `resolveRunBudgetOverrides`, `resolveBudgetLimits`, and the new `runStartedAt` field.

- [ ] **Task 1.2.1**: New `budget.ts` with a read-only `check` leaf modeled on `confidence.ts`'s `gate`. `--complexity <level>` optional (falls back to `state.complexity`, then `DEFAULT_BUDGET`); loads state via `loadCurrentState`; lazily stamps `runStartedAt` when unset (idempotent `mutateState`); reads the two `.claude/cache/` sidecars best-effort (missing/stale >5min/malformed → dimension omitted); limits = `resolveBudgetLimits(complexity)` merged with `resolveRunBudgetOverrides(config)`; calls `evaluateRunBudget`; prints verdict JSON to stdout; ALWAYS exit 0.
  - Files: `packages/luca-cli/src/commands/write-surface/budget.ts`
  - Verification: ac-01, ac-10, ac-13, anti-02
  - Dependencies: Task 1.1.3, Task 1.1.5
  - Note: ac-13/anti-02 require the built/linked CLI (source-run or `bun run build && bun link`) and are state-mutating — `budget check` lazily stamps `runStartedAt` via `mutateState` (idempotent) on this repo's real `.luca/state.json`.

- [ ] **Task 1.2.2**: Register `budget` alongside `confidence` (cli.ts lines 91-94) via the same lazy dynamic-import idiom.
  - Files: `packages/luca-cli/src/cli.ts`
  - Verification: ac-01, ac-11, ac-13
  - Dependencies: Task 1.2.1

- [ ] **Task 1.2.3**: In the `mutateState` updater return (luca-state-advance.ts lines 207-216), stamp `runStartedAt: new Date().toISOString()` when `to === 'research' && (from === 'idle' || from === 'triage')` and it is currently unset (`to === 'research'` is load-bearing).
  - Files: `packages/luca-cli/src/write-surface/handlers/luca-state-advance.ts`
  - Verification: ac-01, ac-12
  - Dependencies: Task 1.1.1

## Deliverables
- **D1**: `runStartedAt` in the pipeline-state schema (timestamp only) → ac-02, anti-01
- **D2**: budget-matrix wall/tool/cost limits across all 5 rows + DEFAULT → ac-03, ac-04, ac-05
- **D3**: pure `evaluateRunBudget` evaluator + `resolveRunBudgetOverrides` config overlay (unit-tested, barrel-exported) → ac-06, ac-07, ac-08, ac-09.1, ac-09.2
- **D4**: `luca budget check` advisory CLI command (always exit 0, emits JSON verdict) → ac-10, ac-11, ac-13, anti-02
- **D5**: deterministic run-start stamp in state-advance → ac-12

## Verification Criteria
- **ac-01**: `bunx --bun tsc --noEmit` exits 0.
- **ac-02**: `grep -n "runStartedAt: z.string().optional()" packages/luca-core/src/state/schemas.ts` matches.
- **ac-03**: `grep -n "maxWallClockMs" packages/luca-core/src/state/configs/budget-matrix.ts` matches.
- **ac-04**: `grep -n "maxToolCalls" packages/luca-core/src/state/configs/budget-matrix.ts` matches.
- **ac-05**: `grep -n "softCostCeilingUsd" packages/luca-core/src/state/configs/budget-matrix.ts` matches.
- **ac-06**: `grep -n "export function evaluateRunBudget\|export const evaluateRunBudget" packages/luca-core/src/state/helpers/resolve-run-budget.ts` matches.
- **ac-07**: `grep -n "resolveRunBudgetOverrides" packages/luca-core/src/state/helpers/resolve-run-budget.ts` matches.
- **ac-08**: `timeout 120 bun test packages/luca-core/src/state/helpers/resolve-run-budget.test.ts` exits 0.
- **ac-09.1**: `grep -n "evaluateRunBudget" packages/luca-core/src/state/index.ts` matches.
- **ac-09.2**: `grep -n "resolveRunBudgetOverrides" packages/luca-core/src/state/index.ts` matches.
- **ac-10**: `grep -n "defineCommand" packages/luca-cli/src/commands/write-surface/budget.ts` matches (the `check` leaf is a citty command).
- **ac-11**: `grep -n "budget" packages/luca-cli/src/cli.ts` matches the lazy dynamic-import registration.
- **ac-12**: `grep -n "runStartedAt" packages/luca-cli/src/write-surface/handlers/luca-state-advance.ts` matches the conditional stamp.
- **ac-13**: `luca budget check | grep -q '"status"'` matches (stdout carries a JSON `status` field).
- **ac-14**: `timeout 120 bun test packages/luca-core/src/state/machine/budget-guard.test.ts` exits 0 (iteration budgets untouched).

### Anti-criteria (regression guards)
- **anti-01**: MUST NOT — add cost/turn/tool fields to the `state.json` schema (only `runStartedAt`); probe: `grep -n "costUsd\|toolCallCount\|turnCount\|totalCostUsd" packages/luca-core/src/state/schemas.ts` returns no match.
- **anti-02**: MUST NOT — make `luca budget check` exit non-zero, even on a `halt` verdict; probe: `luca budget check >/dev/null 2>&1; test $? -eq 0`.
- **anti-03**: MUST NOT — touch any Phase-2 surface; probe: `git diff --name-only` includes none of `packages/luca-tools/src/statusline/handler.ts`, `packages/luca-tools/src/artifacts/skills/lu/index.ts`, `packages/luca-tools/src/artifacts/skills/phase-execute/index.ts`.

## Risks & Mitigations
- **Wall-time signal blind if unstamped** — `runStartedAt` has no existing stamping precedent (`reviewStartedAt` is declared-but-never-written), so both new paths must be correct. Mitigation: deterministic stamp in state-advance (Task 1.2.3) + idempotent lazy stamp in `budget check` (Task 1.2.1) covers legacy runs.
- **Best-effort signals false-halting** — a missing tool-call/cost signal must be skipped, never coerced to a 0-that-halts or NaN fraction. Mitigation: evaluator treats undefined optionals as absent; test ac-08 asserts missing optionals never halt.
- **`complexity` frequently unset** — no CLI persists it. Mitigation: `--complexity` optional with `state.complexity` then `DEFAULT_BUDGET` (COMPLEX-level generosity) fallback; wall-time still catches runaways.
- **`softCostCeilingUsd` false positives** — cost is per-session, resets on `/clear`. Mitigation: defaults to 0 (disabled) everywhere; users opt in via `.luca/config.json`.
- **Config overlay throwing the CLI** — Mitigation: `resolveRunBudgetOverrides` uses Zod `.safeParse`; parse failure returns `{}` (schema-first-parsing rule).

## Decisions
- 2026-07-17 — Adopt the #319 issue plan verbatim for Phase 1 (changes 1–5 + tests); grounding re-check found zero deltas.
- 2026-07-17 — Wall-time is the only guaranteed trip wire; tool-call and cost are strictly best-effort; an absent best-effort signal never forces a halt.
- 2026-07-17 — Advisory-first: `luca budget check` always exits 0 and prints a JSON verdict; the caller (Phase 2) branches on `.status`.
- 2026-07-17 — No cost/turn fields in `state.json`; only `runStartedAt`. Cost/tool sidecars live under `.claude/cache/` (Phase 2).
- 2026-07-17 — Default ceilings anchored to the single observed ~3.1h → spend-cap datapoint; CRITICAL wall-clock (150 min) sits below 3.1h so the guard trips first. `DEFAULT_BUDGET` = COMPLEX-level generosity. All overridable per-repo via `.luca/config.json` `budget`.
