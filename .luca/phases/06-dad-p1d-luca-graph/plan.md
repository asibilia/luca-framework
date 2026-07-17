---
id: dad-p1d-luca-graph
title: DAD-P1d — `luca graph` emits the machine visualization
trace_id: DAD-P1d
complexity: MODERATE
waves:
  - wave: 1
    tasks: [t1]
  - wave: 2
    tasks: [t2]
  - wave: 3
    tasks: [t3, t4]
  - wave: 4
    tasks: [t5]
---

# DAD-P1d — `luca graph` Machine Visualization

Goal: a new `luca graph` CLI verb that PURE-serializes the pipeline machine to a Mermaid `stateDiagram-v2` (default) and machine-definition JSON, whose edge set matches the live 21 legal transitions. Zero runtime cost (no state read, no actor). Research: Muninn `research:dad-p1d-luca-graph`. Locked: edges via `toDirectedGraph` (21, no spurious self-edges); render lives in luca-core (luca-cli has no xstate dep); `--format mermaid|json`; `--annotate` optional fix-loop labels; stdout-only.

## Tasks

### Wave 1 — Core renderer (luca-core)
- **t1 — `graph-render.ts`.** Create `packages/luca-core/src/state/machine/graph-render.ts` (pure — imports the module-load `pipelineMachine`, no fs/state). Export: `renderPipelineMermaid(opts?: { annotate?: boolean }): string` (walk `toDirectedGraph(pipelineMachine)` → `stateDiagram-v2`; `idle` atomic top-level; `[*] --> idle`; each compound parent → `state <parent> { … }`; each edge `src --> tgt : ADVANCE` (+ `/ <action>` from `edge.transition.actions` when `annotate`)); `pipelineDefinitionJson(): string` (`pipelineMachine.toJSON()` stringified); `pipelineGraphEdges(): Set<string>` (`${source.key}->${target.key}` from `toDirectedGraph`). Re-export all three from `state/index.ts` + the root barrel.
  Verification: ac-01, anti-02

### Wave 2 — CLI verb (luca-cli)
- **t2 — `graph.ts` + registration.** Create `packages/luca-cli/src/commands/graph.ts` — citty `defineCommand` with `args: { format: {type:'string', default:'mermaid'}, annotate: {type:'boolean', default:false} }`. `run()`: validate `format ∈ {mermaid, json}` else `process.exitCode = 1` and return (no stdout); on `mermaid` call `renderPipelineMermaid({annotate})`, on `json` call `pipelineDefinitionJson()`, `process.stdout.write(out + '\n')`. Import the render fns from `@alecsibilia/luca-core`; do NOT import `xstate`; do NOT read `.luca/`. Register in `cli.ts` subCommands: `graph: () => import('./commands/graph').then((m) => m.graphCommand)`.
  Verification: ac-02, ac-03, ac-09.1, ac-09.2, anti-01, anti-03

### Wave 3 — Tests
- **t3 — Core renderer tests.** `graph-render.test.ts`: `pipelineGraphEdges()` equals `LEGAL_EDGE_SET` (from `fixtures.ts`) with size 21; the Mermaid output declares each of the 13 leaf ids as a **boundary-matched** token (line-anchored, NOT bare substring — `review` ⊂ `plan-review`); it contains the 4 composite `state <parent>` blocks; it contains the `research --> research` self-loop; two `renderPipelineMermaid()` calls are byte-identical (determinism); `JSON.parse(pipelineDefinitionJson())` succeeds and its flattened transition count (recurse `.states`, sum `on.ADVANCE.length`) is 21.
  Verification: ac-04, ac-05, ac-06, ac-07, ac-08, ac-10
- **t4 — CLI smoke test.** `graph.test.ts`: spy `process.stdout.write`; `run({args:{format:'mermaid'}})` output first line is `stateDiagram-v2` and it declares the 13 leaf ids (boundary-matched); `--format json` yields valid JSON; a bad `--format` sets `process.exitCode === 1` and calls `process.stdout.write` zero times; running in a temp cwd leaves `.luca/` untouched (purity). NOTE: a direct `graphCommand.run({args:{…}})` does NOT apply citty arg defaults — pass `format`/`annotate` explicitly in the test.
  Verification: ac-03, ac-09.1, ac-09.2, ac-11

