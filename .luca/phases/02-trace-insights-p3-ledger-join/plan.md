---
id: trace-insights-p3-ledger-join
title: Trace-insights P3 — LangSmith trace ↔ Luca ledger join
trace_id: TI-P3
complexity: MODERATE
waves:
  - wave: 1
    tasks: [t1, t2, t3, t4]
  - wave: 2
    tasks: [t5]
---

# Trace-insights P3 — Ledger Join

## Objective

Join LangSmith traces against per-repo `.luca/ledger.jsonl` + `.luca/telemetry/<runId>.jsonl` at analysis time so trace analysis is pipeline-aware: real-dollar cost per pipelineStep/phase, review-loop outliers, stronger `luca_surface` attribution, explicit unjoined-trace tail. Same 2-file shape as P2: skill body + regression test only.

## Context

- Base = post-P2 working tree: `packages/luca-tools/src/artifacts/skills/trace-insights/index.ts` (303 ln) + `index.test.ts` (275 ln). Body is escaped template literal — keep parseable.
- Ledger schema `{timestamp, runId, event, data}` (`packages/luca-core/src/ledger/schemas.ts`); real ledger holds ~350 `mode-transition` rows (timestamps + `{from,to}` only — no runId/slug/wave) → consecutive-timestamp deltas from these rows are the currently-real primary step-interval source.
- Telemetry v:1 `{v:1, ts, runId, kind, phase, slug, wave, ...}`; real files contain ZERO `mode.start`/`mode.end` records (schema-union only; emitter died with luca-mastracode). Kinds that DO exist (`wave.start`/`wave.end`, `review.iteration`, `signal.satisfaction`) carry `slug` — that is the slug source for per-phase attribution.
- Traces carry no runId (`CC_LANGSMITH_METADATA` static per session) → join is analysis-time only: cwd + timestamp interval containment. `thread_id` demoted from the key — no named consumer (was dead field). Zero coupling to the tracing plugin.

## Design decisions (binding)

- Join lives in Stage A as new `### A5. Ledger join (deterministic, per-repo)` — script-computed like A3, zero LLM reads. No new CLI flag: join runs automatically, degrades gracefully.
- **Join key (binding)**: repo from trace cwd (A3 attribution) → local checkout at that path → build pipelineStep intervals. **Interval source order**: prefer telemetry `mode.start`/`mode.end` pairs WHEN they yield ≥1 step interval for the repo; otherwise (the currently-real case — zero such records exist in any real file) fall back per-repo to ledger `mode-transition` consecutive-timestamp deltas (interval = [row N ts, row N+1 ts), step = `to`). A root run joins when its repo's checkout is local AND its `start_time` falls inside a step interval.
- **Degraded tuple (ledger-fallback path, binding)**: ledger rows carry no runId/slug/wave → the Stage C tuple is `(runId: null, pipelineStep, phase slug | null, wave: null)`. Phase slug (also feeding `costByPhase`) comes from the nearest-in-time slug-bearing telemetry record (`wave.*`, `review.iteration`, `signal.satisfaction`) within the same interval; when none exists, per-phase attribution for that interval is marked unavailable with an explicit note in Pipeline Attribution.
- Cost allocation rule: a joined root run's full `total_cost` goes to the single step interval containing its `start_time` — no proportional splitting across intervals.
- Missing local checkout, missing `.luca/`, or unreadable files → skip the join for that repo with a note in the report; never abort. Traces that fail to join go to the unjoined tail, never silently dropped.
- Every A5 output names its consumer: `costByPipelineStep` + `costByPhase` + `reviewIterationsVsCost` → Stage D Pipeline Attribution tables; per-phase `review.iteration` count → Stage B pool rule 7; joined `(runId, pipelineStep, phase slug, wave)` tuple (nullable fields per the degraded-tuple rule above) → Stage C prompt context. No dead fields.
- Privacy: ledger/telemetry `data`/`meta` strings are a NEW data source quoted into existing write surfaces — bind to the existing Privacy paragraph: same 300-character cap and secret scan; step/slug/runId identifiers are safe, free-form detail strings are quote-capped.

## Tasks

### Wave 1 — Body + tests (serial: same 2 files, chained deps)

