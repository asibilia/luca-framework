# DAD-P1c — Plan Review

> Trace ID: DAD-P1c · Phase `04-dad-p1c-fixloop-budget` · Reviewer: `plan-reviewer` (cold isolation) · 2 rounds.

## Verdict

**STATUS: APPROVED · CONVERGENCE: CONVERGED · BLOCKING: 0 · ADVISORY: 0** (B(1)=1 → B(2)=0)

## Parity-safety (the headline claim) — CONFIRMED

The increment is an `assign` ACTION, not a guard. In XState v5, `snapshot.can(event)` is gated by guards only and does not execute actions; `assign` mutates `context`, not the target leaf. So adding `incFixLoop` to the 3 rework edges changes no `allowed` verdict and no resulting step over the 169 pairs. `toIs` stays the sole edge guard; `withinFixBudget` is authored but edge-unwired; `budgetMode` defaults advisory. The advisory invariant holds.

- Edge→counter→cap mappings correct vs `pipeline-transitions.ts:21-23` + `schemas.ts:116-128`. 3 shipped, 2 deferred.
- `resetFixLoop` on forward-exit edges is sound (each loop's counter zeroes on forward exit; by `learn` all three are 0, so `learn→plan` starts clean).
- Caps-from-complexity at emit time is the right source (`resolveBudgetLimits` is wired nowhere; `state.json` caps are schema defaults).
- anti-01..05 correctly fence the invariant; ac-06 (over-budget still allowed in advisory) is the key regression tripwire.

## Round 1 findings (all resolved in round 2)

- **G-DX-001 [BLOCKING]** — t6 referenced a non-existent `toDirectedGraph` snapshot (the graph test asserts only the `.can()` edge set, leaf count, hierarchy — none observe action names). **Fixed:** t6 reworded to "confirm graph test passes unchanged, no snapshot to update, no brittle action-name assertions"; ac-16 added.
- **G-DX-002 [ADVISORY]** — the new `machineVerdict` counter inputs must be ADDITIVE + OPTIONAL or the 2-arg `parity.test.ts:40` call breaks type-check (violating anti-01). **Fixed:** t2 specifies optional inputs + optional `counterUpdate`; anti-01 added to t2.
- **G-ARCH-001 [ADVISORY]** — `incFixLoop` keyed on `event.to` is wrong (checks→execute and review→execute share target `execute`). **Fixed:** t1 uses per-edge parameterized actions `{type:'incFixLoop', params:{counter}}` with nullish base.
- **G-CRIT-001 [ADVISORY]** — ac-01 compound. **Fixed:** split to ac-01.1 / ac-01.2 (parent-preserving, no renumbering).

CONVERGED.