### Wave 4 — Gate
- **t5 — Gate green.** `bunx --bun tsc --noEmit` exit 0; `bun test packages/luca-core` green; the graph CLI test green.
  Verification: ac-12, ac-13, ac-14, anti-04

## Verification Criteria
- **ac-01**: `renderPipelineMermaid`, `pipelineDefinitionJson`, `pipelineGraphEdges` are exported from the luca-core barrel.
- **ac-02**: `luca graph` is registered in `cli.ts` subCommands.
- **ac-03**: the Mermaid output's first line is `stateDiagram-v2`.
- **ac-04**: the Mermaid output declares each of the 13 leaf state ids as a boundary-matched token (e.g. line-anchored `state research`/`research -->`, NOT a bare substring — `review` ⊂ `plan-review` would false-pass).
- **ac-05**: the Mermaid output contains the 4 composite `state <parent>` blocks (planning/executing/reviewing/finalizing).
- **ac-06**: `pipelineGraphEdges()` equals `LEGAL_EDGE_SET` (21 edges) derived from the machine.
- **ac-07**: the output contains the legal `research --> research` self-loop.
- **ac-08**: `--format json` emits valid JSON whose flattened transition count (recurse `.states`, sum each leaf's `on.ADVANCE.length`) is 21.
- **ac-09.1**: an invalid `--format` sets `process.exitCode` to 1.
- **ac-09.2**: an invalid `--format` calls `process.stdout.write` zero times (no output emitted).
- **ac-10**: `renderPipelineMermaid()` is deterministic — two calls are byte-identical.
- **ac-11**: running the graph command in a temp cwd leaves `.luca/` untouched (pure, no state read/write).
- **ac-12**: `bun test packages/luca-core` passes.
- **ac-13**: the graph CLI test passes.
- **ac-14**: `bunx --bun tsc --noEmit` exits 0.
- **anti-01**: MUST NOT read `.luca/state.json` or create an actor in the graph command — the purity test (ac-11) proves it.
- **anti-02**: `graph-render.ts` derives edges from the machine (`toDirectedGraph`) — `grep "PIPELINE_TRANSITIONS" packages/luca-core/src/state/machine/graph-render.ts` returns 0.
- **anti-03**: MUST NOT add `xstate` to luca-cli — `git diff` shows `packages/luca-cli/package.json` dependencies unchanged.
- **anti-04**: MUST NOT modify the machine, the parity/graph tests, or `checkPipelineGuard` — this is a purely additive verb.

## Deliverables
- **D1**: `luca graph` emits a `stateDiagram-v2` Mermaid diagram from the machine → ac-01, ac-02, ac-03, ac-04, ac-05, ac-07
- **D2**: edge set matches the live graph (21) + JSON format → ac-06, ac-08
- **D3**: pure serialization, correct flag handling → ac-09.1, ac-09.2, ac-10, ac-11, anti-01, anti-02, anti-03
- **D4**: gate green, additive-only → ac-12, ac-13, ac-14, anti-04

## Notes / Decisions (locked from research)
- Render lives in luca-core (has xstate); luca-cli imports the pure fns — keeps `xstate/graph` out of luca-cli.
- `--format json` = honest `machine.toJSON()` (XState definition), NOT a fabricated Stately schema; no `--format stately`.
- `toDirectedGraph` (not `getAdjacencyMap`) — its declared-transition edges are exactly the 21 legal edges with no spurious self-edges.
- **Cross-composite edges (known Mermaid caveat):** 10 of the 21 edges cross composite boundaries (checks↔verify, review→execute, learn→plan/finalize, finalize→idle/execute/review, plan-review→execute, idle→triage). `stateDiagram-v2` supports these by leaf-id reference, but the phase gates *emission* (edge-set + token presence), NOT visual render fidelity — the tests substring/set-check, they do not parse-render the diagram. Emit cross-composite edges at the top scope referencing nested leaf ids.
