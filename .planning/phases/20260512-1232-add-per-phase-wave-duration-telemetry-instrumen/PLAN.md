# Plan: Per-Phase Wave Duration Telemetry

## Objective

Foundation telemetry for the Wave 1 telemetry program. Instrument `workflowState` phase/wave boundaries to append JSONL records to `.planning/telemetry/<runId>.jsonl`. Ship a stable v:1 writer API + record schema that 4 follow-on telemetry todos consume verbatim.

## Context

See `RESEARCH.md` and `CONTEXT.md`. Three P0 blockers identified in research are folded into the wave plan: (R-1) fail-safe writes, (R-2) `waveStartedAt` state field, (R-3) lifecycle decision (defer to janitor todo). Schema is **locked at v:1** in this commit — additive evolution only.

## Phases

### Phase 5: Wave Duration Telemetry

#### Wave 1: Foundation — schema, path, writer, state field

Tracer bullet: writer is callable end-to-end with state field set. No instrumentation yet — wired in Wave 2.

- [ ] **Task 1.1.1**: Add `TELEMETRY_DIR()` + `TELEMETRY_PATH(runId)` to `phase-paths.ts`
  - Files: `packages/luca-mastracode/src/util/phase-paths.ts` (append after `CONFIG_PATH()` ~L342)
  - Verification: tsc clean; new exports importable.

- [ ] **Task 1.1.2**: Add `waveStartedAt?: string` field to `PhaseResult` interface
  - Files: `packages/luca-mastracode/src/state/luca-store.ts` (L30-47 interface; `startPhase` L213-228; `advanceWave` L262-283)
  - Behavior:
    - `startPhase` (new-phase branch): set `waveStartedAt = new Date().toISOString()` on the new phaseResult.
    - `startPhase` (RESUME branch, existing non-complete phase): **also** reset `waveStartedAt = new Date().toISOString()` on the resumed phaseResult — currentWave resets to 1, so wave timing must reset too.
    - `advanceWave`: update `waveStartedAt` of the current phaseResult to now.
  - JSDoc: document resume semantics on `waveStartedAt` field.
  - Verification: existing luca-store tests pass; new tests assert startPhase (new), startPhase (resume), and advanceWave each set/reset the field.

- [ ] **Task 1.1.3**: Create writer module `src/state/telemetry.ts`
  - Exports: `TelemetryKind`, `TelemetryRecord`, `TelemetryRecordSchema` (Zod), `appendTelemetry(kind, meta?, overrides?)`, `buildTelemetryRecord(...)`, `readTelemetry(runId)`.
  - `appendTelemetry` is fail-safe: try/catch internally; on error → `console.warn('[telemetry] write failed: …')` and drop. Never throws. Validates record via Zod before write; drops malformed with warn.
  - Pattern verbatim from `confidence-journal.ts`: `mkdirSync(dirname(p), {recursive:true})` + `appendFileSync(p, JSON.stringify(rec)+'\n', 'utf-8')`.
  - Reads `runId`, `currentPhaseName`, `currentPhaseSlug`, `currentWave`, `complexity`, `oversight` from `readLucaState()`. `overrides` parameter lets callers patch fields (e.g. `durationMs`) without a second read.
  - JSDoc locks v:1 schema contract: additive evolution only, ignore unknown fields, bump `v:2` for breaking changes.
  - Verification: tsc clean; module imported successfully.

- [ ] **Task 1.1.4**: Writer unit tests `src/__tests__/telemetry.test.ts`
  - Files: new file using Pattern A (chdir + mkdtempSync isolation, mirror `todos.test.ts:9-22`).
  - Tests:
    - `appendTelemetry` creates `.planning/telemetry/<runId>.jsonl` on first call
    - Subsequent calls append (file ends with single `\n` per record)
    - `buildTelemetryRecord` returns correct shape with `v: 1`
    - `readTelemetry(runId)` returns `[]` for missing file; parses lines on hit
    - Malformed records (forced bad input) are dropped with warn; writer doesn't throw
    - `appendTelemetry` doesn't throw when underlying `appendFileSync` throws (mock fs error)
  - Verification: bun test passes (≥6 new tests).

