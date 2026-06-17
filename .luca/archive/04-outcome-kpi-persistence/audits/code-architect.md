PERSPECTIVE: architecture
VERDICT: APPROVE

## Convergence re-review (post review-fix wave) — CONVERGED

Re-verified the working tree after the fix wave addressed my escalated MEDIUM
(vault hardcoding) plus my LOW (doc drift) and a third reviewer's render-path
fix. All three fixes are architecturally correct; no new issues introduced.

- (a) Vault fix — CORRECT. finalize.ts:138 now resolves the vault from
  `.luca/config.json → muninn.vault` (fallback "default") and explicitly
  cross-references Step 1 ("the same vault already resolved at Step 1"); line 142
  uses `vault: "<repo_vault>"`, consistent with every other write in the body.
  Grep confirms ZERO `luca-monorepo` literals remain in finalize.ts.
  finalize.test.ts token contract switched from the literal to `'muninn.vault'`
  with a rationale comment (lines 22-25). Convention restored — the generic mode
  no longer mis-routes KPI metrics in non-luca-monorepo repos.

- (b) `renderOutcomeKpis()` — CLEAN read-only addition (telemetry.ts:239-266).
  Pure formatter (OutcomeKpis -> string, no I/O, no side-effect). The kpi leaf
  computes ONCE (line 225) and feeds both branches; JSON path stringifies, human
  path renders then writes to stdout. ac-06 zero-write invariant holds — both
  paths are compute+stdout only, no telemetry append, no second compute. Sensible
  boundary: the formatter lives in the CLI command (presentation concern), not in
  luca-core's pure-compute module, keeping core free of display formatting. The
  `OutcomeKpis` type import was correctly added (telemetry.ts:20).

- (c) JSDoc fix — comment-only, no logic change. outcome-kpi.ts:13-16 module doc
  and line 220 field comment corrected to "single per-phase VerificationResult" /
  "single verify.json record == PASS". The read at 220-224 is unchanged, so no
  firstPassVerifyRate semantic drift.

No NEW architectural findings. Module boundaries, the deterministic-compute +
LLM-persist split, helper reuse, package-root import discipline, and the v:1
LOCKED schema (untouched) all remain intact. VERDICT stands: APPROVE.

CONSOLIDATED (re-review):
  NEW_MUST_FIX_COUNT: 0
  STATUS: CONVERGED

---

## Initial review (pre-fix)

Cold-isolation architecture review of Phase 4 (outcome-kpi-persistence). Module
boundaries (luca-core compute / luca-cli leaf / luca-tools body), the
deterministic-compute + LLM-persist split, helper reuse, and v:1 schema coupling
were all verified. No correctness or missing-requirement blockers found.

FINDINGS:

- [SHOULD-FIX] Vault name hardcoded in finalize KPI directive diverges from the
  config-resolved-vault convention used everywhere else in the same body.
  finalize.ts line 77 establishes "Vault from `.luca/config.json` → `muninn.vault`,
  fallback `\"default\"`" and the rest of the body uses that resolved vault, but the
  new Outcome KPI directive (lines 138 and 142) hardcodes the literal
  `luca-monorepo`. It is correct for THIS repo (.luca/config.json confirms
  `muninn.vault == "luca-monorepo"`), so it is not a runtime defect, but the
  hardcode breaks the "resolve vault from config" pattern and would silently
  mis-route KPI metrics in any other repo that materializes this body.
  [RESOLVED in fix wave — see re-review (a) above.]
  File: packages/luca-tools/src/artifacts/modes/finalize.ts:138,142
  Suggestion: Mirror Step 1's phrasing — "Persist one memory per complexity bucket
  to the repo vault (from `.luca/config.json` → `muninn.vault`, fallback
  `\"default\"`)" — instead of the `luca-monorepo` literal. Note this would require
  updating the finalize.test.ts token contract (it asserts the literal
  `'luca-monorepo'`); switch that probe to the resolved-vault phrasing.
  Cross-phase: false

- [NOTE] Doc/data-model drift: the outcome-kpi.ts module doc and the
  `firstPassVerifyRate` field comment describe `verify.json` as holding "per-WAVE
  records" and define first-pass via the "LOWEST-`wave` verify record" (lines
  13-17, 51). The actual data model is a SINGLE `VerificationResult` object per
  phase (verify.json is overwritten on each write — see
  verification/schemas.ts:101 "The full verification result for one wave of one
  phase" and verification-result.ts writeVerificationResult, which renames a single
  file). The implementation correctly reads that single record
  (readVerificationResult at outcome-kpi.ts:220-224) and the tests write exactly
  one record per slug, so behavior is correct — but the "per-WAVE / lowest-wave"
  framing implies an array/selection that does not exist and could mislead a future
  maintainer into adding wave-selection logic. Suggest rewording the doc to "the
  phase's single verify.json record (status PASS == first-pass)".
  [RESOLVED in fix wave — see re-review (c) above.]

- [NOTE] Architecture strengths confirmed (anti-sycophancy evidence):
  (1) Pure-read contract honored — outcome-kpi.ts performs only existsSync/
  readdirSync and delegates all parsing to existing readers; no
  appendFileSync/writeFileSync anywhere (verified the full file). The doc's
  "performs NO writes" claim holds.
  (2) Helper reuse over reinvention — readConfidenceJournal/getConfidenceSummary
  (confidence/index.ts:17-23), readVerificationResult (verification/index.ts:17-22),
  readTelemetry (telemetry/telemetry.ts:185), and RoadmapPhase (state/schemas.ts:65)
  are all reused; nothing is re-implemented.
  (3) Clean package-boundary discipline — the CLI imports computeOutcomeKpis and
  loadCurrentState from the `@alecsibilia/luca-core` package root; both flow through
  root barrels (luca-core/src/index.ts:7,17), no deep-path import.
  (4) v:1 LOCKED schema not coupled — compute reads existing top-level slug/
  complexity fields plus meta.source/valence/step via defensive `as {…}` casts
  (outcome-kpi.ts:124-129,229-240), consistent with the schema's "consumers MUST
  ignore unknown fields" forward-read contract. No schema field added/renamed.
  (5) kpi leaf correctly placed under telemetryCommand.subCommands alongside
  emit/new-run/pr-outcome (telemetry.ts:240-245) and proven read-only by ac-06
  (telemetry.test.ts:90-114).
  (6) Token-presence contract for the LLM-prose bodies is genuine — finalize.test.ts
  imports the rendered `.instructions` export (not the source file) and lu/index.ts
  stamps --slug/--complexity on all three signal.satisfaction emits (lines 117,
  183, 239).

CONSOLIDATED:
  MUST_FIX_COUNT: 0
  SHOULD_FIX_COUNT: 1
  NOTE_COUNT: 2
  CROSS_PHASE_COUNT: 0
