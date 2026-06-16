PERSPECTIVE: test-quality
VERDICT: APPROVE
FINDINGS:
- [NOTE] ac-06 zero-write test is genuinely load-bearing, not gameable. It (a) seeds a real telemetry line (run_seed.jsonl) so a stray append WOULD register as a delta, (b) resolves the actual `kpi` leaf object and asserts `typeof runFn === 'function'` before invoking, (c) `await`s the real `run({ args: { json: true }, ... })` with `--json` (the path that does `process.stdout.write` of the payload), and (d) compares `telemetryLineCount` before/after for equality. telemetryLineCount counts non-blank JSONL lines across all `*.jsonl` in the dir, so any append by the leaf would break `after === before`. The only way to "pass" while writing is if the leaf wrote to a different dir — but the leaf runs in the chdir'd temp cwd, so that escape is closed. Verified leaf is read-only in telemetry.ts:221-232 (no emit/write call).
  File: packages/luca-cli/src/commands/telemetry.test.ts:90-114
  Cross-phase: false
- [NOTE] Outcome KPI math expectations are independently derived, not impl echoes. lowConfidenceRatio asserts SIMPLE=0.25 from (1 low / 4 total) and MODERATE=2/6 written as `2 / 6` (the arithmetic, not a magic literal) — outcome-kpi.test.ts:209-211. meanReworkIterations asserts SIMPLE=2 (two negative checks/verify records) and MODERATE=0.5 ((1+0)/2) — :233-235. reEntryRate SIMPLE=1, MODERATE=0.5 — :241-243. These are hand-computed from the fixture, so an off-by-one or wrong denominator in the impl (e.g. dividing rework by sampleSize vs reworkCounts.length, or counting positive valence) would fail. Confirmed impl uses `reworkSum / acc.reworkCounts.length` and `reEntryPhases / acc.sampleSize` (outcome-kpi.ts:259-264), matching the distinct denominators the two tests pin.
  File: packages/luca-core/src/telemetry/outcome-kpi.test.ts:206-243
  Cross-phase: false
- [NOTE] STALLED-not-first-pass IS asserted as a discriminating case. 02-bar writes verify status STALLED, 03-baz writes PASS, and ac-02 asserts MODERATE firstPassVerifyRate === 0.5 (:218-219). If STALLED were mis-counted as first-pass the value would be 1.0, so the assertion is the negative anchor. Note the impl's "lowest-wave" semantics (docstring outcome-kpi.ts:13-15) are not exercised by readVerificationResult, which reads a single verify.json record and only checks `status === 'PASS'` (verification-result.ts:64-84, outcome-kpi.ts:220-223) — the test correctly tracks the SHIPPED behavior (single-record status check), so this is a doc/test-name aspiration, not a coverage defect.
  File: packages/luca-core/src/telemetry/outcome-kpi.test.ts:214-220
  Cross-phase: false
- [NOTE] slug:null→unattributed and pr-outcomes exclusion are each independently anchored against mis-bucketing. ac-12.2 (:246-251) asserts unattributed.records === 1 AND that the null record's negative valence did not move MODERATE meanReworkIterations off 0.5 — if the null record were bucketed it would change the denominator/sum. ac-13 (:253-257) plants a negative checks record for 01-foo in pr-outcomes.jsonl and asserts SIMPLE meanReworkIterations stays 2 (would be 3 if read), so the exclusion at outcome-kpi.ts:117 is genuinely guarded. The "orphan slug not in roadmap" path is also covered (:259-265, unattributed.phases===1).
  File: packages/luca-core/src/telemetry/outcome-kpi.test.ts:246-265
  Cross-phase: false
- [NOTE] finalize body-token test follows the project idiom correctly. It imports `finalizeMode` and probes `finalizeMode.instructions` — the RENDERED template-literal body (finalize.ts:528,559), not the source markdown file — so the probe exercises the materialized body. The describe block is NAMED ('finalize outcome-kpi persistence directive') and each per-token test is named with its token, so there is no anonymous/`-t` vacuous trap (G-DX-003 clear). Tokens (telemetry kpi, metric:outcome-kpi-, muninn_remember_batch, luca-monorepo, meanReworkIterations, reEntryRate) match the directive's load-bearing nouns.
  File: packages/luca-tools/src/artifacts/modes/finalize.test.ts:17-32
  Cross-phase: false
- [NOTE] Edge-coverage gap (non-blocking): the `confTotal === 0 ? 0` and `verifyPhases === 0 ? 0` false-arms (division-by-zero guards, outcome-kpi.ts:253-262) are never asserted with a LIVE bucket — every fixture phase writes confidence+verify, so a bucket with zero confidence decisions or zero verify records is untested. The CLI test exercises the empty-roadmap path (no buckets at all) but not a populated bucket missing one source. All-null telemetry (records present but slug:null) is partially covered by ac-12.2. Suggest adding one phase whose only artifact is verify.json (no confidence.jsonl) to pin lowConfidenceRatio===0 for a live bucket. Advisory only — the guards are simple ternaries and the empty-bucket path is covered elsewhere.
  File: packages/luca-core/src/telemetry/outcome-kpi.test.ts:136-204
  Cross-phase: false

CONSOLIDATED:
  MUST_FIX_COUNT: 0
  SHOULD_FIX_COUNT: 0
  NOTE_COUNT: 6
  CROSS_PHASE_COUNT: 0
