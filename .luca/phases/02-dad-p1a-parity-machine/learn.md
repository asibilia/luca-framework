# Learnings — DAD-P1a (XState machine + golden parity test, THE GATE)

Phase `02-dad-p1a-parity-machine` · trace DAD-P1a · repo `luca-framework`.
Foundation phase: authored an XState v5 statechart (path B — generated from the typed
`PIPELINE_TRANSITIONS` table) + a `machineVerdict` adapter reproducing `checkPipelineGuard`,
proven by a golden parity harness over all 169 (from,to) pairs. Gate green: tsc 0, machine-parity
516/0, luca-core 975/0. Every learning below is framed as a corrected conjecture.

---

## reference: XState v5 primitive API surface (verified against installed typings)

- **Type:** reference · **Confidence:** HIGH
- **Conjectured:** the docs/muscle-memory API (`transition` on the actor, `resolveState` a root
  export, adjacency from `@xstate/graph`) is the real surface to code against.
- **Refuted by:** spike-1/spike-3 against `node_modules/xstate/**/*.d.ts` at 5.32.2. `transition`
  is a FREE function `import { transition } from 'xstate'` returning a tuple `[next, actions]`
  (transition.d.ts:8) — pure, does NOT run non-assign actions. `resolveState` is a MACHINE METHOD
  (`pipelineMachine.resolveState({value, context})`, StateMachine.d.ts:35) NOT a root export, and it
  REQUIRES `context` when `TContext != MachineContext` (default). `getAdjacencyMap`/`adjacencyMapToArray`/
  `toDirectedGraph` live under `xstate/graph` — NOT `@xstate/graph`.
- **Learned:** the allow ORACLE is `snapshot.can(event)` (boolean), NOT state-value equality — value
  equality mis-handles legal self-loops (`research->research`). `resolveState` THROWS on an unknown
  state value (spike 3), so unknown inputs must be gated ABOVE the machine, never fed in.
- **Criterion now:** verify every xstate symbol against `node_modules/xstate/**/*.d.ts` (not docs)
  before use; green tests over the full input product are the proof it resolved. See
  `machine-verdict.ts:27,97,103,105` and `pipeline-machine.graph.test.ts:18`.

## pitfall: getAdjacencyMap emits spurious "stay" self-edges

- **Type:** pitfall · **Confidence:** HIGH
- **Conjectured:** `getAdjacencyMap(machine,{events})` yields exactly the machine's real transition
  edges, so its edge set can be compared directly to the source table.
- **Refuted by:** spike-6 — under an event that matches NO transition, XState keeps the current
  snapshot, so adjacency records a "stay" self-edge for EVERY (state,event) pair. Raw adjacency
  therefore contains ~13×13 spurious self-edges, not the 21 real ones.
- **Learned:** recover the REAL edge set by filtering each `(state,event)` row through the snapshot
  `.can(event)` oracle — only count an edge when the machine would actually take it. The one LEGAL
  self-loop (`research->research`) survives the filter because `.can` is `true` for it (spike 2).
- **Criterion now:** never trust raw `getAdjacencyMap` output as the edge set; `.can`-filter it, then
  assert BOTH `size===21` AND set-equality vs the table (`pipeline-machine.graph.test.ts:38-58`).

## pattern: golden parity harness for replacing a decision fn with a statechart

- **Type:** pattern · **Confidence:** HIGH
- **Conjectured:** a new statechart that "looks equivalent" to a hand-rolled guard can be swapped in
  once its own unit tests pass.
- **Refuted by:** the risk that the new impl's tests are a tautology — if the adapter shortcuts to the
  very function it replaces (`isLegalTransition`/`checkPipelineGuard`), parity is vacuously true and
  proves nothing. The verifier explicitly judged this ("REAL, not vacuous").
- **Learned:** dual-drive BOTH implementations over the FULL Cartesian input product (169 pairs), and
  assert three axes of equality: `allowed`, resulting step, and reason code. Add an exhaustiveness
  tripwire (count === 169/21) so silently dropping inputs fails, and a structural drift guard
  (`getAdjacencyMap` edge-set === source-table edge-set) so a stray edge can't hide. CRUCIAL: the new
  impl must reach its verdict through the REAL machine primitive chain
  (`resolveState -> snapshot.can -> transition`), never by calling the oracle it is tested against.
- **Criterion now:** grep the new adapter for imports of the legacy decision fn — its absence + a
  full-product 0-mismatch sweep is the proof. See `machine-verdict.ts`, `pipeline-machine.parity.test.ts`.

