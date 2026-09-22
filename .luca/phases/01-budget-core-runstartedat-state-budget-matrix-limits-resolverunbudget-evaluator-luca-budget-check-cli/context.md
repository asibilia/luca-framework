# Context — #319 budget-guard, Phase 1 (budget-core)

Design is **locked by the implementation-plan comment on GitHub issue #319** (documentation-grounded, research-team-produced). Discussion scope here is only the residual tuning decisions the plan left as estimates. No design gray areas remain open.

## Locked decisions (from the #319 plan — do not re-open)

- **Adopt the issue plan verbatim for Phase 1** (changes 1–5 + tests). Grounding re-check (research.md) found zero deltas.
- **Wall-time is the only guaranteed trip wire** — from a new state-stamped `runStartedAt`. Tool-call count and cost are strictly best-effort; an absent best-effort signal NEVER forces a halt.
- **Advisory-first**: `luca budget check` always `exit 0` and prints a JSON verdict; the caller (Phase 2 loop wiring) branches on `.status`. No hard enforcement in this phase.
- **No cost/turn fields in `state.json`** — cost is harness-ephemeral (resets on `/clear`); only `runStartedAt` (a timestamp) goes in the pipeline-state contract. Cost/tool sidecars live under `.claude/cache/` (Phase 2).
- **Warn at ≥80% of any limit; halt at ≥100%** (`warnFraction = 0.8`).

## Tuning decisions [auto — plan estimates, advisory + config-overridable]

Default ceilings anchored to the single observed datapoint (~3.1h run → account-spend-cap hard error). CRITICAL wall-clock sits **below** 3.1h so the guard trips first. All values are overridable per-repo via `.luca/config.json` `budget` and are meant to be re-calibrated from `budget.halt` telemetry once real runs accumulate.

| Complexity | `maxWallClockMs` | `maxToolCalls` | `softCostCeilingUsd` |
|---|---|---|---|
| TRIVIAL  | 1_200_000  (20 min) | 150  | 0 (disabled) |
| SIMPLE   | 2_400_000  (40 min) | 300  | 0 (disabled) |
| MODERATE | 4_500_000  (75 min) | 550  | 0 (disabled) |
| COMPLEX  | 7_200_000  (120 min)| 850  | 0 (disabled) |
| CRITICAL | 9_000_000  (150 min)| 1200 | 0 (disabled) |
| **DEFAULT_BUDGET** (complexity unset) | 7_200_000 (120 min) | 850 | 0 (disabled) |

Rationale for the choices the plan left open:
- **`softCostCeilingUsd` defaults to 0 (disabled) everywhere.** Cost is best-effort, per-session (not account), and resets on `/clear` — tripping on it by default would be a false-positive risk. Users opt in via config. Wall-time carries the guard.
- **`DEFAULT_BUDGET` = COMPLEX-level generosity.** `complexity` is frequently unset in `state.json` (no CLI persists it), and real `/lu` runs that reach the guard tend to be substantial — a too-tight default would trip healthy runs. Generous default + deterministic wall-time still catches the runaway case.

## Defensive notes for the executor (from plan risks/open questions)

- `evaluateRunBudget` must treat **undefined optional signals as skipped** — never coerce a missing tool-call/cost signal into a 0-that-halts or a NaN fraction.
- `resolveRunBudgetOverrides` reads the optional `.luca/config.json` `budget` section via `loadCurrentConfig` and Zod `.safeParse` — parse failure returns `{}` (schema-first-parsing rule; never throw the CLI).
- The `runStartedAt` stamp condition is `to === 'research' && (from === 'idle' || from === 'triage')`; `to === 'research'` is load-bearing. The `luca budget check` command also **lazily** stamps `runStartedAt` if unset (idempotent `mutateState` write) so legacy/pre-existing runs get a baseline and the wall-time signal is never blind.
- Keep the existing `state/machine/budget-guard.test.ts` (iteration budgets) green — new wall/tool/cost fields are additive.

## Verification gate

`bunx --bun tsc --noEmit` exit 0; new `resolve-run-budget.test.ts` green (below-warn→ok, one dim ≥80%→warn, one dim ≥100%→halt, missing optionals never halt, config override widens/narrows); existing `budget-guard.test.ts` stays green.
