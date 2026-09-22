# Consolidated Code Review — #319 budget-guard, Phase 1

4 cold-isolated reviewers (architecture/correctness, security, simplification, DX). Per-reviewer audits: `audits/independence.md` (architecture), `audits/security-auditor.md` (security); DX + simplification returned inline.

## Verdict: REQUEST_CHANGES — 2 MUST-FIX

### MUST-FIX
1. **[architecture] `runStartedAt` is never reset at run completion.** `triage → research` is the only entry to `research`; nothing writes `runStartedAt` back to undefined. On a supported in-place re-run (`finalize → idle` then `idle → triage → research` on the same `state.json`), run #2 still carries run #1's stamp (both stamp sites guard on unset), so `elapsedMs` is measured from run #1 → wall fraction ≥ 1 → **permanent spurious `halt`** that Phase 2's loop would act on.
   - **Fix applied:** always re-stamp `runStartedAt` on the once-per-run `triage → research` (and defensive `idle → research`) edge — drop the `=== undefined` guard on THAT edge (it fires exactly once per run, so it is the authoritative start). The CLI lazy-stamp keeps its unset-only guard as the legacy fallback.
2. **[security] A repo-local `.luca/config.json` `budget` override can silently disable the wall-time trip wire** (the one dimension promised always-on). `RunBudgetOverridesSchema` used only `z.number().nonnegative()`: `maxWallClockMs: 0` hits the `if (!(limit > 0)) continue` "disabled" skip; `maxWallClockMs: 1e999` → `Infinity` passes `nonnegative()` (Zod rejects only NaN) → `fraction = elapsed/Infinity = 0`, never trips. config.json is a trust boundary for tooling run against arbitrary repos.
   - **Fix applied:** `maxWallClockMs: z.number().positive().finite()`; `.finite()` on `maxToolCalls`/`softCostCeilingUsd` (kept `nonnegative`). `.safeParse` fails closed to base ceilings, so a rejected override degrades to the built-in limit.

### SHOULD-FIX folded into the same loop
- **[security+architecture] Sidecar `Infinity`** (`toolCallCount`/`totalCostUsd`) forces a false `halt` (local DoS on the Phase-2 loop). → add `.finite().nonnegative()` to the sidecar numeric fields.
- **[DX+simplification+architecture — 3 reviewers converge] Dead `contextPct` surface** — declared in `EvaluateRunBudgetInput`, computed in `budget.ts` from `contextUsedTokens`/`contextLimit`, spread into the evaluator, but the `dimensions` table has no context entry and `BudgetLimits` no context ceiling → inert. → remove `contextPct` + the two sidecar context fields + the computation; re-introduce in the same phase that adds a real `maxContextPct` dimension. (`costUsd` stays — it IS wired with a real dimension row + override test.)
- **[simplification] `resolveRunBudgetOverrides`** hand-rolls 3 copy-pasted per-key if-blocks; Zod already strips unknown/absent → `return parsed.data`.
- **[DX] `tripped`/`signals` magic strings** — export `type RunBudgetDimension = 'wallClockMs' | 'toolCalls' | 'costUsd'`; type `tripped: RunBudgetDimension[]`, `signals: Partial<Record<RunBudgetDimension, RunBudgetSignal>>`.
- **[DX] exact-boundary tests** — add `elapsedMs` at exactly 80% (→warn) and 100% (→halt) to lock the inclusive `>=` contract; add a regression asserting a `maxWallClockMs: 0`/`Infinity` override does NOT disable the wall-time trip (fails closed).
- **[security] unparseable `runStartedAt`** (tampered/garbage) reads `elapsed = 0` and won't re-stamp (truthy) → silently blinds wall-time. → in `budget.ts`, treat a `runStartedAt` that `Date.parse`es to `NaN` as unset (re-stamp).

### Verified CORRECT (anti-sycophancy)
Worst-of/fraction math + inclusive boundaries; `limit > 0` divide-by-zero guard; negative `elapsedMs` double-guarded; missing-state/malformed-sidecar/override degrade paths never throw; `mutateState` lazy stamp lock-serialized + idempotent; always exit 0 even on halt; no secret egress, no prototype pollution, no path traversal/shell. Test suite non-vacuous.

## NOTES (no action this phase)
- `resolve-budget-limits.ts` JSDoc still says "MODERATE-equivalent defaults"; new run-budget `DEFAULT_BUDGET` fields are deliberately COMPLEX-level (context.md). Outside changed set; amend opportunistically.
- Verdict JSON has no unit labels (`wallClockMs` in ms); machine-first by design, `fraction` makes a halt human-readable.