- [ ] **t1 — Stage A5 ledger join** in `index.ts`: add the A5 subsection implementing the binding join key, interval derivation (ledger `mode-transition` deltas primary today; telemetry `mode.start`/`mode.end` preferred when it yields intervals), the degraded-tuple rule, cost-allocation rule, graceful per-repo skip, and the three aggregate outputs with consumer stages named inline. Script-computed, zero LLM reads, consistent with A3.
  - Files: `packages/luca-tools/src/artifacts/skills/trace-insights/index.ts`
  - Verification: ac-01, ac-02, ac-03, ac-04, ac-05, ac-06, ac-07

- [ ] **t2 — Stage B rule 7 + Stage C enrichment** in `index.ts`: add pool rule 7 (joined phases whose review loop exceeded 2 iterations enter the deep-read pool) and a Stage C "Pipeline context (joined traces only)" prompt block carrying the joined runId/pipelineStep/phase/wave tuple so `luca_surface` can name the exact step/skill.
  - Files: `packages/luca-tools/src/artifacts/skills/trace-insights/index.ts`
  - Verification: ac-08, ac-09
  - Dependencies: t1

- [ ] **t3 — Stage D + privacy + Notes** in `index.ts`: add `### Pipeline Attribution` report section (per-step and per-phase dollar tables, review-convergence cost trajectory, `#### Unjoined traces` tail with counts + reasons), extend the Privacy paragraph with the ledger/telemetry binding, rewrite the stale "is P3" Notes line, and update the `defineSkill` description to mention the join.
  - Files: `packages/luca-tools/src/artifacts/skills/trace-insights/index.ts`
  - Verification: ac-10, ac-11, ac-12, ac-13, ac-14
  - Dependencies: t2

- [ ] **t4 — Regression tests** in `index.test.ts`: add a new `describe('ledger-join', ...)` block pinning the P3 anchors (join-key literal, mode.start/mode.end, graceful-skip literal, all three aggregate names, pool rule 7 literal, Stage C context literal, unjoined-tail literals, privacy binding literal) with section-unique full strings — never presence-anywhere tokens; extend `report-sections` with the Pipeline Attribution header. All P2 blocks stay untouched.
  - Files: `packages/luca-tools/src/artifacts/skills/trace-insights/index.test.ts`
  - Verification: ac-15, ac-16, ac-17, anti-03
  - Dependencies: t3

### Wave 2 — Gates (serial)

- [ ] **t5 — Gates**: run typecheck and bounded tests; run the anti-criteria greps to confirm P2 surfaces survived.
  - Files: none (verification only)
  - Verification: ac-17, ac-18, ac-19, anti-01, anti-02, anti-04
  - Dependencies: t4

## Deliverables

- **D1**: Join mechanics — Stage A extension keyed on cwd + timestamp interval containment → ac-01, ac-02, ac-07
- **D2**: Graceful degradation when local checkout/ledger missing → ac-03
- **D3**: New aggregates — cost per pipelineStep, cost per phase, review-iterations vs cost → ac-04, ac-05, ac-06
- **D4**: Outlier pool addition — >2-review-iteration phases become deep-read candidates → ac-08
- **D5**: Findings enrichment — joined phase/step context in Stage C subagent prompts → ac-09
- **D6**: Report additions — Pipeline Attribution section + explicit unjoined-trace tail → ac-10, ac-11, ac-12
- **D7**: Privacy binding for the new ledger/telemetry data source → ac-13
- **D8**: Body-regression tests extended → ac-15, ac-16, ac-17
- **D9**: tsc clean → ac-18

## Verification Criteria

All greps run from repo root; `SKILL=packages/luca-tools/src/artifacts/skills/trace-insights/index.ts`, `TEST=packages/luca-tools/src/artifacts/skills/trace-insights/index.test.ts`.

