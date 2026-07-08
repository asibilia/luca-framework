# Learnings — DAD-P1d (`luca graph` CLI verb)

Phase 6 of the DAD migration: added a `luca graph` verb that pure-serializes the
XState pipeline machine to a Mermaid `stateDiagram-v2` (default) or
machine-definition JSON. One fix loop (an exit-code leak), then verify + review
green with 0 must-fix. Gate: luca-core 1020/0, graph CLI 4/0, tsc 0.

---

## pitfall:bun-process-exitcode-leak-in-tests

- **Type**: pitfall · **Confidence**: HIGH
- **Conjectured**: A test that exercises a CLI's error/reject path (which sets
  `process.exitCode = 1`) is self-contained — snapshotting and restoring
  `process.exitCode` to its prior value is enough to isolate it.
- **Refuted by**: The graph CLI test file reported `4 pass, 0 fail` yet the
  process **exited 1**, failing the exit-code-gated `checks` harness. Root cause:
  the reject path (`graph.ts:37-40`) sets `process.exitCode = 1`; the test
  restored the snapshot which was `undefined`, and in Bun assigning
  `process.exitCode = undefined` does **NOT** clear an already-set non-zero code
  (it is a no-op). The non-zero code leaked to the `bun test` runner's exit
  status — all-pass-but-exit-nonzero, silently failing the harness.
- **Learned**: Any test invoking code that mutates `process.exitCode` must
  restore in a `finally` with `process.exitCode = prev ?? 0` (coalesce the
  snapshotted `undefined` to `0`), AND run its assertions INSIDE the try BEFORE
  the restore so the restore does not mask them. See `graph.test.ts:86-96`.
- **Criterion now**: Grep tests for code paths setting `process.exitCode`; each
  such test needs a `prev ?? 0` finally-restore. A green-tests-but-nonzero-exit
  file is the tell — treat a `bun test <file>` that reports 0 failures but exits
  non-zero as an exitCode leak, not a flake.

---

## pattern:xstate-todirectedgraph-over-adjacencymap-for-render

- **Type**: pattern · **Confidence**: HIGH
- **Conjectured**: Either `getAdjacencyMap` or `toDirectedGraph` from
  `xstate/graph` would work to enumerate a machine's transition edges for
  visualization.
- **Refuted by**: `getAdjacencyMap` **simulates** events from every state and
  emits spurious `stay` self-edges (a state receiving an event it doesn't handle
  maps back to itself), which must be `.can`-filtered out before the edge set
  matches the declared transitions. For a pure render there is no oracle to
  filter against, so this is error-prone.
- **Learned**: For a pure render/serialization, use `toDirectedGraph` — it
  reflects the **declared** transitions exactly (here 21 ADVANCE edges, no
  spurious self-edges) and gives the native hierarchy tree
  (`node.children`/`node.edges`) for free. `pipelineGraphEdges()` then equals the
  golden `LEGAL_EDGE_SET` with zero adjacency filtering
  (`graph-render.ts:15,55-59`). Reserve `getAdjacencyMap` for reachability/BFS
  where simulated stay-edges are wanted.
- **Criterion now**: When code walking a machine graph needs `.can`-filtering to
  strip self-edges, it's the wrong primitive for a declared-edge render — switch
  to `toDirectedGraph`. Verify with a two-oracle set-equality test
  (machine-derived edges === canonical transition-table edges) plus an exact-count
  tripwire (`edges.size === 21`).

---

## pattern:keep-heavy-dep-in-owning-package-export-pure-fns

- **Type**: pattern · **Confidence**: HIGH
- **Conjectured**: The thin consumer package (`luca-cli`) that needs a
  machine-visualization feature should import the machine and the `xstate/graph`
  helpers directly to build the output.
- **Refuted by**: Doing so would add `xstate` as a dependency of `luca-cli` (a
  package deliberately kept free of it — anti-03) and leak the bare
  `pipelineMachine` across the package boundary.
- **Learned**: Put the dependency-using logic in the package that already owns
  the heavy dep (`luca-core`, which deps xstate), export **pure functions**
  (`renderPipelineMermaid`, `pipelineDefinitionJson`, `pipelineGraphEdges`)
  through the barrel, and have the thin package import only those. `luca-cli`
  stays xstate-free and never sees the machine object. Same move as exporting
  `machineVerdict` (P1b) rather than the bare machine — the boundary exposes
  computed results, not the engine.
- **Criterion now**: Before adding a dep to a thin/consumer package, check
  whether an upstream package already deps it — if so, add a pure exported
  function there instead. Guard with a `grep <dep> <thin-pkg>/package.json === 0`
  anti-criterion in verification.

---

## Signal Synthesis

Derived solely from the orchestrator-injected `<signal-digest>`.

- **Recurring failure themes**: One fix loop, single root cause — the Bun
  `process.exitCode` leak in the CLI test (captured above as
  `pitfall:bun-process-exitcode-leak-in-tests`). `checks` went
  negative→positive after restoring with `prevExit ?? 0`. No other failure
  clusters; this was the only refutation this phase.
- **Satisfaction valence trends**: Uniformly positive post-fix.
  `satisfaction:outcome` positive across verify + review (0 must-fix);
  luca-core 1020/0, graph CLI 4/0, tsc 0. No step trended negative except the
  single pre-fix `checks` dip.
- **Cross-cutting patterns**: The verify-side rigor is itself a reusable signal —
  edge correctness was proven by **two independent oracles** (machine
  `toDirectedGraph` vs canonical transition-table) plus a size-21 tripwire, and
  leaf-id presence used **line-anchored boundary matching**
  (`(^|\n)\s*<id> -->`) not bare substring, so `review` cannot false-pass on
  `plan-review`. This anti-tautology / anti-substring discipline generalizes to
  any "derived set equals canonical set" verification.
