# DAD-P1d — Plan Review

> Trace ID: DAD-P1d · Phase `06-dad-p1d-luca-graph` · Reviewer: `plan-reviewer` (cold isolation).

## Verdict

**STATUS: PASSED · CONVERGENCE: CONVERGED · BLOCKING: 0 · ADVISORY: 5 (all applied)**

## Ground-truth confirmation

- 21-edge count verified (`PIPELINE_TRANSITIONS` sums to 21 = `EXPECTED_LEGAL_COUNT`; `LEGAL_EDGE_SET` from `LEGAL_PAIRS`). ac-06 target real.
- `toDirectedGraph` is the correct primitive — purely declarative (reflects `STEP_TRANSITIONS`), yields exactly the 21 declared edges incl. `research→research`, no spurious self-edges (the spurious ones are a `getAdjacencyMap` artifact, spike-6). Cleaner than the existing test's adjacency+`.can`.
- citty `defineCommand` + lazy-subCommand registration matches `cli.ts`/`classify.ts` exactly.
- luca-cli has NO xstate; luca-core has it as a runtime dep → render-in-luca-core prerequisite grounded; anti-03 enforceable.
- ac-06 (`pipelineGraphEdges() === LEGAL_EDGE_SET`) is the self-correcting gate that validates the novel `.edges` API surface.

## Advisories (all folded into the plan)

- **G-CRIT-001** — ac-09 compound. **Fixed:** split into ac-09.1 (exitCode===1) + ac-09.2 (stdout write count 0).
- **G-ARCH-001** — 10/21 edges cross composite boundaries. **Fixed:** Notes caveat added — the phase gates emission (edge-set + tokens), not visual render fidelity; emit cross-composite edges at top scope by leaf-id.
- **G-DX-001** — ac-08 flatten underspecified. **Fixed:** stated the algorithm (recurse `.states`, sum `on.ADVANCE.length`).
- **G-DX-002** — leaf-id substring false-pass (`review` ⊂ `plan-review`). **Fixed:** ac-04 + t3/t4 now require boundary-matched (line-anchored) token checks.
- **G-DX-003** — direct `graphCommand.run()` doesn't apply citty defaults. **Fixed:** t4 note to pass `format`/`annotate` explicitly.

CONVERGED.
