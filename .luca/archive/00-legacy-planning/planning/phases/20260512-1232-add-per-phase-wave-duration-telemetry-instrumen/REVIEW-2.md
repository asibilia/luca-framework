# Code Review — Wave 2 (Iteration 2)

**Date**: 2026-05-12
**Complexity**: COMPLEX
**Review Iteration**: 2 / 2
**Commit under review**: `4f7435a86` (iter-1 review fixes)

## Iter-1 Plan Resolution

All 8 items from iter-1 iteration plan are RESOLVED. Verified by all 4 perspectives.

| Item | Status | Verification |
|------|--------|--------------|
| MF-1 assertValidRunId + drop+warn + tests | ✅ | phase-paths.ts:381-422; 8 new tests in telemetry.test.ts |
| MF-2 complete-phase telemetry hook test | ✅ | workflow-state-actions.test.ts:640-711 |
| SF-1 advance-wave test no longer vacuous | ✅ | workflow-state-actions.test.ts:566-612 |
| SF-2 readTelemetry warn includes first error | ✅ | telemetry.ts:259 |
| SF-3 sanitizeLogMessage on warn user-content | ⚠ | All sites except `${p}` at L258 (NEW finding) |
| SF-4 ts uses z.iso.datetime() | ✅ | telemetry.ts:98 |
| SF-5 outer try/catch wrappers removed | ✅ | workflow-state.ts L594/673/817 bare calls |
| Stale L667 comment | ✅ | No stale NOTE found |

## Automated Checks

| Check | Status | Evidence |
|-------|--------|----------|
| tsc | pass | runChecks iteration 6 — 0 errors |
| bun-test | pass | 310/310 passing (last full run in execute) |
| rule gate | pass | 0 findings |

## Code Review Findings — NEW (from iter-1 fixes)

### MUST-FIX (2)

- **[security] Log injection via unsanitized `${p}` in readTelemetry warn (CWE-117)**
  - File: `packages/luca-mastracode/src/state/telemetry.ts:258`
  - Issue: `p` is `TELEMETRY_PATH(runId)` = `join(cwd()/.planning/telemetry, runId+'.jsonl')`. `cwd()` is mutable; adversarial directory name with newlines could split log line and spoof structured entries. Every other warn call site in the file routes user-controlled content through `sanitizeLogMessage` — this one does not.
  - Fix: Wrap `${p}` in `sanitizeLogMessage(p)` on line 258.

- **[dx] "start-phase succeeds even when telemetry writer encounters an error" is vacuous**
  - File: `packages/luca-mastracode/src/__tests__/workflow-state-actions.test.ts:713-737`
  - Issue: Test sets `mockAppendTelemetry.mockReturnValue(undefined)` — the beforeEach default. Exercises zero failure-path behavior. The original test (mock-to-throw) was correctly removed as invalid post-SF-5, but the replacement only proves the mock returns undefined. Provides false confidence signal.
  - Fix: Either (a) mock appendTelemetry to throw (verifies action survives contract violation — the genuine integration-level fail-safe check), or (b) delete entirely and add a cross-reference comment pointing at `telemetry.test.ts:149-164` which carries the real proof.

### SHOULD-FIX (6)

- **[simplification] `isValidRunId` is zombie export** — `phase-paths.ts:370-379`. Zero callers in package post-iter-1. JSDoc on `assertValidRunId` (L389) and `TELEMETRY_PATH` (L428) misdirect callers to a function nothing uses. Fix: remove `isValidRunId` and delete 2 stale JSDoc cross-references.

- **[dx] complete-phase test mock chain undocumented** — `workflow-state-actions.test.ts:640-711`. 4 spies needed; test overrides 2 and relies silently on beforeEach defaults for 2. Fix: add "Mock chain required:" comment listing all 4.

- **[dx] "rejects non-string input" batches 3 distinct inputs** — `telemetry.test.ts:258-262`. Failure output ambiguous. Fix: use `test.each([42,null,undefined])`.

- **[security/dx] `assertValidRunId` JSDoc when-to-use buried in parenthetical** — `phase-paths.ts:381-395`. Add explicit decision rule at top of JSDoc.

- **[simplification] Nested try/catch in `appendTelemetry`** — `telemetry.ts:188-201`. Inner catch is validation pre-check, not error recovery; outer is I/O. Two exception layers for one guard. Fix: add inline comment distinguishing layers OR refactor to boolean guard via new `isCanonicalRunId()` predicate.

- **[security] "returns [] for missing file" test passes for wrong reason** — `telemetry.test.ts:213`. `run_does_not_exist` has 3 underscores → fails strict regex → returns `[]` via invalid-runId catch, not file-not-found path. Fix: use `run_missing_file` (valid canonical) + add explicit invalid-runId test.

### NOTE (10)

- Acceptable: No file-size cap on telemetry log (single-process audit).
- Acceptable: `sanitizeLogMessage` strips `\t` (exceeds CWE-117 minimum).
- Brittle: `warn.mock.calls[0]?.[0]` argument-position assumption.
- Acceptable: backslash+null+length batched test (semantically related cases).
- Acceptable: 7 module-level spies — none gratuitous.
- Acceptable: 8 assertValidRunId tests have minor consolidation opportunity via `.each`.
- Verified: workflow-state.ts hook sites — zero straggling try/catch wrappers.
- Verified: telemetry.ts imports — `isValidRunId` cleanly removed from imports.
- Verified: integration tests non-redundant with unit tests.
- Verified: pre-mutation snapshot pattern (`.find(r => r.name === priorPhase)`) consistent across both mutating hooks.

## Verdict

**ISSUES_FOUND** — 2 MUST-FIX (both narrow scope, cheap to fix).

## Iteration Plan (for execute iter 2)

1. **MF-1 [security]** `telemetry.ts:258` — wrap `${p}` in `sanitizeLogMessage(p)`. 1-line change.
2. **MF-2 [dx]** `workflow-state-actions.test.ts:713-737` — either mock appendTelemetry to throw + assert action returns success=true, OR delete the test and add `// Real fail-safe contract proven in telemetry.test.ts ("does NOT throw when appendFileSync throws").` comment in its place.
3. **SF cluster (optional, bundle if cheap)**:
   - Remove `isValidRunId` from phase-paths.ts (lines 370-379) and delete stale JSDoc cross-refs at L389 + L428.
   - Add "Mock chain required:" block comment at workflow-state-actions.test.ts:640.
   - Convert "rejects non-string input" + "rejects backslash + null byte + length > 64" to `test.each`.
   - Replace `run_does_not_exist` with `run_missing_file` in telemetry.test.ts:213 + add explicit invalid-runId test.
   - Add inline comment in `appendTelemetry` distinguishing the two try/catch layers.
   - Hoist when-to-use guidance to top of `assertValidRunId` JSDoc.