- **ac-01**: `grep -c "### A5. Ledger join (deterministic, per-repo)" $SKILL` returns ≥1.
- **ac-02**: `grep -c "Join key (binding)" $SKILL` returns ≥1.
- **ac-03**: `grep -c "skip the join for that repo with a note" $SKILL` returns ≥1.
- **ac-04**: `grep -c "costByPipelineStep" $SKILL` returns ≥1.
- **ac-05**: `grep -c "costByPhase" $SKILL` returns ≥1.
- **ac-06**: `grep -c "reviewIterationsVsCost" $SKILL` returns ≥1.
- **ac-07**: `grep -c "mode.start" $SKILL` returns ≥1.
- **ac-08**: `grep -c "review loop exceeded 2 iterations" $SKILL` returns ≥1.
- **ac-09**: `grep -c "Pipeline context (joined traces only)" $SKILL` returns ≥1.
- **ac-10**: `grep -c "### Pipeline Attribution" $SKILL` returns ≥1.
- **ac-11**: `grep -c "#### Unjoined traces" $SKILL` returns ≥1.
- **ac-12**: `grep -c "never silently dropped" $SKILL` returns ≥1.
- **ac-13**: `grep -c "same 300-character cap and secret scan" $SKILL` returns ≥1.
- **ac-14**: `grep -c "per-phase dollar attribution is P3" $SKILL || true` outputs `0` on stdout.
- **ac-15**: `grep -c "describe('ledger-join'" $TEST` returns ≥1.
- **ac-16**: `grep -c "### Pipeline Attribution" $TEST` returns ≥1.
- **ac-17**: `timeout 120 bun test packages/luca-tools/src/artifacts/skills/trace-insights/index.test.ts` exits 0.
- **ac-18**: `bunx --bun tsc --noEmit` exits 0.
- **ac-19**: `timeout 120 bun test packages/luca-tools` exits 0.

### Anti-criteria (regression guards)

- **anti-01**: MUST NOT — remove or rename the Stage E heading; probe: `grep -c "## Stage E — GitHub issue feed" $SKILL` returns ≥1 after t1–t4 land.
- **anti-02**: MUST NOT — remove or rename the Stage F heading; probe: `grep -c "## Stage F — Memory persistence" $SKILL` returns ≥1 after t1–t4 land.
- **anti-03**: MUST NOT — drop P2 test anchors; probe: `grep -c "describe('memory-persistence'" $TEST` returns ≥1 after t1–t4 land.
- **anti-04**: MUST NOT — alter the pinned vault routing table; probe: `grep -c "metric:trace-insights-cursor" $SKILL` returns ≥4 (current count 4: table row + cursor prose ×3 — routing-row deletion now detectable) after t1–t4 land.

## Risks & Mitigations

- **Cost misallocation** for long root runs spanning step boundaries → documented single-interval rule (start_time containment); ambiguous/uncontained runs go to the unjoined tail, not a guessed step.
- **Telemetry step-interval source empty in reality** — zero `mode.start`/`mode.end` records in any real file (emitter dead); a telemetry-primary design would silently no-op → ledger `mode-transition` deltas are the working primary; telemetry path gated on "yields ≥1 interval per repo", forward-compat only.
- **Ledger rows carry no runId/slug/wave** → degraded-tuple rule: nullable fields, slug via nearest slug-bearing telemetry record, explicit "attribution unavailable" note when none — never guessed.
- **Template-literal escaping** breaking the TS file → ac-18 gate; keep new backticks escaped as in existing body.
- **Test anchor collision** with pre-existing generic tokens → t4 mandates section-unique full-string anchors per baked-in P1/P2 learning.

## Decisions

- 2026-07-16 — Join keyed on cwd + time-window + thread_id (traces carry no runId); analysis-time join, zero plugin coupling.
- 2026-07-16 — Join placed as Stage A5 deterministic script; no new CLI flag, automatic with graceful per-repo skip.
- 2026-07-16 — Cost allocation = full root-run cost to the step interval containing start_time; no proportional split.
- 2026-07-16 (rev2, G-ARCH-001/002) — Interval source reversed: ledger `mode-transition` deltas primary (verified: 353 rows in real ledger, 0 `mode.start`/`mode.end` in real telemetry); telemetry preferred only when it yields intervals; degraded tuple + slug-from-nearest-telemetry-record specified for the fallback path.
- 2026-07-16 (rev2, G-DX-001) — `thread_id` demoted from join key: no named consumer/output, violated no-dead-fields rule.
- 2026-07-16 (rev2, G-CRIT-001/002) — ac-14 rephrased to stdout-based probe (`|| true`); anti-04 threshold ≥2 → ≥4 (verified current count 4) so routing-row deletion fails the probe.
