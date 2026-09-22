# Execute Summary — #319 budget-guard, Phase 1 (budget-core)

Two waves, both complete. No commits (deferred to finalize per stage-gate + /lu contract).

## Wave 1 — luca-core (tasks 1.1.1–1.1.5)
- `packages/luca-core/src/state/schemas.ts` — added `runStartedAt: z.string().optional()` beside `reviewStartedAt` (the ONLY new state field; no cost/turn/tool fields — anti-01 clean).
- `packages/luca-core/src/state/configs/budget-matrix.ts` — extended `BudgetLimits` with `maxWallClockMs`/`maxToolCalls`/`softCostCeilingUsd`; applied context.md tuning values to all 5 complexity rows + `DEFAULT_BUDGET` (=COMPLEX-level; `softCostCeilingUsd:0`/disabled everywhere).
- `packages/luca-core/src/state/helpers/resolve-run-budget.ts` (NEW) — pure `evaluateRunBudget` (worst-of status; undefined optional + 0-limit dims skipped, never coerced/halting; `warnFraction` default 0.8) + `resolveRunBudgetOverrides` (partial Zod `.safeParse`, `{}` on failure) + `RunBudgetVerdict` type.
- `packages/luca-core/src/state/helpers/resolve-run-budget.test.ts` (NEW) — 14 cases (ok/warn/halt, worst-of dominance, missing optionals never halt, disabled cost dim never trips, config widen/narrow).
- `packages/luca-core/src/state/index.ts` — barrel-exported the new helpers + type.
- Verify: tsc exit 0 · new test 14/14 · existing `budget-guard.test.ts` 20/20.

## Wave 2 — luca-cli (tasks 1.2.1–1.2.3)
- `packages/luca-cli/src/commands/write-surface/budget.ts` (NEW) — `budgetCommand` with a read-only `check` leaf (modeled on `confidence.ts`). Loads state; lazily+idempotently stamps `runStartedAt` when unset (best-effort, guarded on state-file presence); reads `.claude/cache/context-refresher-state.json` (toolCallCount) + `.claude/cache/luca-usage-signal.json` (cost/context) best-effort with `.safeParse` + 5-min staleness gate; merges `resolveBudgetLimits` with `resolveRunBudgetOverrides(loadCurrentConfig)`; calls `evaluateRunBudget`; prints verdict JSON; ALWAYS exit 0.
- `packages/luca-cli/src/cli.ts` — registered `budget` via lazy dynamic import alongside `confidence`.
- `packages/luca-cli/src/write-surface/handlers/luca-state-advance.ts` — stamps `runStartedAt` when `to === 'research' && (from ∈ {idle,triage}) && s.runStartedAt === undefined` (never overwrites).
- Verify: tsc exit 0 · scratch smoke test: RUN 1 unset→`status:ok` + lazy stamp fired; RUN 2 (~10d past)→`status:halt`, `tripped:[wallClockMs]`; exit 0 both. Live `.luca/state.json` untouched.

## Confidence entries logged
- Wave 1: medium/design-choice — `contextPct` accepted-but-unused in Phase 1 (no context-window limit in `BudgetLimits` yet; kept for forward-compat).
- Wave 2: medium/requirement-ambiguous — `context-refresher-state.json` carries `lastFiredAt` not `updatedAt`; staleness gates on `updatedAt ?? lastFiredAt` to keep the tool-call dimension functional while honoring the Phase-2 usage-signal `updatedAt` contract.

## Deferred to verify/review
- ac-13 (runtime `luca budget check` against the built/linked CLI) — validated from source in a scratch dir; a built-CLI check belongs to verify.
