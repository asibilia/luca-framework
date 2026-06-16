# Plan Review — Phase 4: outcome-kpi-persistence

## Iteration 1 — NEEDS_REVISION (1 blocking + 4 advisory)
- **G-CRIT-001 (BLOCKING)**: ac-06 read-only probe vacuous — file-scoped `grep appendTelemetry|runWriteHandler telemetry.ts` is unsatisfiable (both symbols already present via emitCommand/prOutcomeCommand). Fixed → behavioral probe (invoke kpi leaf run() on temp cwd, assert telemetry JSONL line count unchanged).
- **G-DX-001 (advisory)**: citation drift — metric:* write is Step 2 ~line 134 (`metric:shadow-debt-scan`), not Step 1; emit/new-run live in telemetry.ts not cli.ts. Fixed.
- **G-SCOPE-001 (advisory)**: first-pass semantics underspecified — verify.json is per-WAVE. Fixed → first-pass = lowest-wave record status==PASS; FAIL/STALLED = not-first-pass; fixture exercises STALLED.
- **G-DX-002 (advisory)**: weak ac-03 token grep → strengthened to behavioral bucket assertion (NN-foo/SIMPLE lands in SIMPLE bucket).
- **G-SCOPE-002 (advisory)**: anti-02 (no muninn_feedback) traces to milestone hard-constraint — kept.

Deferral verdict: ACCEPTABLE-WITH-GATE (the 2-KPI MVP deferral was technically justified + correctly handled).

## Iteration 2 — PASSED / CONVERGED
0 blocking, 0 advisory. ac-06 behavioral/leaf-scoped/single-binary; citations accurate (finalize.ts:134); ac-02 deterministic; ac-03 non-vacuous; ac-ID stability preserved (probe changes only); Deliverables map to live ac-IDs; atomicity/deps sound.

## Confidence Gate Resolutions
Gate counts: auto=3, research=0, ask=1.

- **kpi-compute-home** [auto, high] — New read-only `luca telemetry kpi --json` plain citty leaf → pure tested luca-core fn `computeOutcomeKpis` (not a write-surface mutation handler). Proceed as planned.
- **kpi-data-source** [auto, high] — Source KPIs from per-phase artifacts (confidence.jsonl bucketable; verify.json coarse first-pass); slug→complexity via roadmap[].name suffix match. Proceed as planned.
- **kpi-persist-shape** [auto, medium] — One `metric:outcome-kpi-<version>-<complexity>` per bucket via `muninn_remember_batch` to repo vault `luca-monorepo`, wired as finalize.ts BODY directive. Proceed as planned.
- **kpi-scope-mvp-vs-full** [ask, low → RESOLVED] — **User answer: FULL — instrument all 4 KPIs.** This is a REDIRECT away from the architect's MVP-defer-2 recommendation and EXPANDS scope. Resolution: do NOT defer mean-rework-iterations + re-entry-rate; add producer-side per-phase iteration capture so all 4 KPIs bucket by complexity. Requires a PLAN AMENDMENT (append-only ac-IDs + new tasks for the producer-side instrumentation and the 2 now-in-scope telemetry-sourced KPIs); the deferral tasks (1.2.3 / ac-08.x) are repurposed from "document the gap" to "ship the capture". Loop plan-review → plan to amend, then re-review, then execute.
