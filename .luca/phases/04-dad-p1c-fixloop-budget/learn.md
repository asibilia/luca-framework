# Learnings — DAD-P1c (fix-loop budget guard, advisory-first)

Phase 4 of the "Deterministic Agentic Development" migration. Made the fix-loop
iteration budget LIVE as XState `assign` actions on rework edges, surfaced
budget-exceeded as telemetry (not a deny), and authored+tested an enforce guard
that ships edge-unwired behind a default `budgetMode: 'advisory'`. Verify PASS,
both reviewers APPROVE (0 must-fix), 169-pair parity green.

---

## pitfall: xstate-graph-context-serialization-infinite-explosion

- **Type:** pitfall · **Confidence:** HIGH
- **Conjectured:** The plan specified `incFixLoop` increment the counter as
  `(ctx[counter] ?? 0) + 1` — the obvious nullish-safe increment. Assumed safe
  because production always threads a real number.
- **Refuted by:** That nullish-base increment made XState `getAdjacencyMap`
  (`graph.test.ts:38-52`) HANG. `getAdjacencyMap`'s default serializer builds its
  dedup key from the FULL snapshot INCLUDING `context`, and structural
  exploration starts from the machine's `{}` default context (no counters seeded).
  A nullish-base increment mints `checksFixIteration: 1, 2, 3, …` across the
  `checks<->execute` rework loop → an ever-growing counter → infinite distinct
  serialized states → the graph never terminates.
- **Learned:** A state machine used for BOTH structural graph analysis AND live
  execution must keep its default/exploration-context state space FINITE. A
  context-MUTATING `assign` with an unbounded value (a monotonic counter) violates
  that whenever exploration reaches it from the empty default context. Fix
  (`actions.ts:108-133`): make the increment/reset a NO-OP when the target field
  is `undefined` — mutate only an already-defined number. Production ALWAYS seeds
  the counters (LucaState schema `.default(0)`, `schemas.ts:116-120`), so the
  no-op branch is unreachable live and increments fire normally (0→1→2…); the
  no-op only holds the `{}` exploration invariant so the graph stays finite (and
  keeps `parityContext()`, which carries no counters, parity-green).
- **Criterion now:** When adding a context-growing `assign` to a machine that is
  also graph-explored, gate the mutation on the field already being tracked
  (`if (ctx[field] === undefined) return {}`) so `{}`-context exploration cannot
  mint unbounded values; assert `getAdjacencyMap`/graph tests still terminate
  UNCHANGED. Any unbounded value in the serialized snapshot key = infinite graph.

---

## pattern: advisory-first-live-gate-instrumentation

- **Type:** pattern · **Confidence:** HIGH
- **Conjectured:** To add budget enforcement to a live gate you wire the limit
  check as a blocking guard on the relevant edge.
- **Refuted by:** Wiring `withinFixBudget` as a rework-edge guard would make the
  machine over-deny vs the legacy guard and break the 169-pair equivalence parity
  harness — you cannot ship the behavior change and the invariant simultaneously,
  and you have no baseline data to size the caps.
- **Learned:** Decompose "instrument now, enforce later." (1) Add the
  counting/measurement as an `assign` ACTION, not a guard — an action mutates
  context and provably cannot change `.can()`/`next.value`, so any parity/
  equivalence invariant stays green (`actions.ts:1-19`). (2) Surface the
  threshold verdict as TELEMETRY (`fixloop.counted` with `verdict:
  within|exceeded`, `phaseOfRollout: advisory`), NOT a deny — you get the baseline
  without behavior change. (3) Author AND test the enforcing guard fully but leave
  it EDGE-UNWIRED behind a default `mode: 'advisory'` (`guards.ts:41-49`; guard
  returns `true` unless `budgetMode === 'enforce'`). The eventual enforce flip is
  then a gated default-mode change justified by the collected data, plus an escape
  hatch.
- **Criterion now:** When adding a limit to a gate protected by an equivalence
  invariant: is the counter an action (not a guard)? Is the verdict telemetry
  (not a deny)? Is the enforce guard tested but edge-unwired behind a default-off
  mode? If yes to all three, the measurement ships without touching any decision
  output. Watchout (from review): the advisory telemetry budget source
  (`BUDGET_BY_COMPLEXITY`) and the future enforce cap source (persisted `max*`
  fields) must be UNIFIED before the enforce flip, or the advisory verdict will
  disagree with the eventual deny.

---

## Signal Synthesis

Derived solely from the orchestrator-injected `<signal-digest>`.

- **Satisfaction valence trends:** Uniformly positive. `checks` and `verify`
  outcome signals positive x2 each. `review` moved neutral→positive: both
  reviewers APPROVE with 0 must-fix; the single should-fix (single-source the
  rework edge→cap mapping) was applied and converged (now `REWORK_EDGE_CAPS` is
  DERIVED from `FIX_LOOP_EDGES`, `actions.ts:86-90`). No negative-valence steps.
- **Recurring failure themes:** None. The one deviation
  (`incFixLoop`/`resetFixLoop` no-op-on-undefined vs the plan's `?? 0` increment)
  was adjudicated SOUND, not a masked bug — it is the mechanism that keeps
  `getAdjacencyMap` exploration finite; the no-op branch is unreachable in
  production.
- **Cross-cutting patterns:** The headline design (action-not-guard counter +
  telemetry-not-deny verdict + tested-but-unwired enforce guard behind default
  advisory) is a systemic, reusable win → promoted to the
  `pattern:advisory-first-live-gate-instrumentation` engram above. The graph-hang
  deviation is a novel, non-obvious pitfall → promoted to
  `pitfall:xstate-graph-context-serialization-infinite-explosion`.