- [ ] **Task 1.1.5**: luca-store tests for `waveStartedAt` lifecycle
  - Files: extend `src/__tests__/luca-store.test.ts` (or create if absent).
  - Tests:
    - `startPhase` (new-phase branch) sets `waveStartedAt` on the new phaseResult
    - `startPhase` (RESUME branch) RESETS `waveStartedAt` on the resumed phaseResult
    - `advanceWave` updates `waveStartedAt` on the current phaseResult (found via `.find(r => r.name === currentPhaseName)`)
  - Verification: bun test passes (≥3 new tests).

#### Wave 2: Hook sites — workflowState instrumentation + whitelist

Wire telemetry emission into the 3 action handlers. Add whitelist entry. Cover with mock-at-boundary tests.

- [ ] **Task 1.2.1**: Add `'telemetry'` to `ROOT_WHITELIST_DIRS`
  - Files: `packages/luca-mastracode/src/tools/repo-cleanup.ts` (L90-97)
  - Inline comment: `'telemetry', // per-run wave telemetry JSONL — straggler-detection allowlist only, not permissions`
  - Verification: `ROOT_WHITELIST_DIRS.has('telemetry') === true`; regression test asserts.

- [ ] **Task 1.2.2**: Hook `start-phase` action
  - Files: `packages/luca-mastracode/src/tools/workflow-state.ts` — place AFTER `appendLedger('phase-snapshot', ...)` at L583 (the second appendLedger in the case body), BEFORE `return` at L590. This ensures the snapshot write completes first and the telemetry hook is unambiguously the last side-effect.
  - Emit `phase.start` then `wave.start`. The writer reads `currentWave`/`phase`/`slug` from state which is now correct (wave 1, new phase, new slug). No overrides needed.
  - Wrap in `try { appendTelemetry('phase.start'); appendTelemetry('wave.start'); } catch {}`
  - Verification: existing start-phase tests pass; new spy asserts both records emitted with correct phase/slug/wave.

- [ ] **Task 1.2.3**: Hook `advance-wave` action
  - Files: `packages/luca-mastracode/src/tools/workflow-state.ts` (~L640, after `appendLedger('wave-advance', ...)`)
  - **CRITICAL ORDERING**: state read at L623 (`preWaveState = readLucaState()`) captures pre-mutation snapshot. After `advanceWave()` at ~L639, `readLucaState()` returns POST-mutation state (new wave number). The telemetry hook MUST pass explicit overrides for the closing `wave.end` event, derived from `preWaveState`.
  - Implementation:
    ```ts
    // At L623 area, preWaveState is already in scope.
    // Producer (advanceWave/startPhase/completePhase) finds current phase via
    //   results.find(r => r.name === state.currentPhaseName)
    // Consumer MUST match that lookup — never use .at(-1) (breaks on RESUME).
    const priorPhase = preWaveState.currentPhaseName
    const priorSlug = preWaveState.currentPhaseSlug
    const priorWave = preWaveState.currentWave
    const priorEntry = preWaveState.phaseResults?.find(r => r.name === priorPhase)
    const priorWaveStartedAt = priorEntry?.waveStartedAt
    const priorDurationMs = priorWaveStartedAt
      ? Date.now() - new Date(priorWaveStartedAt).getTime()
      : null
    // ... advanceWave() runs ...
    // ... appendLedger('wave-advance', ...) ...
    try {
      appendTelemetry('wave.end', {}, {
        wave: priorWave, phase: priorPhase, slug: priorSlug, durationMs: priorDurationMs
      })
      appendTelemetry('wave.start')  // reads new state — correct
    } catch {}
    ```
  - Verification: integration test asserts `wave.end` carries OLD wave number + durationMs > 0; `wave.start` carries NEW wave number.

