# Research — #319 budget-guard, Phase 1 (budget-core)

## Summary

This phase adopts the **documentation-grounded plan already posted as a comment on GitHub issue #319** (produced by a prior /trace-insights research team over real source + Claude Code docs). This research is a **grounding re-check only** — verifying the plan's Phase-1 code anchors against the current tree. Result: **all ten Phase-1 surfaces ground cleanly, zero blocking deltas.** Design is settled; do not re-derive.

Design recap (settled): `luca budget check` reads three signals — wall-time (guaranteed, from a new state-stamped `runStartedAt`), tool-call count (best-effort), cost (best-effort, statusline-bridged in Phase 2) — resolves per-complexity limits, prints a JSON verdict `{status: ok|warn|halt, tripped, signals}`, always exit 0 (advisory; caller branches). Warn ≥80% of any limit, halt ≥100%. Wall-time is the only guaranteed trip wire; best-effort dimensions never force a halt when absent.

## Phase-1 grounding (CONFIRMED — current anchors)

1. **`schemas.ts` `runStartedAt` precedent** — `lucaStateSchema` at `packages/luca-core/src/state/schemas.ts:81`; `reviewStartedAt: z.string().optional()` at **line 131** (declared-only, NEVER written anywhere in `packages/*/src`). Add `runStartedAt: z.string().optional()` at **line 132**, same `// --- Review-mode entry timestamp ---` block.
2. **`budget-matrix.ts`** — `BudgetLimits` fields (lines 3-10): `maxChecksFixIterations`, `maxVerifyIterations`, `maxPlanReviewIterations`, `maxResearchReviewIterations`, `maxReviewIterations`, `maxPhases`. `BUDGET_BY_COMPLEXITY` rows: TRIVIAL(19), SIMPLE(27), MODERATE(35), COMPLEX(43), CRITICAL(51); `DEFAULT_BUDGET`(61). New fields (`maxWallClockMs`, `maxToolCalls`, `softCostCeilingUsd`) → interface + all 6 objects.
3. **`resolve-budget-limits.ts:13`** — `resolveBudgetLimits` returns whole `BudgetLimits` (`BUDGET_BY_COMPLEXITY[complexity] ?? DEFAULT_BUDGET`). No signature change to add fields.
4. **Pure-fn precedents to mirror** — `withinFixBudget` (`state/machine/guards.ts:39`, pure, edge-unwired, directly testable), `computeContextRefresher` (`orchestration/context-refresher.ts:269`). Test convention: `*.test.ts` beside source (confirmed: `resolve-budget-limits.test.ts`, `budget-guard.test.ts`).
5. **State barrel** — `state/index.ts` re-exports helpers at lines 26-39. New `resolveRunBudget` / `resolveRunBudgetOverrides` exports go in the `// Helpers` block.
6. **`confidence.ts` `gate` leaf** (`packages/luca-cli/src/commands/write-surface/confidence.ts:281-307`) — the read-only model: citty `defineCommand`, optional `--slug`, `run()` resolves cwd, calls a pure luca-core fn, `process.stdout.write(JSON.stringify(..., null, 2))`, no explicit exit → exit 0. Leaves aggregated under `confidenceCommand` (309-322).
7. **`cli.ts` registration** — `confidence` at **lines 91-94** via lazy dynamic import: `confidence: () => import('./commands/write-surface/confidence').then((m) => m.confidenceCommand)`. Add `budget` as a sibling key the same way.
8. **`runStartedAt` stamp site** — `packages/luca-cli/src/write-surface/handlers/luca-state-advance.ts`, `mutateState` block lines **190-219**, updater return object **207-216**. `from` captured at 193, `to = args.toStep` at 175. Condition: `to === 'research' && (from === 'idle' || from === 'triage')` — `to === 'research'` is load-bearing (canonical order is `idle→triage→research`; direct `idle→research` not in order, `from` set is defensive). Add conditional spread `runStartedAt: new Date().toISOString()` in the return object.
9. **Opaque config load** — `state/helpers/load-current-config.ts:21` `loadCurrentConfig({ cwd })` reads `.luca/config.json` → `Record<string, unknown>`, `{}` when missing/malformed. Exported from barrel (index.ts:32). Optional `budget` overrides read here with a caller-applied `.safeParse`.
10. **Gate + existing test** — canonical gate `bunx --bun tsc --noEmit`. `state/machine/budget-guard.test.ts` (the `withinFixBudget` iteration-budget test) EXISTS and must stay green (Phase-1 anti-regression).

## Deltas that change the plan

**None.** Two non-blocking anchor notes folded into items 1 and 8 above (exact insert line 132; `to === 'research'` is the load-bearing stamp condition).

## Phase-1 scope (this phase only)

State schema `runStartedAt` · budget-matrix wall/tool/cost limits · pure `resolveRunBudget` evaluator + `resolveRunBudgetOverrides` config overlay + test · `luca budget check` CLI leaf + `cli.ts` registration · deterministic run-start stamp in state-advance. Deliverable: `luca budget check` prints a verdict and the wall-time trip wire works end-to-end, unit-tested in isolation.

Out of scope (Phase 2): statusline→sidecar cost bridge, wiring the guard into the `/lu` loop and phase-execute waves, config docs.

## Source of truth

The full plan (problem, 9 concrete changes, verification plan, rollout, risks, open questions) lives on **GitHub issue #319** as the implementation-plan comment. Treat it as authoritative; this phase implements changes 1–5 (+ tests) of that plan.
