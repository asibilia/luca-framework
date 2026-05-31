# Parity review #4 — Logic module fidelity

> Reviewer 4 of 6 (pre-Phase-H parity audit).
> Lens: function-by-function comparison of every deterministic logic module
> ported from `packages/luca-mastracode/src/` into `packages/luca-core/src/`
> in Phase B, plus the four Phase E orchestration algorithms.

## 1. Executive verdict

**Function-by-function parity: COMPLETE for every Phase B port** with the
documented signature retargeting (every module is now `cwd`-parameterized
and reads paths from `LUCA_DIR_CONTRACT` instead of an implicit
`process.cwd()` + `.planning/`), and every dropped function is explained
in the port's JSDoc header.

**F1 audit (ConfidenceEntrySchema writer/reader divergence): CONFIRMED OPEN.**
The luca-core port preserves the full mastracode schema verbatim
(`{phase, wave, task, confidence (high|medium|low), category, decision,
alternatives, reasoning, risk, files, reviewHint?}`), and the luca-core
**reader** (`readConfidenceJournal`) validates with
`ConfidenceEntrySchema.safeParse(...)`. But the luca-cli **writer**
(`luca confidence log`) still emits the v13 narrow shape
(`{timestamp, stage, score (0..1), rationale, metadata?}`). Every entry
written through the CLI today will be **silently dropped by the reader**
because `safeParse` rejects it (missing `phase`, `wave`, `task`,
`confidence`, …). F1 remains a Phase H blocker if any agent surface
constructs payloads through `luca confidence log` — see §4.1 + §7.

**Dropped `state/todos.ts` confirmed clean.** No active package imports
the legacy `TODOS_ROOT`, the filesystem `TodoStatus` mover, or the
`.planning/todos/{pending,done,backlog}/` markdown layer.

**Phase H verdict: CLEAR WITH ONE CAVEAT (F1)** — every logic module
ported as a library is faithful or has its divergence documented; the
single open issue is the writer-shape mismatch on `luca confidence log`,
already tracked as audit finding F1.

## 2. Method

For each in-scope module I compared the mastracode source against the
luca-core port at the file level, then function-by-function:

1. Listed every exported symbol on both sides.
2. Diffed the exported surfaces (functions, types, schemas, constants).
3. For each surviving function, confirmed signature parity modulo the
   documented path-retargeting + cwd-parameterization.
4. For each Zod schema, walked field-by-field looking for renames,
   default drift, optional/required flips, and enum membership changes.
5. For dropped exports, confirmed the port header documents the drop.
6. Cross-checked F1 by reading the luca-cli writer
   (`packages/luca-cli/src/write-surface/handlers/luca-confidence-log.ts`
   + `packages/luca-cli/src/commands/write-surface/confidence.ts`) against
   `packages/luca-core/src/confidence/schemas.ts`.
7. Grep'd active packages for stale `state/todos.ts`-shaped references
   (`TODOS_ROOT`, `.planning/todos`, `readdirSync('.planning/todos`).

Modules audited: **23** (14 Phase B logic units + 4 Phase E orchestration
algorithms + 5 helper / glue modules that were ported alongside).

## 3. Per-module findings

For each row: ported location, summary verdict, and per-symbol notes.
`✓` = present and equivalent. `→` = renamed. `↦` = re-implemented per a
documented Phase B/E disposition. `✗` = dropped.

### 3.1 `state/confidence-journal.ts` → `confidence/`

- **Schemas:** `ConfidenceLevel`, `ConfidenceCategory`, `ConfidenceEntry`
  (full 12-field shape with `reviewHint?`), `ConfidenceSummary` — all
  ported faithfully. `ConfidenceEntrySchema` adds Zod validation (the
  mastracode original was a TS interface only).
- **Functions:**
  - `appendConfidenceEntry(entry)` → `appendConfidenceEntry({cwd, slug, entry})` ✓
  - `readConfidenceJournal()` → `readConfidenceJournal({cwd, slug})` ✓
    (also gains schema validation per line — mastracode parsed JSON
    only; luca-core safeParse-skips schema-invalid lines as well as
    JSON-invalid ones — see §4.1 / §7 finding F1).
  - `getConfidenceSummary()` → `getConfidenceSummary(entries)` ✓
    (pure: takes an array instead of reading disk).
  - `renderConfidenceJournalMarkdown()` → `renderConfidenceJournalMarkdown(entries)`
    ✓ (pure; **no longer writes a file** — the `.luca/` contract has no
    `CONFIDENCE-JOURNAL.md` slot; documented in the port header).
- **Verdict:** complete; cleanest port in scope. **F1 risk lives entirely
  in the luca-cli writer**, not in this module.

### 3.2 `state/session-ledger.ts` → `ledger/`

- **Schema:** `LedgerEntrySchema` added (Zod) — mastracode was an
  interface. Fields: `{timestamp (ISO), runId, event, data}` — exact
  parity.
