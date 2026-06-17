PERSPECTIVE: simplification
VERDICT: APPROVE

FINDINGS:
- [SHOULD-FIX] Module-header JSDoc over-describes verify logic that does not exist. Lines 13-15 claim verify.json holds "per-WAVE records" and first-pass is "the LOWEST-`wave` verify record has `status == 'PASS'`". The implementation reads a SINGLE `VerificationResult` via `readVerificationResult` (verify.json is one record per phase, overwritten per wave — see verification-result.ts:4-5,59-84) and simply checks `verify.status === 'PASS'` (outcome-kpi.ts:220-224). There is no multi-record / lowest-wave selection anywhere. The comment describes machinery that isn't (and can't be) implemented against this storage shape — pure documentation bloat that will mislead a future reader into looking for a wave-sort that doesn't exist.
  File: packages/luca-core/src/telemetry/outcome-kpi.ts:13-15
  Suggestion: Replace the "per-WAVE records ... LOWEST-`wave` verify record" prose with the actual rule: "verify.json (single per-phase result) → firstPassVerifyRate: a phase is first-pass when its verify.json status == 'PASS'." The code is already correctly simple; only the comment is inflated.
  Cross-phase: false

- [NOTE] The `kpi` CLI leaf computes the full KPI payload unconditionally, then on the non-`--json` path discards it and prints a static "Use --json" hint (telemetry.ts:222-231). Harmless (compute is a cheap read), but the work is wasted when `--json` is absent. Optionally guard the `computeOutcomeKpis` call behind `args.json`, or have the non-json branch print a one-line bucket summary so the compute isn't thrown away.
  File: packages/luca-cli/src/commands/telemetry.ts:222-231

- [NOTE] Unattributed-record bookkeeping (the `slugsWithOutcomeRecords` set + two `.delete(slug)` calls at lines 205/228 + the trailing loop at 245-247) carries incidental complexity, but it correctly distinguishes three real cases (slug → attributed phase, slug → unattributed phase dir, slug → no phase dir at all). Not over-abstraction — leaving as-is is fine. No change required.
  File: packages/luca-core/src/telemetry/outcome-kpi.ts:194-247

VERIFIED-CLEAN (anti-sycophancy evidence):
- NO duplicated JSONL parsing. computeOutcomeKpis reuses `readTelemetry` (outcome-kpi.ts:118 → telemetry.ts:185-239) rather than hand-rolling line splitting/JSON.parse.
- NO reimplementation of confidence aggregation. Uses `readConfidenceJournal` + `getConfidenceSummary` (outcome-kpi.ts:213-216 → confidence-journal.ts:104-119); `acc.confLow/confTotal` read directly off the returned ConfidenceSummary {low,total}.
- NO reimplementation of verify reading. Uses `readVerificationResult` (outcome-kpi.ts:220 → verification-result.ts:59-84).
- step-set coherence: REWORK_STEPS {checks,verify} (outcome-kpi.ts:90) matches the JSDoc at line 54 and deliberately excludes `review`, consistent with the lu skill body's step enum (skills/lu/index.ts:117,124-126). meanReworkIterations (count of negative checks/verify records) and reEntryRate (phases with ≥1 negative record of any step) are genuinely distinct metrics, not redundant.
- NO dead code in the new module; the single PR_OUTCOMES_RUN_ID exclusion is exercised (outcome-kpi.test.ts:253-257).
- finalize.ts prose body (lines 126-154) is concise — single compute call, one batched persist, explicit skip rule for empty buckets; no redundant restatement. lu/index.ts FORWARD-ONLY note (line 120) is a single paragraph, not bloat.

CONSOLIDATED:
  MUST_FIX_COUNT: 0
  SHOULD_FIX_COUNT: 1
  NOTE_COUNT: 2
  CROSS_PHASE_COUNT: 0
