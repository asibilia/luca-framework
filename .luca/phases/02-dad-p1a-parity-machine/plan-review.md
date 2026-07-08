# DAD-P1a — Plan Review

> Trace ID: DAD-P1a · Phase `02-dad-p1a-parity-machine` · Reviewer: `plan-reviewer` (cold isolation).

## Verdict

**STATUS: PASSED · CONVERGENCE: CONVERGED · BLOCKING: 0 · ADVISORY: 4 (all applied)**

## Ground-truth verification (all confirmed against source)

- 21 legal edges (1+1+2+1+1+1+2+1+2+2+2+2+3), 13 steps → 169 pairs, 148 illegal. ✓
- 5 reason codes in `pipeline-guard.ts:48-54`. ✓
- Self-loop asymmetry: legal `research→research`=`ok`; other self-edges fall to `same-step-no-op` (legality checked before same-step, `:196-200`). Adapter reproduces it. ✓
- `xstate` genuinely absent (`package.json` deps = `{zod}` only). ✓
- **ac-06 parity constraint correct** — `checkPipelineGuard` has no forward/budget gates (legality = table membership; complexity/oversight surface-only). Machine keeping forward gates ABSENT + budget ADVISORY is required or it over-denies. ✓
- Oracle = `snapshot.can(event)` (not value-equality); `transition()` free-fn tuple; `xstate/graph` path. ✓
- Resulting-step parity (ac-10) genuinely tested via `transition()` leaf assertion. ✓
- Anti-criteria paths all exist; correctly scope P1a OUT of P1b (anti-03/04), P1c + P1t (anti-05). ✓
- Sequencing sound (spikes wave 1 gate authoring wave 2). ✓

## Advisories (all folded into the plan before execute)

- **G-ARCH-001** — spike-2 `.can()` self-loop fallback now written into t2 (derive allow from `transition()` leaf===to, or model self-loop as explicit external transition; adapter absorbs whichever the spike validates).
- **G-ARCH-002** — xstate-as-first-non-zod-dep now flagged as an accepted architectural change in Notes.
- **G-DX-001** — intra-wave sequencing now explicit: single executor sequences t3→t4 (wave 2) and t5→(t6,t7) (wave 3), no parallel fan-out.
- **G-DX-002** — idle node-count muddle fixed: `idle` is a top-level ATOMIC leaf (not a compound parent); snapshot description = 13 leaves (idle + 12 across 4 compound parents).

Convergence: fresh plan; 0 blocking on first pass; advisories applied without re-review (polish, not correctness). CONVERGED.