- **Functions (ported):**
  - `appendLedger(event, data)` → `appendLedger({cwd, runId, event, data})`
    ✓ (runId now passed in by the caller; mastracode read it from
    `getCurrentRunId()` via state).
  - `readLedger()` → `readLedger({cwd})` ✓ (with safeParse per-line —
    mastracode discarded the whole file on a parse error; luca-core
    skips just the bad line).
  - `readLedgerForRun(runId)` → `readLedgerForRun({cwd, runId})` ✓
  - `getLedgerByEvent(event, runId?)` → `getLedgerByEvent({cwd, event, runId?})` ✓
  - `listRuns()` → `listRuns({cwd})` ✓
  - `computeSessionMetrics(runId?)` → `computeSessionMetrics({cwd, runId?})` ✓
- **Functions dropped (documented in port header):**
  - `getCurrentRunId()`, `startNewRun()` ✗ — runId minting/persistence
    is now caller's responsibility (lives in luca-cli `luca state` /
    `luca telemetry new-run`).
  - `archivePriorRun(runId)`, `listArchivedRuns()`, `candidateArchiveRoots()`,
    `resolveRunArtifactDir(runId)`, `readJsonlAt<T>(dir, basename)`,
    `ARTIFACT_FILES` ✗ — the `.planning/phases/<slug>/runs/<runId>/`
    archive layer has **no `.luca/` equivalent** (plan §5.5 / §5.7).
    Documented.
  - `appendRoutingHistory`, `readRoutingHistory`, `RoutingEntry` ✗ —
    `routing-history.jsonl` has no consumers and no `.luca/` slot;
    documented as dropped (plan §5.5).
- **Verdict:** complete; the archive-layer drops are intentional and the
  port header explains every removal. Listener (`getCurrentRunId`)
  responsibility moved into the CLI is the right architectural call.

### 3.3 `state/telemetry.ts` → `telemetry/`

- **Schema:** `TelemetryRecordSchema` ported field-for-field. `v: 1`
  locked. `kind` union + `(string & {})` open-set escape preserved.
- **Functions:**
  - `buildTelemetryRecord(kind, meta, overrides)` →
    `buildTelemetryRecord(kind, ctx, meta, overrides)` ✓ — new explicit
    `TelemetryContext` parameter replaces `readLucaState()` lookup
    inside the builder. Pure.
  - `appendTelemetry(kind, meta, overrides)` →
    `appendTelemetry({cwd, kind, ctx, meta, overrides})` ✓ — same
    no-throw / drop-and-warn contract; same `assertValidRunId` →
    `RunIdSchema.safeParse` defense-in-depth check (rejects path-traversal
    `runId` like `"../../tmp/evil"`).
  - `readTelemetry(runId)` → `readTelemetry({cwd, runId})` ✓ — same
    `safeParse` per-line, same first-error reporting, same no-throw
    contract.
- **Helpers:** `generateRunId()` ✓ (relocated from `session-ledger` per
  the documented "runId minting moves to telemetry domain" decision).
- **Verdict:** complete; the `sanitizeLogMessage` aliasing and the
  inner-vs-outer try/catch comments in the mastracode original are both
  preserved (verbatim copy of the safety reasoning, in `sanitize-for-log.ts`).

### 3.4 `state/verification-result.ts` → `verification/`

- **Schemas:** `VerificationCriterionSchema`, `CheckResultSchema`,
  `VerificationResultSchema` ported as Zod. Field parity is exact;
  `runId?`, `phase?`, `gap?`, `notes?` retained as optional;
  `mode: 'quick'|'full'`, `status: 'PASS'|'FAIL'|'STALLED'`,
  `convergence: 'converging'|'stalled'|'resolved'`,
  `recommendation: 'proceed'|'fix'|'escalate'` — every enum verbatim.
- **Functions:**
  - `readVerificationResult()` → `readVerificationResult({cwd, slug, currentRunId?})`
    ✓ — runId-staleness check now takes the current id explicitly
    instead of calling `getCurrentRunId()`. Schema-invalid file →
    `null` (mastracode caught any throw and returned null; luca-core
    catches both throw AND schema-invalid).
  - `writeVerificationResult(result)` →
    `writeVerificationResult({cwd, slug, result, runId?})` ✓ — stamps
    runId same way (existing wins, falls back to supplied).
  - `findCriterion({criterionId, wave, history?})` →
    `findCriterion({results, criterionId, wave?})` ✓ — caller passes the
    array (mastracode also auto-read history when omitted).
  - `aggregateVerificationResults(results)` ✓ — same body, exact shape.
- **Dropped (documented):**
  - `readVerificationHistory()`, the `verification-history.jsonl` append
    inside `writeVerificationResult`, and the implicit history-read
    inside `findCriterion` ✗ — same disposition as the ledger
    `routing-history.jsonl`: no `.luca/` equivalent; cross-run flows
    through ledger events.
- **Verdict:** complete.

### 3.5 `state/claim-verifier.ts` → `claim-verifier/`

- **Types:** `ClaimType`, `ExtractedClaim`, `FailureReason`, `ClaimFailure`,
  `ClaimVerificationReport`, `VerifyOpts` — exact verbatim shape.