## pattern: state-level exhaustiveness via `satisfies Record<Enum,...>` (XState has none)

- **Type:** pattern · **Confidence:** HIGH
- **Conjectured:** XState's typed `setup()`/`createMachine` gives compile-time coverage that every
  enum member has a state.
- **Refuted by:** XState has NO native state-level exhaustiveness — you can omit a `PipelineStep` leaf
  and it compiles fine, silently under-covering the machine.
- **Learned:** feed the machine from an explicitly-keyed table annotated
  `satisfies Record<PipelineStep, AdvanceTransition[]>` (`pipeline-machine.ts:96-110`); adding/removing
  an enum member without updating the table becomes a COMPILE ERROR. Generate each entry from the
  canonical source table (`advanceFor`) so EDGES also cannot drift.
- **Criterion now:** any generated statechart over a closed enum must have a `satisfies Record<Enum,...>`
  tripwire on its source table, plus a leaf-count structural test.

## process: foundation-phase discipline — no half-built shape, align the seam

- **Type:** process · **Confidence:** HIGH
- **Conjectured:** at a foundation phase, pre-provisioning downstream fields (a full ~10-field budget
  context for P1c) and letting the swap phase adapt the call site later is harmless forward-thinking.
- **Refuted by:** simplification review raised TWO should-fixes: (1) a speculative 10-field budget
  context pre-commits P1c's 3-vs-5 fix-budget decision the foundation shouldn't own; (2) the adapter's
  bespoke signature would force P1b to adapt rather than drop-in.
- **Learned:** at a foundation later phases INHERIT, trim speculative shape to only what's used now
  (`PipelineContext = {complexity?,oversight?}`, budget deliberately absent with a comment) — an open
  advisory interface never precludes the downstream decision; AND align the new component's SEAM to the
  interface it will replace (adapter takes the existing `PipelineGuardInput` object, imported not
  redefined, so P1b swaps `checkPipelineGuard(input) -> machineVerdict(input)` as a drop-in). Fix both
  AT the foundation, not after inheritance.
- **Criterion now:** foundation-phase review must ask "does this pre-commit a downstream decision?" and
  "is the swap a drop-in or an adaptation?" — trim the former, reshape to match the latter.

## decision: xstate pinned into luca-core; pipeline statechart location + parity target

- **Type:** decision · **Confidence:** HIGH
- **Conjectured:** the statechart could live anywhere and take any dependency posture.
- **Refuted by:** luca-core is imported transitively by luca-cli + luca-tools and previously had `zod`
  as its ONLY runtime dep — adding xstate is a real, accepted architectural change with CLI bundle
  impact to watch.
- **Learned:** `xstate` pinned EXACT `5.32.2` (no range prefix) into `packages/luca-core` — its first
  non-zod runtime dep. Statechart lives at `packages/luca-core/src/state/machine/`. Parity target is
  `checkPipelineGuard` (the rich oracle), NOT the second surface. Relative `.ts` imports (the
  `@luca/core/...` aliases from Design/03 do not exist).
- **Criterion now:** P1b must (a) repoint BOTH enforcement surfaces — the pipeline-guard hook AND
  `luca-state-advance.ts` `mutateState` (generic throw) — and (b) reproduce legacy guard MESSAGES
  (illegal-transition enumerates allowed-next-steps; unknown-step carries recovery hints), which
  `machineVerdict` deliberately omits. Flag CLI bundle size when the machine is wired into production.

---

## Signal Synthesis

Derived solely from the orchestrator-injected `<signal-digest>`.

- **Recurring failure themes:** none. `[failure-dump] none`. Zero halts, zero test failures across
  the run.
- **Satisfaction valence trends:** uniformly positive at the gate/verify sources — checks positive x2
  (machine-parity 516/0, luca-core 975/0, tsc 0 initial + post-fix), verify positive x2 (18/18 ac,
  parity judged REAL not vacuous). ONE review-source negative→positive arc: correctness APPROVE first
  pass, but simplification CHANGES-REQUESTED (2 should-fix: speculative budget context + P1b seam
  mismatch) → looped to execute → fixed → converged. Net: the simplification lens caught foundation
  over-building that the correctness lens passed — a reminder to run both at a foundation phase.
- **Cross-cutting pattern:** the two accepted medium-confidence executor design choices (state-value
  helper placement; `.can`-filtered adjacency) and the spike corrections (resolveState throws on
  unknown; adjacency spurious stays) all trace to ONE root: XState v5's real API differs from the
  assumed one, and the safe path is empirical spikes against installed typings before authoring.
  Promoted into the `reference:` and `pitfall:` entries above.