- [ ] **Task 1.2.4**: Hook `complete-phase` action
  - Files: `packages/luca-mastracode/src/tools/workflow-state.ts` (~L752, after `appendLedger('phase-complete', ...)`)
  - **CRITICAL ORDERING**: `completePhase` mutates `currentPhaseName` to next phase (or empty) and resets `currentWave: 1`. Reading state inside `appendTelemetry` AFTER the mutation will tag records with WRONG phase/wave.
  - `preState = readLucaState()` is **confirmed at workflow-state.ts:667**, prior to `completePhase()` at L744. Use that snapshot.
  - Implementation:
    ```ts
    // preState already in scope from L667.
    // Use .find(r => r.name === ...) — matches producer lookup; safe under RESUME.
    const priorPhase = preState.currentPhaseName
    const priorSlug = preState.currentPhaseSlug
    const priorWave = preState.currentWave
    const priorEntry = preState.phaseResults?.find(r => r.name === priorPhase)
    const priorWaveStartedAt = priorEntry?.waveStartedAt
    const priorPhaseStartedAt = priorEntry?.startedAt
    // ... completePhase() runs ...
    // ... appendLedger('phase-complete', ...) ...
    try {
      const now = Date.now()
      appendTelemetry('wave.end', {}, {
        wave: priorWave, phase: priorPhase, slug: priorSlug,
        durationMs: priorWaveStartedAt ? now - new Date(priorWaveStartedAt).getTime() : null
      })
      appendTelemetry('phase.end', {}, {
        wave: priorWave, phase: priorPhase, slug: priorSlug,
        durationMs: priorPhaseStartedAt ? now - new Date(priorPhaseStartedAt).getTime() : null
      })
    } catch {}
    ```
  - Verification: integration test asserts wave.end + phase.end records carry CLOSING phase name (not next), correct wave, durationMs > 0.

- [ ] **Task 1.2.5**: Mock-at-boundary tests in `workflow-state-actions.test.ts`
  - Files: `packages/luca-mastracode/src/__tests__/workflow-state-actions.test.ts`
  - Add `spyOn(telemetry, 'appendTelemetry').mockReturnValue(undefined)` and assertions per hook site.
  - Cover: error-swallow path (`appendTelemetry` throws-mock → action still returns `success: true`).
  - Whitelist regression test: `expect(ROOT_WHITELIST_DIRS.has('telemetry')).toBe(true)`.
  - Verification: bun test passes.

#### Wave 3: Polish — documentation + schema lock

- [ ] **Task 1.3.1**: Add changeset entry
  - Files: `.changeset/wave-duration-telemetry.md`
  - Content: `@alecsibilia/luca-mastracode: minor` — new telemetry foundation, no breaking changes.
  - Verification: `bun changeset status` shows the queued bump.

- [ ] **Task 1.3.2**: Final claim verification + tsc + bun test green
  - Run full test suite; verify no regressions.
  - Verification: all tests green, tsc clean, rule gate clean.

## Verification Criteria

1. New module `src/state/telemetry.ts` exports `appendTelemetry`, `buildTelemetryRecord`, `readTelemetry`, `TelemetryRecord`, `TelemetryRecordSchema`.
2. Running a fresh pipeline run produces `.planning/telemetry/<runId>.jsonl` with at least: `phase.start`, `wave.start`, `wave.end`, `wave.start`, … `phase.end` events for the run.
3. `appendTelemetry` does NOT throw under any failure mode (mocked disk error, permission, malformed input).
4. `ROOT_WHITELIST_DIRS.has('telemetry')` is `true`; `complete-phase` no longer flags `.planning/telemetry/` as straggler.
5. Existing workflowState action contracts unchanged — all prior tests still green.
6. tsc clean, bun test green (target: +8–10 new tests minimum).
7. Schema v:1 documented in writer JSDoc with additive-evolution rule.

## Risks & Mitigations

- **R-1 silent break** → fail-safe wrap inside `appendTelemetry` itself; defensive `try {} catch {}` at every call site too.
- **R-2 missing waveStartedAt** → added in Task 1.1.2 before any hook needs it.
- **R-3 orphan files** → deferred to janitor todo (already added to backlog).
- **R-5 schema churn** → v:1 locked in JSDoc + Zod schema; v-bump rule documented.
- **R-6 malformed records** → Zod parse before write; drop+warn on failure.

## Architectural Quality Check

- `src/state/telemetry.ts` is a **deep module** — small public surface (3 functions + 2 types), significant complexity (path resolution, state read, Zod validation, fail-safe write, dir-ensure) hidden behind it. Passes deletion test: removing it would scatter all that across 3 workflow-state.ts case blocks + 4 future telemetry callers.
- Placement: writer has 3 callers today (workflow-state.ts cases) but 4 future callers explicitly designed for → tier 2 (shared module within state/) is correct. Not premature; not preemptive.
- Concrete first: no abstract `TelemetryWriter` interface. One concrete writer. Future telemetry kinds extend via `meta` field, not via abstraction.
- Locality: all telemetry write logic lives in one module. Hook sites are 1–3 lines each.
- Interface-first task boundaries: each task delivers a testable public surface (path constant, state field, writer module, hook integration, whitelist entry).