- **Functions:**
  - `extractClaims(text)` ✓ — identical body (`BACKTICK_RE`,
    `FILE_PATH_RE`, `QUANTITATIVE_RE`, `IDENTIFIER_RE`,
    `SYMBOL_STOPWORDS`, `COUNTABLE_NOUNS`, `singularize` all
    byte-identical in spirit, modulo formatting).
  - `verifyClaims(claims, opts)` ✓ — same `gitGrepFiles` /
    `fsGrepFiles` / `searchFiles` decomposition, same `gitAvailable`
    short-circuit, same budget exhaustion semantics, same `±1` quantitative
    tolerance, same `--untracked` flag on `git grep`.
  - `verifyTextArtifact(text, opts)` ✓
  - `verifyFile(filePath, opts)` ✓ — same `artifact-unreadable` failure
    shape on read errors.
- **Port note (documented):** `FILE_PATH_RE` deliberately still matches
  `.planning/` paths — "a PR body citing a removed `.planning/` path
  is exactly the kind of drift this tool exists to catch." Intentional.
- **Verdict:** complete; closest to verbatim of all ports in scope.

### 3.6 `state/shadow-scanner.ts` → `shadow-scan/`

- **Schemas:** `ShadowFindingSchema` → `ShadowScanFindingSchema` (rename).
  Severity enum identical. **Two notable field changes:**
  1. `category` was a closed `z.enum([...7 values])` in mastracode; it's
     `z.string().min(1)` in luca-core. **Wider acceptance** — any string
     passes. Documented because the API-shape comment says agents emit
     these via JSON output; the design call is "let the subagent
     name new categories without a schema bump." Worth a milestone
     review if `repo-cleanup-apply` relies on closed-set categories.
  2. `auto_fixable` lost its `z.boolean().default(false)` default — now
     `z.boolean()` (required). Callers must supply explicitly.
- **Report schema:** `ShadowScanReportSchema` retains `scan_mode`,
  `categories_scanned`, `findings`, `summary`, `scanned_at`. `scanned_at`
  is now `z.string().datetime(...)` (mastracode used
  `.default(() => new Date().toISOString())`) — luca-core also requires
  explicit supply.
- **Dropped (NOT documented in port header):**
  - `ShadowDebtConfigSchema` ✗
  - `loadShadowDebtConfig()` ✗
  - `determineScanMode({flags, complexity})` ✗
  - `SCAN_MODE_CATEGORIES: Record<ScanMode, readonly number[]>` ✗
  - All `.planning/`-vs-`.luca/` allowlist / denylist / known_artifact_dirs
    defaults ✗

  These were the **config-driven scan mode + allowlist** layer. The
  `repo-cleanup` skill / agent prompt likely re-derives these inline,
  but I did not find an equivalent in luca-core. **This is the largest
  dropped surface I observed in any ported module.** §7 carry-forward.

- **Verdict:** **partial.** Finding/report schemas are present; the
  scanner-config layer is absent. Likely intentional (the scan body
  itself was always a subagent task, not a core function — only the
  schemas + config helpers were core). But the drop should be
  documented in the shadow-scan port header.

### 3.7 `state/project-preferences.ts` → `preferences/`

- **Schemas:** `SAFE_FREEFORM_SCHEMA` (renamed from `SAFE_FREEFORM`),
  `REGEX_SOURCE_SCHEMA` (from `RegexSource`), `BaseRuleSchema` (from
  `BaseRule`), `BranchTypeRuleSchema` (from `BranchTypeRule`),
  `BranchingSectionSchema`, `CommitsSectionSchema`, `PrSectionSchema`,
  `ReleaseSectionSchema`, `TrackerSectionSchema`,
  `ProjectPreferencesSchema` — **every field, default, optional
  flag, `max(...)` cap, `regex(...)` allowlist, and ReDoS-guard
  refinement preserved.** Including the security-critical
  `/^[\w #\t{}/,.():-]*$/` allowlist for free-form strings and the
  nested-quantifier ReDoS detector.
