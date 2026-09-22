# Learnings — #319 budget-guard, Phase 1 (budget-core)

One review→execute→checks→verify→review fix cycle. Converged: REQUEST_CHANGES (2 must-fix) → all 20/20 criteria met, exit-0 advisory contract intact.

## pitfall: budget/safety-guard config+state is a trust boundary — validate limits can't disable the guard

- **Type**: pitfall · **Confidence**: HIGH
- **Conjectured**: A repo-local `.luca/config.json` `budget` override validated with `z.number().nonnegative()` was sufficient to accept user limit overrides.
- **Refuted by**: Two inputs disable the "always-on" wall-clock trip wire — `maxWallClockMs:0` hits the `if (!(limit > 0)) continue` disabled-sentinel skip; `maxWallClockMs:1e999` → `JSON.parse` yields `Infinity`, which `nonnegative()` accepts (Zod rejects only `NaN`) → `fraction = elapsed/Infinity = 0`, never trips (audits/security-auditor.md:4-9, code-review.md:10).
- **Learned**: For dev tooling run against arbitrary cloned repos, `config.json` and `state.json` are attacker-influenced inputs. The dimension a guard promises to ALWAYS enforce must not be silenceable by an override: `maxWallClockMs: z.number().positive().finite()` (reject both 0 and Infinity); `.finite()` on the others. `.safeParse` then fails closed to the built-in base ceiling — a rejected override degrades to armed, not blind.
- **Criterion now**: must-fix-2 regression: config `{budget:{maxWallClockMs:0}}` + aged runStartedAt → `signals.wallClockMs.limit` = SIMPLE base (override rejected), `status:halt`, exit 0. Unit tests assert 0/1e999 overrides do NOT disable the trip.

## pitfall: per-run state-stamped timestamp must RESET on its once-per-run entry edge

- **Type**: pitfall · **Confidence**: HIGH
- **Conjectured**: Stamping `runStartedAt` only when unset (`s.runStartedAt === undefined`) on `triage→research` is correct because research is entered once per run.
- **Refuted by**: `finalize→idle` is a supported terminal, and `idle→triage→research` legitimately begins a NEW run in-place on the same `state.json`. On run #2 the stamp is still set from run #1, both stamp sites skip → `elapsedMs = now − run#1start` → wall fraction ≥ 1 → PERMANENT spurious `halt` that Phase 2's loop acts on (audits/independence.md:4-7, code-review.md:8-9).
- **Learned**: A per-run timestamp derived from wall-clock must be authoritatively (re)written on the edge that fires exactly once per run — always overwrite, never guard-on-unset. The unset-guard is only valid as a legacy lazy-stamp fallback, never as the primary anchor.
- **Criterion now**: must-fix-1 runtime check: seed stale `runStartedAt` (10d) + `luca state advance --to-step research` → stamp OVERWRITTEN to ~now (<120s). The `=== undefined` guard dropped on the `triage/idle→research` edge.

## pitfall: don't thread a forward-compat signal end-to-end before the dimension that consumes it exists

- **Type**: pitfall · **Confidence**: HIGH
- **Conjectured**: Accepting and plumbing `contextPct` through the evaluator now (computed in CLI, spread into `evaluateRunBudget`) is harmless forward-compat for a future context ceiling.
- **Refuted by**: 3 of 4 cold-isolated reviewers independently flagged it — `EvaluateRunBudgetInput.contextPct` is declared and its JSDoc says "skipped when undefined" (implying used when defined), but the `dimensions` table has no context entry and `BudgetLimits` no ceiling → it can never trip or appear in `signals`. It reads as wired but is inert and misleads consumers into assuming a context ceiling is enforced (audits/independence.md:10-14, security-auditor.md:22, code-review.md:15).
- **Learned**: Dead plumbing is worse than a TODO — a threaded-but-unevaluated signal is a false affordance. Introduce the signal in the SAME phase that adds the dimension/limit that consumes it. (Contrast: `costUsd` stayed because it IS wired with a real dimension row + override test.)
- **Criterion now**: `contextPct` + the two sidecar context fields + the CLI computation removed; re-introduce alongside a real `maxContextPct` dimension. Grep: no `contextPct` in the evaluator input surface.

## pattern: pure-evaluator + advisory-CLI + best-effort-signal guard shape

