# DAD-P1t — Plan Review

> Trace ID: DAD-P1t · Phase `05-dad-p1t-demote-tables` · Reviewer: `plan-reviewer` (cold isolation) · 2 rounds.

## Verdict

**STATUS: APPROVED · CONVERGENCE: CONVERGED · BLOCKING: 0 · ADVISORY: 1** (B(1)=1 → B(2)=0)

## Ground-truth confirmation

- Machine parent structure matches the golden coarse-phase map byte-for-byte (idle→IDLE; planning→PLANNING; executing→EXECUTING; reviewing→REVIEWING; finalizing→FINALIZING). Keeping `coarse-phase-of.test.ts` unchanged while the body switches to the getMeta-derived map is a valid identity proof.
- No import cycle (`coarse-phase-of.ts → pipeline-machine.ts` one-way). Bootstrap ordering coherent (machine+meta → structural `stateValueForStep` → `STEP_TO_STATE_VALUE` → `resolveState().getMeta()` → `STEP_TO_COARSE_PHASE`).
- `snapshot.getMeta()` is the non-deprecated API; only the 5 top-level nodes carry meta so extraction is unambiguous; meta is non-structural (parity/graph untouched).
- t1→t2 ordering sound (table exists until t2 migrates the last reader + deletes atomically).

## Round 1 findings (all resolved)

- **G-SCOPE-001 [BLOCKING]** — ac-01's grep would match 3 comment-only references no task removed. **Fixed:** t1 scrubs the pipeline-machine.ts doc-block mentions; t4 updates the graph.test.ts header comment.
- **G-CRIT-001 [ADVISORY]** — anti-03 missing. **Fixed:** restored as a real invariant (no guard/action via meta; toIs sole edge guard).
- **G-DX-001 [ADVISORY]** — `setup({types:{meta}})` slot support unverified. **Fixed:** t1 carries the inline-meta fallback.
- **G-ARCH-001 [ADVISORY]** — ac-08 overclaimed "restores exhaustiveness". **Fixed:** softened to runtime backstop (compile-time held by `STEP_TRANSITIONS satisfies`); added ac-12 (explicit STEP_TO_STATE_VALUE golden snapshot).

## Round 2 residual (advisory — folded into executor instructions)

- **G-SCOPE-002** — the t4 barrel-export guard must NOT embed the literal `PIPELINE_STEP_TO_COARSE_PHASE` token in a src `.test.ts` (ac-01's grep would then be ≥1). Implement it as an export-key-set assertion (the barrel's keys omit the symbol) — or drop the guard, since removing the barrel line + `tsc` already compile-enforce non-export and ac-01 covers source purity.

CONVERGED.