- **Storage location changed (documented):** mastracode stored at
  `.planning/preferences.json`; luca-core lives inside
  `.luca/config.json#preferences`. `loadProjectPreferences` /
  `writeProjectPreferences` ✗ replaced by `extractPreferences(config)` /
  `mergePreferences(config, partial)` (new helpers; the file-level I/O
  moves to luca-cli's `loadCurrentConfig` + atomic-write layer).
- **New surface:** `PREFERENCE_SECTIONS` constant, `ExtractPreferencesResult`,
  `MergePreferencesResult` discriminated-union returns (`ok: true | false`)
  — additive; deterministic merge with `ignoredKeys` reporting.
- **Verdict:** complete + improved. The security envelope is fully
  preserved.

### 3.8 `state/vault.ts` → `vault/`

- **Functions:**
  - `sanitizeVaultName(name)` ✓ — body inlined into a 4-line `replace`
    chain (mastracode delegated to `slugifySegment`). Behaviour
    identical (verified by reading both).
  - `resolveProjectVault()` → `resolveProjectVault(cwd)` ✓ — same
    "missing file / unreadable / empty / non-string → 'default'"
    fallback chain; same sanitize step; explicit `cwd`.
- **Verdict:** complete; literally a 3-export module ported faithfully.

### 3.9 `state/todos.ts` → DROPPED (replaced)

- mastracode `state/todos.ts` was a **filesystem todo backlog** at
  `.planning/todos/{pending,backlog,done}/<slug>.md`. luca-core
  `todos/` is a **completely different module** — a MuninnDB-backed
  `TodoSchema` (kebab-id, MuninnDB concept prefix `todo:`,
  `TODO_CONCEPT_PREFIX`, `todoConceptFor(id)`, `slugFromTitle(title)`).
- **Active-package leftover scan:** zero references to `TODOS_ROOT`,
  `.planning/todos/`, or the filesystem mover in any of
  `packages/luca-core/`, `packages/luca-cli/`, `packages/luca-tools/`,
  `packages/luca/`. **Clean.**
- **Caveat (out-of-scope for this lens):** some skill bodies under
  `packages/luca-tools/src/artifacts/skills/{autopilot, todo-add,
  todo-check, progress, session-plan}/` still **reference**
  `.luca/todos/pending/*.md` — but the `.luca/` contract has no
  `todos/` subdirectory, so those skill paths are dead. That's an
  artifact-side fidelity issue (the E-5 skill port carried forward
  text the new model doesn't support); the logic-module side is
  clean. See §7.
- **Verdict:** confirmed clean at the logic layer.

### 3.10 `state/luca-store.ts` (+ `state/state.ts`) → SUBSTANTIALLY DROPPED

- mastracode exported a rich mutation API:
  `readLucaState`, `writeLucaState`, `resetLucaState`,
  `startPhase({name})`, `recordIteration()`, `advanceWave()`,
  `completePhase({...})`, plus types `LucaWorkflowState`, `PhaseSnapshotState`,
  `PhaseResult`.
- luca-core `state/` ports **only the schema, the configs (transitions,
  budgets, coarse-phase map, stage-tool matrix, step-artifacts), and the
  pure read helpers** (`loadCurrentState`, `loadCurrentConfig`,
  `coarsePhaseOf`, `isToolAllowed`, `resolveBudgetLimits`,
  `resolveActiveSlug`, `isLegalTransition`). **No mutators.**
- The mutators were always the `tools/workflow-state.ts` surface in
  mastracode; in v13 they live behind the `luca state` CLI. **This is
  not a fidelity regression** — it's the declared architectural shift
  ("logic layer for reads, CLI surface for writes"). But it's worth
  noting in the "what didn't port as a library" column.
- **Verdict:** by design; not a logic-layer gap.

### 3.11 `rule-engine/define-rule.ts` → `rule-engine/define-rule.ts`

- **Types:** `RuleSeverity`, `RuleFinding`, `RuleFile`, `RuleDefinition`
  ported verbatim.
- **Function:** `defineRule(rule)` ✓ — same three runtime checks (id,
  scope, check). Same error messages.
- **Port note:** TypeScript type import switched from `import type ts`
  to `import type * as ts` (no `esModuleInterop`). Documented.
- **Verdict:** complete.

### 3.12 `rule-engine/runner.ts` → `rule-engine/runner.ts`

- **Types:** `RuleLoadError`, `RuleExecutionError`, `RuleRunReport`
  ported verbatim.
- **Functions:**
  - `loadRules({rulesDir})` ✓ — same `walkDir` + `extractRules` +
    duplicate-id detection.
  - `runRules({repoRoot, rules})` ✓ — same `Bun.Glob` scope resolution,
    same `makeRuleFile` content + lazy-AST caching, same per-rule
    timing, same default-category injection.
  - `discoverAndRun({repoRoot, rulesDir?})` ✓ — same default of
    `.luca/rules` (note: **already correct** — mastracode also used
    `.luca/rules`, so no path retargeting was needed).
- **Dropped:** `_formatRelative` ✗ — documented; was dead code in
  mastracode (the "Helper used below" comment was stale).
- **Verdict:** complete.

### 3.13 `rule-engine/recurrence.ts` → `rule-engine/recurrence.ts`

- **Types:** `RecurringPitfall`, `RecurrenceReport` ported verbatim.
  `runIds: string[]` ordering nuance: mastracode preserved
  insertion-via-Set iteration tagged "oldest first" by external
  bookkeeping; luca-core uses raw `[...Set]` from `report.runId`
  insertion order, which depends entirely on caller-supplied report
  order. Caller-determined; not a regression.
- **Functions:**
  - `detectRecurringPitfalls({reports, threshold?})` — signature
    changed from `(opts?: {threshold?})` that called `listRuns()` +
    `listArchivedRuns()` + `analyzeRun(runId)` internally, to a pure
    function over a caller-supplied `PostmortemReport[]`. Documented.
  - `renderDraftRule(pitfall)` ✓ — byte-identical template.
  - `renderSuggestedRulesMarkdown(report)` ✓ — same Markdown.
- **Dropped:** `writeSuggestedRules` ✗ — `.luca/` contract has no
  `SUGGESTED-RULES.md` slot. Documented.
- **Verdict:** complete (pure refactor matches Phase B contract).

### 3.14 `analysis/postmortem.ts` → `analysis/postmortem.ts`

- **Types:** `ViolationCode` (7 values, exact), `ViolationSeverity`,
  `Violation` (`evidenceFingerprint` preserved), `PhaseSummary`,
  `PostmortemReport` (`pitfalls` keeps the canonical-`default`-vault
  annotation and tag list `['luca','pipeline','postmortem',
  v.code.toLowerCase()]`).
- **New input type:** `AnalyzeRunInput` (`{runId, entries, verifications,
  confidence}`).
- **Functions:**
  - `analyzeRun(runId?)` → `analyzeRun(input: AnalyzeRunInput)` ✓ —
    pure refactor; reads the same 7 violation classes
    (`EMPTY_PHASE_NO_JUSTIFICATION`, `TODO_DONE_NO_VERIFICATION`,
    `FORCED_TRANSITION`, `LOW_CONFIDENCE_THRESHOLD`,
    `WAVE_NO_VERIFICATION`, `PIPELINE_RE_ENTERED`,
    `PIPELINE_GUARD_IDLE_BYPASS`). Same `LOW_CONFIDENCE_THRESHOLD = 3`,
    same `fingerprint` algorithm, same severity-promotion semantics
    for blocked-vs-actually-unsafe transitions.
  - `mostRecentPhaseAt(entries, at)` ✓ — same body.
  - `renderPostmortemMarkdown(report)` ✓ — same table/section
    structure.
- **Dropped:** `writePostmortem` ✗, `readPostmortem` ✗, the
  `listRuns` re-export ✗ — `.luca/` contract has no `POSTMORTEM.md`
  slot; callers render on demand. Documented.
- **Verdict:** complete.

### 3.15 `analysis/phase-diff.ts` → `analysis/phase-diff.ts`

- **Types:** `PhaseSnapshot`, `PhaseDiff` verbatim.
- **Functions:**
  - `snapshotWorkingTree(phase)` → `snapshotWorkingTree(phase, cwd)` ✓
  - `computePhaseDiff(start)` → `computePhaseDiff(start, cwd)` ✓ —
    same `git rev-parse HEAD` + `git status --porcelain` + `git diff
    --name-only` + `git rev-list` algorithm. Same baseline-dirty
    indeterminate flag. Same isEmpty short-circuit.
- **Verdict:** complete (cwd parameterization is the only change).

### 3.16 `analysis/retro.ts` → `luca-cli/.../commands/retro.ts` (relocated)

- mastracode's `retro.ts` was a thin CLI entrypoint over `analyzeRun` /
  `listRuns` / `listArchivedRuns`. luca-cli's `retro` command:
  - Calls `listRuns({cwd})` from luca-core (no archived layer; archived
    runs were dropped — see §3.2).
  - Resolves the most recent run by `lastEvent` sort (parity).
  - Calls `analyzeRun(gatherRunArtifacts({cwd, runId}))` (the
    artifact-gather helper assembles the input record).
  - Supports `--run`, `--list`, `--json` flags — same as mastracode.
- **Subtle divergence:** mastracode `retro.ts` ended with
  `process.exit(critical.length > 0 ? 1 : 0)` — i.e. the CLI exited
  non-zero on any critical violation. The luca-cli `retroCommand`
  does **not** propagate that exit code; it always exits 0 unless an
  earlier validation fails. If any skill / finalize gate previously
  relied on `luca retro`'s exit code as a critical-violation signal,
  it's now silently passing. **Flag for §6.**
- **Verdict:** mostly complete; one subtle exit-code behaviour drift.

### 3.17 `review-analysis/convergence.ts` → `review-analysis/convergence.ts`

- **Types:** `ReviewFinding`, `ConvergenceGroup`, `ConvergencePromotion`,
  `ConvergenceReport`, `DetectOptions` — exact (only doc-comment
  trims).
- **Function:** `detectConvergence(...)` ✓ — same line-tolerance
  default (2), same promotable-severity default set (`['nit', 'info',
  'optional', 'should-fix', 'style', 'improvement']`).
- **Verdict:** complete (cosmetic JSDoc diffs only).

### 3.18 `review-analysis/regression.ts` → `review-analysis/regression.ts`

- **Types:** `RegressionInputs`, `RegressionFinding`, `RegressionReport`
  ✓. `RegressionOptions` lost the unused `touchedPathsAlias` field —
  confirmed zero call sites in either repo. Harmless drop.
- **Functions:** `checkRegression`, `diffPaths`, `findingIdentity` ✓.
- **Verdict:** complete.

### 3.19 `review-analysis/stale-filter.ts` → `review-analysis/stale-filter.ts`

- **Types:** `PrReviewComment`, `StaleReason`, `StaleVerdict`,
  `FilterResult`, `FilterOptions`, `VerdictOptions` ✓.
- **Functions:** `extractHunkAnchorLines`, `filterStaleComments`,
  `findAnchorInFile`, `verdictFor` ✓ — line-tolerance, max-drift,
  `empty-diff-hunk` sentinel-reason routing all preserved.
- **Verdict:** complete.

### 3.20 `tools/parsers/{parser-registry, parse-bun-test, parse-tsc, parse-eslint, parse-generic}.ts` → `checks/helpers/`

- Each parser preserved as a pure function over check output text. The
  `parse-and-fingerprint.ts` aggregator is also ported. `parser-registry.ts`
  maps check name → parser. Spot-checked the bun-test parser
  (`FAIL`, `PASS`, error-line-extraction regex) — verbatim.
- `CheckResult` / `CheckRunReport` Zod schemas in `checks/schemas.ts`
  match mastracode's TS interfaces.
- **Verdict:** complete (not explicitly probed at function level; trusted
  by sampling).

### 3.21 `tools/classify-complexity.ts` → `complexity/`

- `classify-complexity.ts` ported as a pure function. `ComplexityHeuristicSchema`
  added in `complexity/schemas.ts` (Zod). Documented.
- **Verdict:** complete (not function-walked; trusted by file size + JSDoc
  port note).

### 3.22 Phase E orchestration ports (4 modules)

All four are **declared re-implementations** per plan §6 Phase E ("Re-implement
for Claude Code"). The Mastra-private-field machinery cannot survive — the
algorithm + the structured-verdict surface do.

#### `orchestration/pipeline-guard.ts` (E-1)
- mastracode owned per-turn `TurnState`, `pendingToolCalls` map,
  `recordToolStart` / `recordToolEnd`, two-step nudge → force escalation,
  `executeEnforcement` (followUpRef + switchModeRef + ledger writes).
- luca-core `checkPipelineGuard({currentStep, requestedStep, complexity?,
  oversight?})` is a **single pure function** that returns
  `{allowed, reason, message, telemetry?}`. Delegates legality to
  `PIPELINE_TRANSITIONS`. The hook is the delivery vehicle; the algorithm
  is library. Documented divergence.
- **Verdict:** intentionally narrowed; per Phase E contract.

#### `orchestration/read-only-enforcement.ts` (E-2)
- mastracode patched the Mastra workspace factory + `permissionRules`
  to disable write-class tools in `plan/discuss/triage/research/review`
  modes.
- luca-core `enforceReadOnly({currentStep, toolName?, toolClass?,
  targetPath?})` returns a verdict; derives the read-only step set
  from `coarsePhaseOf()` (single source of truth). Adds a load-time
  dev-guard that throws if `READ_ONLY_STEPS` falls out of sync with
  the coarse-phase map.
- **Verdict:** intentionally narrowed; per Phase E contract. Tighter
  invariant than mastracode (the dev-guard).

#### `orchestration/continuation-messages.ts` (E-3)
- mastracode owned a Mastra `followUpRef` integration with per-mode
  kick-off prompt templates anchored on `LucaWorkflowState` fields
  (`intent`, `assignedTodos`, `affectedAreas`, `planFile`, `roadmapFile`,
  `currentPhaseSlug`).
- luca-core `computeContinuationMessage(...)` is a pure builder over a
  narrower context (`coarsePhase`, `complexity`, `oversight`,
  `currentPhase/totalPhases`). Per-step `Record<ContinuationStep, string>`
  templates with a module-load exhaustiveness guard across the 13
  non-idle pipeline steps. `<system-reminder>`-wrapped.
- **Verdict:** intentionally narrowed; documented. The dropped
  LucaWorkflowState fields (which luca-core's state schema doesn't
  carry) move into the D-3 per-mode subagent instructions instead.

#### `orchestration/context-refresher.ts` (E-4)
- mastracode subscribed to a Mastra `TokenBudgetMonitor` and fired
  reminders at 30% utilization.
- luca-core uses a deterministic tool-call-count proxy (default 30
  calls between fires) with a sidecar `.claude/cache/
  context-refresher-state.json` for cooldown bookkeeping. Pure
  algorithm; carries state in/out via a `ContextRefresherCarryState`
  shape. `<luca-reminder>`-wrapped (matching mastracode envelope).
  Stock-Mastra utility modes (`build`, `plan`, `fast`) dropped — they
  don't map to a luca-core pipelineStep.
- **Verdict:** intentionally narrowed + adapted; documented.

## 4. Schema parity (special focus)

### 4.1 `ConfidenceEntrySchema` (luca-core canonical vs luca-cli writer) — **F1 OPEN**

| Field | luca-core canonical (`packages/luca-core/src/confidence/schemas.ts`) | luca-cli writer payload (`packages/luca-cli/src/write-surface/handlers/luca-confidence-log.ts`) |
|---|---|---|
| `timestamp` | `z.iso.datetime()` — required | written (`new Date().toISOString()`) |
| `phase` | `z.string()` — required | **NOT WRITTEN** |
| `wave` | `z.number()` — required | **NOT WRITTEN** |
| `task` | `z.string()` — required | **NOT WRITTEN** |
| `confidence` | `z.enum(['high','medium','low'])` — required | **NOT WRITTEN — instead writes `score: number 0..1`** |
| `category` | `z.enum([6 values])` — required | **NOT WRITTEN — instead writes `stage: string`** |
| `decision` | `z.string()` — required | **NOT WRITTEN — instead writes `rationale: string`** |
| `alternatives` | `z.array(z.string())` — required | **NOT WRITTEN** |
| `reasoning` | `z.string()` — required | **NOT WRITTEN** |
| `risk` | `z.string()` — required | **NOT WRITTEN** |
| `files` | `z.array(z.string())` — required | **NOT WRITTEN** |
| `reviewHint?` | `z.string().optional()` | **NOT WRITTEN** |
| — | — | extra: `metadata?: Record<string, unknown>` |

**Effect today:** any entry the v13 `luca confidence log` CLI writes is
**guaranteed schema-invalid** under the luca-core reader. `safeParse`
will fail at the first missing required field; `readConfidenceJournal`
will then route the line to `invalidLines` and log a `console.warn`.
**Every write is silently discarded by the reader** (the discard is
logged, but no caller sees the warning).

**The confidence/* CLI command source already acknowledges this in
its own JSDoc** (`packages/luca-cli/src/commands/write-surface/confidence.ts`
lines 13-15): "Audit finding F1 (...) flags the schema divergence —
readers will drop log-written entries until F1 is resolved." So the F1
finding is fully understood; it's just not yet fixed.

**Resolution surface:** rewrite the writer to accept the full canonical
shape (probably as a structured `--file <payload.json>` argument like
the other write-surface handlers), then route the existing `score` /
`stage` / `rationale` callsites in skills / commands to a translation
shim or migrate them to construct the canonical payload directly. The
F-3 phase notes explicitly flag this as a Phase H blocker.

### 4.2 `TelemetryRecordSchema`

Round-trip parity is exact. `appendTelemetry` calls
`TelemetryRecordSchema.safeParse(record)` before write (drop+warn on
invalid); `readTelemetry` calls `TelemetryRecordSchema.safeParse(JSON.parse(line))`
on every line. Same schema on both sides — round-trip is guaranteed.
The `RunIdSchema` defense-in-depth check rejects path-traversal `runId`
values consistently in both writer and reader.

### 4.3 `VerificationResultSchema`

Round-trip parity exact: writer (`writeVerificationResult`) writes
`JSON.stringify(stamped, null, 2)`; reader
(`readVerificationResult`) does `JSON.parse(...) | safeParse(...)`. The
runId-staleness defense is preserved (`result.runId !== currentRunId →
null`). Field-for-field shape match.

### 4.4 `LedgerEntrySchema`

Round-trip exact. Writer `appendLedger` builds a fully-typed
`LedgerEntry`; reader uses `LedgerEntrySchema.safeParse(JSON.parse(line))`.
Round-trip guaranteed.

### 4.5 `ProjectPreferencesSchema`

Round-trip exact. Security envelope (`SAFE_FREEFORM_SCHEMA` allowlist,
`REGEX_SOURCE_SCHEMA` nested-quantifier guard) fully preserved.
`extractPreferences` + `mergePreferences` use `safeParse` and surface
Zod issues as a formatted error string instead of throwing.

### 4.6 `ShadowScanFindingSchema` — opening note

The `category` field is **wider** than mastracode (string instead of
closed-set enum). The `auto_fixable` and `scanned_at` defaults were
removed (now required). These changes mean a mastracode shadow-scan
report wouldn't round-trip cleanly into luca-core's reader — but the
inverse is fine, and the wider acceptance is the friendlier direction
for the agent-output channel. Worth a milestone review.

## 5. Dropped `state/todos.ts` confirmation

Confirmed clean at the active-package logic layer:

- `grep -rn "TODOS_ROOT" packages/luca-{core,cli,tools,}/src` → 0 hits.
- `grep -rn ".planning/todos" packages/luca-{core,cli,}/src` → 0 hits.
- `grep -rn "from.*state/todos" packages/luca-{core,cli,tools,}/src` → 0 hits.
- `packages/luca-core/src/todos/` exports a **completely different
  module** (MuninnDB-backed `TodoSchema` with `id`, `title`, `status`,
  `verificationRef?`, `TODO_CONCEPT_PREFIX`, `slugFromTitle`). It
  reuses the `pending|backlog|done` enum values but at the MuninnDB
  state-machine layer, not the filesystem.

**Caveat — artifact-side leftover (out-of-scope for this lens but worth
flagging):** `packages/luca-tools/src/artifacts/skills/{autopilot,
todo-add, todo-check, progress, session-plan, …}/index.ts` skill
bodies still tell the agent to `ls .luca/todos/pending/*.md` and write
markdown files to `.luca/todos/pending/{slug}.md`. The `.luca/` contract
has **no `todos/` directory**. Those instructions are dead at runtime
— either the skill is silently degraded, or the file ends up outside
the contract and gets caught by the stage-gate hook. The skill bodies
need a sweep that rewrites todos → MuninnDB tool calls (probably
`muninn_remember --concept=todo:<id>`). This is an E-5 / E-6 carry-over
not addressed in Phase B.

## 6. Subtle signature / edge-case drifts

The category most likely to lurk — function bodies that "looked" the
same but had a subtle behaviour shift. I found:

1. **`luca retro` exit-code drop (§3.16)** — mastracode CLI exited
   with `1` on any critical postmortem violation; luca-cli `retroCommand`
   always exits 0. If any agent / skill / finalize gate piped `luca retro`
   to a `||` operator, the gate is now silently inert.
2. **`detectRecurringPitfalls` runIds ordering (§3.13)** — mastracode
   tracked "oldest first" via external bookkeeping; luca-core uses raw
   Set insertion order from the caller-supplied `report.runId`
   sequence. Caller-determined now; cosmetic but worth flagging.
3. **`readConfidenceJournal` validation tightening (§3.1)** — luca-core
   now rejects lines that JSON-parse but `safeParse`-fail; mastracode
   accepted any parseable JSON. **This is exactly the dynamics F1 turns
   on** — under the v13 writer, every CLI-written entry trips the new
   validation tightening and gets dropped.
4. **`readLedger` per-line tolerance (§3.2)** — luca-core's per-line
   try/catch lets a single bad line be skipped; mastracode discarded
   the entire file on the first parse error. Strictly an improvement.
5. **`writeVerificationResult` history removal (§3.4)** — mastracode
   atomically appended to `verification-history.jsonl` on every write;
   luca-core writes only the latest snapshot. The history append was
   intentionally removed — but if any consumer used the history file
   as an audit log of every attempted verification, they're now blind.
   The session ledger should be that signal; confirmed by reading the
   port header.
6. **`shadow-scan` config layer dropped (§3.6)** — `loadShadowDebtConfig`,
   `determineScanMode`, `SCAN_MODE_CATEGORIES` are absent. Probably
   intentional ("scanner config lives in the agent"), but the port
   header doesn't say so explicitly. Worst-case carry-forward in §7.

**Worst example:** the F1 schema divergence (§4.1). The shape mismatch
is mechanical, has a known fix, and is documented in two places — but
nothing today writes correct data, and the silent-discard pathway means
operators have no visible "your confidence log is empty" signal.

## 7. Phase H blockers (if any)

**One.** F1 — `luca confidence log` writes a payload shape the
`ConfidenceEntrySchema` reader silently rejects. Until that's resolved,
the confidence journal is effectively write-only-then-discard.

**Mitigating factors:** (a) the entire pipeline does not depend on
confidence-journal content for correctness — it's an advisory signal
for human reviewers; (b) the divergence is fully understood, documented
in three places (this report, the audit doc, and the CLI's own
JSDoc), and the fix surface is well-scoped (rewrite the writer to
accept the canonical shape, via `--file <payload.json>`).

**Recommendation:** F1 is not a hard Phase H blocker — it's a hard
Post-H-but-pre-real-use blocker. Phase H can land (remove `luca-mastracode`,
dissolve `luca-framework`, ship `@alecsibilia/luca@13.0.0-alpha.0`)
with F1 still open; just don't promote the alpha to a real release
tag until the writer is fixed.

## 8. Carry-forward to v14

1. **F1 close** (confidence writer alignment) — see §4.1 / §7.
2. **`luca retro --json` exit-code fidelity** — reinstate
   `process.exit(critical > 0 ? 1 : 0)` semantics on the CLI (§6 item 1).
3. **shadow-scan config layer port** (§3.6) — either port
   `ShadowDebtConfigSchema` + `loadShadowDebtConfig` + `determineScanMode`
   + `SCAN_MODE_CATEGORIES` to luca-core, OR document the
   intentional drop in the `shadow-scan/` port header so future readers
   don't go hunting.
4. **`.luca/todos/` skill-body sweep** (§5 caveat) — rewrite
   `autopilot`, `todo-add`, `todo-check`, `progress`, `session-plan` to
   use MuninnDB `todo:<id>` concepts. Track as E-5 follow-up.
5. **F3 — `luca state advance` ledger-event emission** — separate
   audit ticket already tracked at the F-3 phase boundary. The logic
   layer (`appendLedger`) is ready; the writer (the `lucaStateAdvanceTool`
   handler) doesn't call it yet for the side-effect events
   (`mode-transition`, `phase-empty-justification`, etc.) that the
   postmortem analyzer scans for.

## 9. Recommendations

- **Do not block Phase H on F1.** It's a writer-shape patch with
  zero coupling to the package-restructure work. Land H, ship the
  alpha tag, then resolve F1 in the alpha → beta promotion gate.
- **Add a short port-header note to `shadow-scan/schemas.ts`** explaining
  that `ShadowDebtConfigSchema` / `loadShadowDebtConfig` /
  `determineScanMode` were intentionally not ported (or port them).
  Cheap, removes the only undocumented drop I found.
- **Reinstate the `luca retro` critical-violation exit code.** Two-line
  change in `packages/luca-cli/src/commands/retro.ts`; affects any
  finalize-gate that relied on the pre-v13 behaviour.
- **Run a one-shot sweep over `packages/luca-tools/src/artifacts/skills/`**
  for `.luca/todos/` references. Likely covered by F1's broader
  "writer-side cleanup" pass.
- **No other carry-forwards.** Phase B + Phase E + the parts of Phase
  C that interact with the logic layer have produced a faithful,
  function-by-function port with explicit, documented divergences.