- **Type**: pattern · **Confidence**: HIGH
- **Conjectured**: A budget guard needs a stateful checker that halts the process.
- **Refuted by**: n/a (validated design, not a refutation) — verify confirmed the shape holds: 20/20 criteria, always exit 0 even on halt.
- **Learned**: Split into (1) a PURE evaluator (`evaluateRunBudget`: worst-of status over dimensions, inclusive `>=` boundaries, `limit > 0` divide-by-zero guard, missing/0-limit dims skipped never coerced) that takes only data; (2) an ADVISORY CLI that ALWAYS exits 0 and prints a machine-first verdict JSON so the caller branches on status (never `process.exit`); (3) exactly ONE deterministic signal (state-stamped wall-clock) as the sole guaranteed trip wire, with optional best-effort sidecar signals that are SKIPPED when absent/malformed, never coerced to a value. Sidecar numerics need `.finite().nonnegative()` so a planted `Infinity` can't force a false halt.
- **Criterion now**: Advisory contract test: halt verdict returns exit 0; missing state → wall reads ok exit 0; malformed sidecar → dimension omitted, never throws.

## pattern: Zod `.finite()` as the standard guard against Infinity slipping through nonnegative()

- **Type**: pattern · **Confidence**: HIGH
- **Conjectured**: `z.number().nonnegative()` fully validates a numeric limit/count.
- **Refuted by**: `JSON.parse('1e999')` yields `Infinity`, which passes `nonnegative()` (Zod rejects only `NaN`). `Infinity` as a limit → `fraction = 0` (never trips); `Infinity` as a measured value → `fraction = Infinity` (false halt). Both reachable from JSON with no `Infinity` literal (security-auditor.md:6, independence.md:16-19).
- **Learned**: Any numeric parsed from untrusted JSON that feeds a division or comparison must carry `.finite()`. Make it the default for budget/limit/count schema fields.
- **Criterion now**: `.finite()` present on all sidecar numerics and config override fields; regression asserts `1e999` is rejected/omitted.

## decision: `luca budget check` verdict JSON contract + RunBudgetDimension vocabulary

- **Type**: decision · **Confidence**: HIGH
- **Conjectured**: Phase 2 would branch on ad-hoc string keys from the verdict.
- **Refuted by**: DX reviewer flagged `tripped`/`signals` magic strings as an unstable contract for the Phase-2 consumer (code-review.md:17).
- **Learned**: The stable contract is verdict JSON `{status, tripped, signals}` where `status ∈ ok|warn|halt`, and `type RunBudgetDimension = 'wallClockMs' | 'toolCalls' | 'costUsd'` is the exported dimension vocabulary — `tripped: RunBudgetDimension[]`, `signals: Partial<Record<RunBudgetDimension, RunBudgetSignal>>`. Phase 2's loop branches on this union, not raw strings. Per-complexity default ceilings anchor below the observed ~3.1h failure; `softCostCeilingUsd:0` = disabled everywhere in Phase 1.
- **Criterion now**: `RunBudgetDimension` exported from the state barrel; verdict typed against it; ac-13 asserts JSON shape `{status,tripped:[...],signals:{...}}` + exit 0.

## Signal Synthesis

Derived solely from the orchestrator-injected signal digest.

- **Recurring failure themes**: The two review must-fixes are the same root theme — TRUST-BOUNDARY blindness on a safety guard's inputs: (1) stale per-run state (runStartedAt never reset → spurious permanent halt), (2) config override disabling the sole guaranteed trip wire (0/Infinity). Both are "the guard silently stops guarding," found only at review, not by checks/verify.
- **Cross-cutting pattern (reviewer convergence)**: 3 of 4 independent reviewers flagged the identical dead `contextPct` forward-compat surface. Strong signal that end-to-end threading of an unconsumed dimension is a recognizable, high-agreement smell.
- **Confidence journal → outcome correlation**: both mid-execution medium-confidence dips landed on real deltas — the `contextPct` design-choice dip was REMOVED as dead surface; the `lastFiredAt` vs `updatedAt` ambiguity resolved to `updatedAt ?? lastFiredAt`. Medium-confidence self-flags were predictive of review churn.
- **Satisfaction valence trend**: checks positive ×2 and verify positive ×2 (18/18 then 20/20) throughout; only review went negative once (2 must-fix) then positive after the fix loop. Single converging cycle — the negative valence was isolated to the review step and fully resolved, no oscillation.
