PERSPECTIVE: dx
VERDICT: APPROVE

Cold-isolation DX review of Phase 4 (outcome-kpi-persistence). Reviewed the
working tree (staged/uncommitted). Conventions checked against CLAUDE.md
(Bun, kebab-case, functional/no-classes, schema-first, imports-at-top) and the
established luca-cli leaf pattern (emit / new-run / pr-outcome siblings).

## Evidence verified (APPROVE basis — ≥3 concrete locations)

1. Filenames are kebab-case and match the LUCA_DIR_CONTRACT placement:
   `packages/luca-core/src/telemetry/outcome-kpi.ts` + `.test.ts`,
   `packages/luca-cli/src/commands/telemetry.test.ts`. Verified.

2. New exported fn `computeOutcomeKpis`
   (outcome-kpi.ts:135-143) carries a full JSDoc block (purpose, pure-read
   contract, unattributed-not-dropped behavior); all three exported types
   (`OutcomeKpiBucket`, `OutcomeKpis`, `ComputeOutcomeKpisOptions`) and every
   field are individually documented (outcome-kpi.ts:48-80). No classes —
   functional module with closures (`accumulatorFor`, outcome-kpi.ts:177-192).
   Barrel re-exports the fn + 3 types (telemetry/index.ts:38-43). Verified.

3. `kpi` citty leaf is consistent with siblings: same `defineCommand` shape,
   `--json` boolean flag mirrors classify.ts:52-54 / retro.ts:44-47
   (`type: 'boolean'`, description), `--json` true branch uses the identical
   `process.stdout.write(\`${JSON.stringify(x, null, 2)}\n\`)` idiom as
   classify.ts:68. Registered under `telemetryCommand.subCommands.kpi`
   (telemetry.ts:244). Verified.

4. Cross-call-site signatures all match: `readVerificationResult({cwd,slug})`
   (verification-result.ts:59-63), `readConfidenceJournal({cwd,slug})` +
   `getConfidenceSummary(entries)` returning `{total,high,medium,low,...}`
   (confidence-journal.ts:104-120, consumed at outcome-kpi.ts:213-218).
   `RoadmapPhase.complexity` is `.optional()` (state/schemas.ts:63), so the
   skip-undefined guard (outcome-kpi.ts:149) is correct. Verified.

5. lu body emits use `--slug`/`--complexity` flags that EXIST on the emit leaf
   (telemetry.ts:48,50-53); the three new emits (lu/index.ts:117,183,239) match
   the leaf's flag shape. Verified.

6. finalize body persists to vault `luca-monorepo`, which MATCHES
   `.luca/config.json` `muninn.vault` (config.json:55) — not a drift.
   finalize.test.ts token contract (`luca-monorepo`, `metric:outcome-kpi-`,
   `meanReworkIterations`, `reEntryRate`) is consistent with the rendered body
   (finalize.ts:126-154). Verified.

## Findings

- [SHOULD-FIX] JSDoc-vs-implementation drift on `firstPassVerifyRate`. The
  class-level doc claims the source is `verify.json (per-WAVE records)` and that
  a phase is first-pass when "its LOWEST-`wave` verify record has
  `status == 'PASS'`" (outcome-kpi.ts:13-15). But `verify.json` holds a SINGLE
  `VerificationResult` object (one `wave`/`status`), overwritten on each write
  (verification-result.ts:59-84, write-side comment :87-92), and the impl simply
  reads that one object and checks `verify.status === 'PASS'`
  (outcome-kpi.ts:220-224). There is no per-wave collection and no lowest-wave
  selection. A future maintainer trusting the doc will look for selection logic
  that doesn't exist (and may "fix" a non-bug). Not a correctness issue — the
  computation is right for the actual single-record file.
  File: packages/luca-core/src/telemetry/outcome-kpi.ts:13-15
  Suggestion: Reword to "verify.json (the single, latest VerificationResult for
  the phase) → firstPassVerifyRate: a phase is first-pass when verify.json
  status == 'PASS'." Drop the "per-WAVE records" / "LOWEST-wave" language.
  Cross-phase: false

- [SHOULD-FIX] The non-`--json` path is a dead-end for a human operator. With no
  flag, the leaf prints only "Outcome KPIs computed. Use --json to print the
  full payload." (telemetry.ts:228-231) — it computes the KPIs but shows none of
  them. Every sibling read leaf that supports `--json` ALSO renders a
  human-readable default (classify.ts:72-78 prints complexity + factors;
  retro.ts renders Markdown). A bare `luca telemetry kpi` is the natural
  discovery path and currently rewards the operator with nothing actionable.
  File: packages/luca-cli/src/commands/telemetry.ts:227-232
  Suggestion: In the else branch, render a compact per-bucket summary (one line
  per bucket: complexity, the four ratios, sampleSize) plus the unattributed
  tally, matching the classify/retro default-render convention. Keep `--json` as
  the machine path.
  Cross-phase: false

- [NOTE] `--json` flag has no `alias` and no `default: false`. Siblings vary
  (doctor.ts uses `default: false`; classify.ts/retro.ts omit it, relying on
  citty's undefined→falsy). Current form matches classify/retro, so it is
  internally consistent; an explicit `default: false` would make the
  schema-first intent clearer but is not required.

- [NOTE] The leaf's `run` is declared `async` (telemetry.ts:221) solely for the
  `await loadCurrentState` call (which is genuinely async,
  load-current-state.ts:23) — correct and consistent with prOutcomeCommand's
  async run. No change needed; flagged only to confirm it was checked.

- [NOTE] Imports are top-of-file and grouped (node builtins → workspace/core →
  local), matching import-standards. The kpi module avoids lodash where plain
  reduce/filter is clearer (outcome-kpi.ts:229-251) — acceptable; lodash is a
  preference, not a hard rule, and the arithmetic here reads fine without it.

CONSOLIDATED:
  MUST_FIX_COUNT: 0
  SHOULD_FIX_COUNT: 2
  NOTE_COUNT: 3
  CROSS_PHASE_COUNT: 0
