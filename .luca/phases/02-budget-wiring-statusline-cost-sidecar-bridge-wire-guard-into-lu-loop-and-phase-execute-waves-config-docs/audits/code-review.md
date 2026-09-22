# Consolidated Code Review — #319 budget-guard, Phase 2 (budget-wiring)

2 cold-isolated reviewers (architecture/correctness, DX/clarity). Both **APPROVE · 0 MUST-FIX** — the always-on budget stop is wired correctly and resumably on both /lu surfaces, the statusline bridge is contract-correct and truly non-throwing, phase-execute reuses the existing suspend path at the wave boundary. Applying 4 convergent should-fixes as a quality pass (this phase is the wiring; 2 are genuine instruction-correctness).

## Should-fixes applied (fix loop)
1. **[both reviewers] `commands/lu.ts` dangling `<RUN_ID>`** — step-1a halt emits `luca telemetry emit --kind budget.halt --run-id <RUN_ID>`, but the command surface's Step 0 never establishes a run id (it omits all telemetry). An empty `--run-id` exits 1. Fix: DROP the telemetry sub-step from the command's step-1a and note "(budget.halt telemetry is emitted by the skill surface only)". The checkpoint + pause + resume message stay — the guard's behavior is unaffected; only the lighter command surface's (already-absent) telemetry differs. Keeps the two surfaces behavior-parallel without inventing a RUN_ID.
2. **[both reviewers] phase-execute wave check omits `--complexity`** → falls back to `state.complexity` (usually unset → DEFAULT/COMPLEX-loosest ceilings), diverging from the /lu loop's calibrated `--complexity <level>`. Fix: pass `luca budget check --complexity <level>` reusing the `COMPLEXITY=$(luca state read | jq -r '.complexity // "MODERATE"')` value the skill already computes.
3. **[DX] phase-execute wave check lacks the always-on note** — a future editor could gate it behind oversight. Fix: add "(always-on stop — fires regardless of oversight mode; do NOT gate behind checkpoint/full-auto)".
4. **[DX] config-override doc understates fail-closed scope** — `getting-started.md` "a malformed override fails closed" reads per-field, but `safeParse` discards the WHOLE `budget` object on any invalid field. Fix: reword to make clear one invalid field reverts ALL dimensions to built-in ceilings; only `maxToolCalls`/`softCostCeilingUsd` accept 0, `maxWallClockMs` must be positive.

Also folded (cheap NOTES): spell out the `tripped` array→comma-string join in the meta; a one-line note that budget halts land under two telemetry kinds (`budget.halt` from the loop, `phase.suspend reason:"budget_halt"` at the wave) so a KPI query unions both.

## Verified CORRECT (anti-sycophancy)
Statusline `writeUsageSignal` writes the minimal reader shape with a fresh ISO `updatedAt`, skips non-finite cost, fully try/catch-swallowed, `void`-called so it can't change statusline output or the always-0 exit. Step-1a sits at a genuinely clean boundary (after read-state, before run-step; state.json still resumable via Step 0); `warn` continues, `halt` does not advance + ends the turn. phase-execute halt reuses progress.jsonl + phase.suspend at the wave boundary, never mid-wave. The full-auto always-on stop is coherent with the oversight model (the deliberate exception, documented identically on both surfaces). No secret egress, no crash path.

## NOTES (no action)
- Reader keys cache dir on cwd, writer on `project_dir`; coincide at repo root, cost degrades to omitted otherwise (documented; wall-time is the guaranteed trip wire).
- `total_cost_usd` is per-harness-session cumulative (resets on /clear), not per-run — a soft cost ceiling could trip early across multiple runs in one TUI session; Phase-1/harness semantics, not a Phase-2 defect.
