# Plan Review — trace-insights-p3-ledger-join

## Iteration 1 (NEEDS_REVISION, 2 blocking + 3 advisory)

- **G-ARCH-001 [BLOCKING]**: interval design used telemetry `mode.start`/`mode.end` as primary with ledger fallback on "telemetry absent" — but zero such records exist in real telemetry and no emitter exists in the codebase (schema-union only; emitter died with luca-mastracode). Fallback never fires; feature silently no-ops with every trace in the unjoined tail. Fix: ledger `mode-transition` deltas primary; telemetry preferred only when it yields ≥1 interval per repo.
- **G-ARCH-002 [BLOCKING]**: ledger path can't produce the bound outputs — ledger runIds empty, `mode-transition.data` carries only {from,to} (no slug/wave). Degraded tuple + slug source unspecified. Fix: nullable tuple; slug from nearest slug-bearing telemetry record; explicit "attribution unavailable" note otherwise.
- **G-CRIT-001 [ADVISORY]**: ac-14 `grep -c` exit-code conflation.
- **G-CRIT-002 [ADVISORY]**: anti-04 ≥2 threshold satisfiable with routing row deleted (F3 alone has ≥2).
- **G-DX-001 [ADVISORY]**: `thread_id` in join key had no named consumer (dead field by the plan's own rule).

## Iteration 2 (APPROVED)

```
STATUS: APPROVED
CONVERGENCE: CONVERGED
BLOCKING_COUNT: 0
ADVISORY_COUNT: 3
RECOMMENDATION: approve
```

All 5 findings verified resolved against ground truth: 0 `mode.start/end` in real telemetry vs 354 ledger `mode-transition` rows (empirical basis of the reversal confirmed); degraded tuple `(runId: null, pipelineStep, slug|null, wave: null)` with nearest-slug-bearing-telemetry source verified implementable (64 slug-bearing records exist); ac-14 now stdout-based; anti-04 ≥4 verified exactly matching current count; thread_id demoted with rationale. New-issue sweep: all new ac probes start red (genuine additions); anti-criteria targets exist and would catch regressions; ac-IDs stable, no renumbering; Splitting Test holds; D1–D9 cover all 5 scope items; waves/deps correct.

Remaining advisories (non-blocking): G-CRIT-002b anti-04 sits exactly at threshold 4 — the pinned test row is the real deletion guard; G-DX-002 ac-14/ac-19 unmapped to D-lines (bookkeeping); G-DX-003 stale iteration-1 Decisions line retained above the rev2 demotion entry (append-only practice; binding key unambiguous).

## Confidence Gate Resolutions

- **[gate-research] Cost allocation rule (t1, low/requirement-ambiguous)** — RESOLUTION SUPERSEDES the plan's single-interval rule. Researcher examined `.luca/ledger.jsonl` (354 mode-transition rows): step intervals are frequently milliseconds-to-seconds (triage 78ms, checks 3–25s) while agentic turns run minutes and demonstrably cross many transitions in one turn (9 transitions in ~21 min observed), so start_time containment systematically over-attributes cost to whichever step was active at prompt time. **Rule: allocate each root run's total_cost proportionally across all step intervals its [start_time, start_time + duration) window overlaps, by wall-clock overlap fraction; window portions outside every known interval go to the unjoined tail; a run contained in one interval degrades exactly to the single-interval rule.** Equally deterministic (pure arithmetic), explainable ("cost split by time spent in each step"), and handles turn-spans-transition boundaries correctly.
- All other gate entries (4) routed auto — no resolutions needed.
