PERSPECTIVE: correctness + simplification
VERDICT: APPROVE

## Summary
Final quality pass on DAD-P1d (`luca graph` verb). Re-derived the four correctness concerns from the machine + renderer source; all hold. No MUST-FIX or SHOULD-FIX. Two NOTEs.

## Correctness — verified

**C1 — Edge walk emits each edge exactly once, no dupes/drops.** `collectEdges` (graph-render.ts:39-42) walks `node.edges` recursively; `toDirectedGraph` places each declared edge under its source node exactly once, so `allEdges` has no duplicates. `renderPipelineMermaid` partitions edges cleanly: intra edges (`isIntra` true ⇒ source-parent === target-parent, both non-null) are emitted in exactly one composite block (the block where `leafParent.get(source) === composite.key`, graph-render.ts:124-128) and skipped by the cross loop (`if (isIntra) continue`, :134); cross edges are emitted once at top scope (:133-136) and skipped by the composite loop (`if (!isIntra) continue`, :126). The partition is total and disjoint — no edge dropped, none duplicated. `idle` (atomic top-level leaf, `leafParent → null`, graph-render.ts:100-101) yields `from=null ⇒ isIntra false`, so `idle --> triage` correctly emits at top scope; `[*] --> idle` seeded at :118. `research --> research` self-loop is intra ⇒ inside the planning block (matches machine pipeline-machine.ts:225-227). Confirmed against the 4-composite / 13-leaf machine structure (pipeline-machine.ts:208-295) and the 21-edge golden set (fixtures.ts:56-58).

**C2 — Renderer is genuinely PURE + deterministic.** graph-render.ts imports the module-load `pipelineMachine` (:17), reads no `.luca/` state, creates no actor, and has no `Date`/`Math.random`. Order is the machine's own insertion order (children/edges arrays), so `renderPipelineMermaid() === renderPipelineMermaid()` (asserted graph-render.test.ts:92-94). `pipelineDefinitionJson` is `JSON.stringify(pipelineMachine.toJSON(), null, 2)` (:145-147) — stable, structure-derived.

**C3 — CLI invalid-format + annotate threading.** graph.ts:37-40: on unknown format sets `process.exitCode = 1` and returns BEFORE the single `process.stdout.write` (:47) — zero output on the reject path (asserted graph.test.ts:88-90). `--annotate` threads through as `renderPipelineMermaid({ annotate: args.annotate })` (:44-45); annotate is correctly a no-op for the json path.

**C4 — No `pipelineMachine` leak.** Grep of `packages/luca-core/src/index.ts` for `pipelineMachine` = 0 matches; state/index.ts:50-55 exports only the 3 pure render fns. xstate stays out of luca-cli consumers (anti-03). cli.ts:32 registers the verb.

## Simplification — verified
Mermaid building uses a `string[]` push + single `join('\n')` (graph-render.ts:118-138) — clean, not concatenation spaghetti. `pipelineGraphEdges` and the Mermaid walk already share the `collectEdges`/`directedGraph` helpers, so the flatten logic is DRY. Tests are clear and each `ac-*` maps to one focused assertion; no redundant coverage.

FINDINGS:
- [NOTE] The composite-block edge loop is O(composites × allEdges) — 4×21 re-scans of `allEdges` (graph-render.ts:121-130). Irrelevant at this scale; a `Map<compositeKey, edges[]>` pre-bucket would linearize it if the machine ever grows. Not worth the indirection now.
- [NOTE] `LEAF_IDS` is duplicated verbatim across graph-render.test.ts:20-34 and graph.test.ts:17-31. Acceptable (cross-package, and the CLI test intentionally re-derives its own expectation rather than importing core test internals), but a shared fixture export would remove the drift risk if the leaf set changes.

CONSOLIDATED:
  MUST_FIX_COUNT: 0
  SHOULD_FIX_COUNT: 0
  NOTE_COUNT: 2
  CROSS_PHASE_COUNT: 0
