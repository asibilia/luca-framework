---
title: "fix fabricated durationMs:50000 placeholder — 5/5 luca:5-review reviewers emit identical round-number; review.md still has stale example"
area: telemetry
created: 2026-05-19
priority: high
source: run-analysis
---

## Task

fix fabricated durationMs:50000 placeholder — 5/5 luca:5-review reviewers emit identical round-number; review.md still has stale example

## Evidence
- `run_mpct9yy0_qfn0vsy5` luca:5-review reviewers: all 5 emit `durationMs: 50000` literally.
- Real durations from invoke→complete deltas: 197s / 199s / 201s / 201s / 202s (~3m 17s–3m 22s).
- This is the exact fabricated-round-number pattern batch-5 was supposed to fix.

## Hypothesis
`review.md` (the outer luca:5-review, not verify) has a stale `durationMs: 50000` example surviving batch-5 fixes — OR the prose directive is positioned outside the spawn-site region the regression test scans.

## Fix
1. Find the offending placeholder in review.md.
2. Replace with `durationMs: Date.now() - ts`.
3. Extend `spawn-site-invariant.test.ts` fabricated-roundnum guard to also scan luca:5-review's region (not just luca:3-verify / inner execute reviewers).
4. Add a parametric test: every reviewer correlationId+complete record across the wave must have **distinct** durationMs values (catches identical-fabrication).
