PERSPECTIVE: architecture
VERDICT: APPROVE

## What I verified (skeptical pass — hunting for divergence from `checkPipelineGuard`)

### 1. Machine encoding — cross-branch `#id` targeting (correct)
- `advanceFor` (pipeline-machine.ts:88-93) generates every edge as `target: '#${to}'` straight from `PIPELINE_TRANSITIONS`, so the EDGE set cannot drift from the source table. Verified all 21 loop-backs resolve to a real leaf id: checks→execute/verify, verify→checks/review, review→execute/learn, learn→plan/finalize, finalize→idle/execute/review, plan-review→execute/plan (pipeline-transitions.ts:12-26).
- Each leaf carries `id: '<step>'` (pipeline-machine.ts:140-214) equal to its step name, so `#${to}` always resolves. A mistyped leaf id would fail machine creation immediately (XState throws on unresolvable `#ref`), not silently — robust enough.
- Leaf count = 13 confirmed by hand (idle atomic + planning 6 + executing 2 + reviewing 3 + finalizing 1) and structurally by graph.test.ts:76-91 (`countLeaves===13`, top-level 5 coarse phases). `satisfies Record<PipelineStep,...>` at pipeline-machine.ts:117 gives compile-time step exhaustiveness.

### 2. Adapter (`machine-verdict.ts`) — reproduces every `checkPipelineGuard` branch
- Decision-tree ordering is byte-for-byte the legacy order: unknown-current (line 77) BEFORE unknown-requested (line 84) matches pipeline-guard.ts:157 then :175; legality via `snapshot.can` (line 103) BEFORE the `from===to` same-step split (line 114) matches pipeline-guard.ts:201-209 (the load-bearing ordering that makes the legal `research→research` self-loop `ok` while illegal self-edges are `same-step-no-op`).
- `VALID_STEPS = Object.keys(PIPELINE_TRANSITIONS)` (line 44) is the SAME key source as the legacy guard's `VALID_STEPS` (pipeline-guard.ts:126) — the two can never disagree on "known".
- `resultingStep` via `stateValueToLeaf(next.value)`: verified for all 5 coarse shapes — top-level string `'idle'` (finalize→idle) and nested `{parent: leaf}` for the other four; `Object.values(value)[0]` is deterministic since there are no parallel states.

### 3. Test robustness — could pass while machine is wrong? No material gap
- `allowed` (parity.test.ts:35-43) and `reason` (:95-116) are asserted once per ALL 169 pairs; resulting-step asserted for all 21 legal pairs (:48-72) AND stay-on-`from` for all 148 illegal pairs (:75-91). Reason gate covers the full 148, not a subset.
- Graph drift guard (graph.test.ts:38-59) filters the spurious "stay" self-edges via `.can` then asserts BOTH `size===21` and `toEqual(LEGAL_EDGE_SET)` — a real added/removed edge cannot hide (a genuine extra transition returns `.can===true` and would appear in the set). The `.can` filter only removes non-firing self-edges, which is correct per spike-6.
- The only inputs NOT enumerated are unknown-step combinations beyond the 2 fixtures (e.g. bogus→bogus). Adapter logic there is a straight `VALID_STEPS.has` check in legacy order, so no divergence is possible. Non-blocking.

### 4. Context shape (P1c/P2 forward-compat) — sound
- All `PipelineContext` fields (pipeline-machine.ts:56-69) are optional primitives (enums/numbers) — JSON-serializable, so P2 snapshot persistence is unaffected. `resolveState({value, context: {}})` satisfies the typing; I confirmed StateMachine.d.ts:35-44 REQUIRES `context` when `TContext ≠ MachineContext`, and the adapter always passes one. Budget/iteration fields left optional so a P1c 3-or-5 fix-budget is not precluded.

### 5. xstate 5.32.2 API — all used symbols present, none deprecated
- Verified against installed typings: `transition` returns `[next, actions]` tuple (transition.d.ts:8); `resolveState` (StateMachine.d.ts:35); `getAdjacencyMap`/`adjacencyMapToArray` (graph/index.d.ts:2) and `toDirectedGraph` (graph/graph.d.ts:12). package.json:6 pins `"xstate": "5.32.2"` exact (no range prefix).

FINDINGS:
- [NOTE] `machineVerdict` intentionally omits `message` parity (MachineVerdict has no `message`; parity test never compares it). Correct for P1a (the adapter is scaffolding — anti-03/anti-04 confirm the hook + write-surface still call `checkPipelineGuard`). BUT when P1b repoints the hook to the machine, the legacy `illegal-transition` message enumerates allowed-next-steps and the unknown-step messages carry recovery hints — those must be reproduced or the hook must retain `checkPipelineGuard` for messaging. Cross-phase (P1b).
- [NOTE] `MachineVerdict.resultingStep` is typed `string` rather than `PipelineStep`; on allow it is always a valid leaf. Tightening to `PipelineStep` would help P1c consumers. Non-blocking.
- [NOTE] graph.test.ts:84-91 asserts top-level order via `toEqual([...])` (order-sensitive), relying on `toDirectedGraph` preserving definition order. Currently correct; mildly fragile if XState changes traversal order. Test-only.
- [NOTE] xstate is luca-core's first non-zod runtime dependency (imported transitively by luca-cli + luca-tools). Already acknowledged in plan.md:82; flag CLI bundle-size at the point the machine is wired into production.

CONSOLIDATED:
  MUST_FIX_COUNT: 0
  SHOULD_FIX_COUNT: 0
  NOTE_COUNT: 4
  CROSS_PHASE_COUNT: 1
