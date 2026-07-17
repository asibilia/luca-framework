# Execute Summary — trace-insights-p3-ledger-join

2 waves, status: **success**. Branch `dad-xstate-migration`. Changes in working tree (commits stage-gated; land at finalize alongside phase-01 fix commits).

## What changed

- **Stage A5 — Ledger join (deterministic, per-repo)**: binding join key = trace cwd (repo) + wall-clock overlap against per-step intervals; intervals from ledger `mode-transition` consecutive-timestamp deltas (primary, the currently-real source) with telemetry `mode.start`/`mode.end` preferred when it yields ≥1 interval for the repo; degraded tuple `(runId: null, pipelineStep, slug|null, wave: null)` with slug from nearest slug-bearing telemetry record, else explicit "attribution unavailable"; graceful per-repo skip (no checkout / no .luca/ / no intervals → reason-coded, feeds the tail).
- **Cost allocation (gate-research resolution, supersedes plan's single-interval rule)**: each root run's total_cost split proportionally across all step intervals its [start_time, start_time + duration) window overlaps, by wall-clock overlap fraction; out-of-interval window portions → unjoined tail; single-interval containment is the degenerate case.
- **Three consumer-named aggregates**: `costByPipelineStep`, `costByPhase`, `reviewIterationsVsCost` → Stage D Pipeline Attribution; review-loop >2 iterations → Stage B pool rule 7; joined tuple → Stage C subagent prompt context (step-level `luca_surface` attribution).
- **Stage D — Pipeline Attribution section**: per-step + per-phase dollar tables, review-convergence cost trajectory, `#### Unjoined traces` tail with per-reason breakdown, never silently dropped.
- **Privacy**: ledger/telemetry-derived strings bound to the existing Privacy caps/secret-scan rules.
- **Tests**: new `describe('ledger-join')` — 10 section-unique full-string anchors; Pipeline Attribution added to report-sections block.

## Verification

- ac-01…ac-16 probes all pass (ac-14 stale-literal removal confirmed at 0); anti-01…anti-04 hold (anti-04 cursor count = 4).
- Gates: tsc exit 0; skill test file 47 pass/0 fail; `bun test packages/luca-tools` 74 pass/0 fail.

## Intended commits (deferred to finalize)

1. `feat(luca-tools): trace-insights P3 — Stage A5 trace↔ledger join` (index.ts)
2. `test(luca-tools): pin trace-insights P3 ledger-join anchors` (index.test.ts)

## Deviations

- Proportional cost allocation applied per Confidence Gate resolution (no ac probe pinned the superseded containment rule — zero conflicts).
- Commits deferred: stage-gate blocks bash-commit in EXECUTING for orchestrator and subagents this run; phase-01 fix commits are also pending in the same tree (staged P2 base + unstaged P3 edits on the same two files — finalize must land P2 fix commits and P3 commits in order).
