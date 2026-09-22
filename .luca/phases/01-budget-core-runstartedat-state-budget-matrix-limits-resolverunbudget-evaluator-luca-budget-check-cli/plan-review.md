# Plan Review — #319 budget-guard, Phase 1 (budget-core)

**Status:** APPROVED
**Convergence:** CONVERGED (BLOCKING 1 → 0 after one revision)
**Reviewer:** Plan Reviewer (cold-isolated)

## Round 1 — NEEDS_REVISION (1 blocking, 4 advisory)

1. **G-CRIT-001 [BLOCKING]** — ac-09 was a compound criterion (`grep evaluateRunBudget\|resolveRunBudgetOverrides` — alternation passes if either exports). Failed the Splitting Test.
2. G-ARCH-001 [advisory] — Task 1.1.3/1.1.4 depend on Task 1.1.2's new `BudgetLimits` fields; dependency undeclared.
3. G-DX-001 [advisory] — ac-13/anti-02 need the built/linked CLI and lazily mutate `.luca/state.json`; executor should be told.
4. G-DX-002 [advisory] — ac-10 grepped bare token `check`; too weak to fail on a malformed leaf.
5. G-SCOPE-001 [advisory] — barrel export (Task 1.1.5 / ac-09) unmapped in Deliverables.

Grounding confirmed clean: all cited anchors live; no pre-satisfied grep criterion; 3 anti-criteria each with a real probe.

## Round 2 — APPROVED (all 5 resolved)

1. **RESOLVED** — ac-09 split into `ac-09.1` (`evaluateRunBudget`) + `ac-09.2` (`resolveRunBudgetOverrides`), canonical `ac-NN.M` grammar (no renumbering of ac-10..ac-14). Task 1.1.5 + D3 reference both.
2. RESOLVED — Task 1.1.3 now lists `Dependencies: Task 1.1.2`.
3. RESOLVED — ac-10 now greps `defineCommand` (asserts the citty leaf shape).
4. RESOLVED — Task 1.2.1 carries the built-CLI + state-mutating (idempotent) note.
5. RESOLVED — D3 now maps ac-06, ac-07, ac-08, ac-09.1, ac-09.2.

No new pre-satisfied-grep criteria introduced (ac-09.1/09.2 symbols and ac-10 `defineCommand` all confirmed absent from the untouched tree). No regressions or new gaps. Plan is complete, atomic, correctly wave-ordered; every criterion is a single binary probe absent until its change lands.
