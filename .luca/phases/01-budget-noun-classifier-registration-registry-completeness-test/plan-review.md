# Plan Review — Phase 01: budget noun classifier registration + registry-completeness test

**Iteration:** 0 · **Complexity:** MODERATE · cold isolation

```
STATUS: APPROVED
CONVERGENCE: CONVERGED
BLOCKING_COUNT: 0
ADVISORY_COUNT: 3
RECOMMENDATION: approve
```

## Anchor verification (all confirmed against source)

- cli.ts subCommands map: budget :95, graph :32, statusline :36, start/stop/status :42-44, hook :34 — exact.
- Classifier sets TOPLEVEL_READ :216 / TOPLEVEL_WRITE :223 / READ_VERBS :234 / NOUN_VERBS :248; confidence only `log` :264; hook exclusion comment :221-222 — exact. All sets module-private; classifier's sole import is shell-quote.
- budget: single verb `check`; lazily stamps `runStartedAt` via mutateState (budget.ts:139-159, :222-224) → luca-write justified.
- confidence: 5 eager leaves; summary/render/gate stdout-only reporters. graph: pure read ("Reads NO .luca/ state").
- cli.ts import side-effect-free (lazy thunks; manifest.ts:17-28 top-level await is a read-only package.json load).
- Windows `start` in READONLY_COMMANDS :78 unrelated (matches command word, not luca noun).

## Context decisions honored

All D1 dispositions verbatim in Task 1.1.1 (budget→NOUN_VERBS + stamp comment, check NOT in READ_VERBS per snapshot precedent; confidence 5 verbs; graph/status→READ; statusline/start/stop→WRITE; READ_VERBS += summary/render/gate). Hook + telemetry untouched. No scope creep.

## Test design soundness

- Invariant 2 thunk resolution verified across ALL 16 noun modules — post-Wave-1 verb-set equality holds for every noun (confidence 5/5 and budget 1/1 post-fix). No hidden drift will strand the executor.
- TOPLEVEL nouns correctly exempt (invariant 2 iterates keys(LUCA_NOUN_VERBS) only). Invariant 1 union arithmetically complete: 16 + 5 + 10 + {hook} = 32 = exact cli.ts noun count.
- No circular import. Both drift directions bound: equality (inv 2), dead entries (inv 3), unregistered nouns (inv 1), ac-09.1 pins DELIBERATELY_UNCLASSIFIED to exactly {hook}.

## Criteria quality

All 12 ac single binary probes; falsifiability independently re-verified (every grep literal 0 matches today; registry test file absent; anti-04 baseline confirmed). 4 anti well-formed (both porcelains, suite-green with verified 25-block/49-expect baseline, hook-never-registered). D1–D4 complete both directions. Waves parallel-safe (disjoint files both waves); dependency edges correct (1.2.2 → 1.1.1 only; 1.2.1 → both exports).

## Findings (advisory only)

- **G-ARCH-001 [ADVISORY]** — context.md overstates READ_VERBS protection: equality catches verb drift, but a future noun legitimately registering a MUTATING `summary`/`render`/`gate` verb would classify bash-readonly via global READ_VERBS membership. Mirrors the pre-existing global design; executor should note the cross-noun leak in the READ_VERBS comment (snapshot-comment style).
- **G-DX-001 [ADVISORY]** — ac-02/anti-04 are `grep -c` printed-count probes: with 0 matches grep -c prints 0 but EXITS 1 — verification must compare stdout, not exit code.
- **G-DX-002 [ADVISORY]** — research.md's "30 nouns" figure is off by 2 (actual 32); test computes from the live map, unaffected.

## Summary

Structurally sound and unusually well-anchored; every claim checked out live, including a full 16-module audit proving invariant-2 equality passes post-edit. Zero blocking issues — approved for execution.
