# Code Review — Wave 1

**Date**: 2026-05-12
**Complexity**: COMPLEX
**Review Iteration**: 1 / 2

## Requirements Coverage

| Criterion | Status | Evidence |
|-----------|--------|----------|
| New `src/state/telemetry.ts` exports the 5 listed symbols | MET | `telemetry.ts` — appendTelemetry, buildTelemetryRecord, readTelemetry, TelemetryRecord, TelemetryRecordSchema |
| Pipeline run produces `.planning/telemetry/<runId>.jsonl` with phase/wave events | MET | hook sites at workflow-state.ts L596/679/824; 3 wave verification results written into telemetry dir during this run |
| `appendTelemetry` doesn't throw under any failure mode | MET | telemetry.ts:159-180 outer try/catch; telemetry.test.ts:149-166 mocked fs throw test passes |
| `ROOT_WHITELIST_DIRS.has('telemetry')` true | MET | repo-cleanup.ts:99; regression test workflow-state-actions.test.ts:641-644 |
| Existing workflowState action contracts unchanged | MET | all existing tests pass (tsc + bun test green) |
| tsc clean, ≥8–10 new tests | MET | 19 new tests; tsc clean |
| Schema v:1 documented with additive-evolution rule | MET | telemetry.ts:9-19 module JSDoc |

## Automated Checks

| Check | Status | Duration |
|-------|--------|----------|
| tsc | pass | 2.2s |
| bun-test | pass | 0.5s |
| rule-gate | pass | — |

## Code Review Findings

### MUST-FIX (2)

- **[security]** `TELEMETRY_PATH(runId)` path traversal vector — runId reads from `luca-state.json` (user-editable JSON) without validation; a crafted `runId: "../../../tmp/evil"` causes both `appendTelemetry` (write) and `readTelemetry` (read) to resolve outside `.planning/telemetry/`. `isValidSlug`/`assertValidSlug` exists at `phase-paths.ts:148-172` and is called by every other path builder, but `TELEMETRY_PATH` skips this guard — inconsistent with the module's own "single chokepoint" claim.
  - Files: `packages/luca-mastracode/src/util/phase-paths.ts:358-360`, `packages/luca-mastracode/src/state/telemetry.ts:124, 174, 194`
  - Fix: Add `assertValidRunId(runId)` helper in `phase-paths.ts` and call from `TELEMETRY_PATH`. Generator contract is `/^run_[a-z0-9]+_[a-z0-9]+$/` (session-ledger.ts:47-51). Enforce: `/^run_[a-z0-9_]+$/i.test(runId) && !runId.includes('/') && !runId.includes('\\') && !runId.includes('\0') && runId.length <= 64`. Inside `appendTelemetry`, drop+warn on failure (preserves fail-safe contract). Inside `readTelemetry`, return `[]` on failure (preserves no-throw contract).

- **[dx]** No test for `complete-phase` telemetry hook (the hardest hook to get right).
  - Files: `packages/luca-mastracode/src/__tests__/workflow-state-actions.test.ts`
  - Fix: Add a test that mocks `readLucaState` to return a phase with `phaseResults` containing both `startedAt` and `waveStartedAt`, asserts `mockAppendTelemetry` is called with both `'wave.end'` AND `'phase.end'`, and verifies the overrides carry the CLOSING phase/wave (not next-phase). Mock dependencies must let the action bypass diff/verification/straggler guards (or assert on the suppressed path with explicit explanation rather than `if/else`).

### SHOULD-FIX (5)

- **[dx]** `advance-wave` telemetry test is structurally vacuous — verification guard is unmocked so the assertion runs in the "blocked" branch which proves nothing about the hook wiring.
  - File: `workflow-state-actions.test.ts:566-611`
  - Fix: Mock `readVerificationResult` to return `{wave: 1, status: 'PASS', ...}` so the happy path runs and the `wave.end` override assertions are real.

- **[dx]** `readTelemetry` warn message omits Zod errors for schema-invalid lines (asymmetric with the write-path).
  - File: `telemetry.ts:218-223`
  - Fix: Capture first Zod error per file and include in warn message.

- **[security]** Log injection (CWE-117) — `console.warn` emits `parsed.error.message` and `err.message` unsanitized; OS error strings can include the raw runId and CR/LF.
  - Files: `telemetry.ts:164, 179`
  - Fix: `String(err.message ?? err).replace(/[\r\n]/g, ' ').slice(0, 200)` before interpolation.

- **[security]** `ts` field unconstrained.
  - File: `telemetry.ts:92`
  - Fix: `z.string().datetime()` (Zod built-in ISO 8601 strict). Aggregator skill will parse durationMs from these timestamps; malformed values silently produce NaN.

- **[simplification]** Outer `try/catch` wrappers in workflow-state.ts are misleading double-protection. `appendTelemetry` is internally fail-safe by contract; the outer wrappers (3 sites × 3 lines = 9 lines) imply it could throw and diverge from how `appendLedger` is called throughout the same file.
  - Files: `workflow-state.ts:596-600, 678-692, 824-854`
  - Fix: Remove the outer try/catch wrappers. Optional: add a single inline comment "appendTelemetry never throws (see telemetry.ts contract)".

### NOTE (3)

- **[architecture]** Inline comment at `workflow-state.ts:794` says "preState is in scope from L667" but the actual line is now L716 after telemetry hook additions shifted line numbers. Update comment.
- **[dx]** Positional-arg trap: `appendTelemetry('wave.end', {wave: priorWave})` silently puts overrides into `meta`. Add `@example` block to JSDoc.
- **[dx]** `appendTelemetry` JSDoc doesn't explicitly call out behavioral divergence from `appendLedger`/`appendConfidenceEntry` (which throw on failure).

### Optional self-check

Skipping claimVerifier on the review output itself — citations are explicit file:line pairs and have been verified by 4 independent subagents.

## Verdict

**ISSUES_FOUND** — 2 MUST-FIX, 5 SHOULD-FIX, 3 NOTE.

Iteration plan saved to workflow state. Routing back to execute.
