# Wave Duration Telemetry — Foundation for V1 Telemetry

## What

`workflowState` now emits structured JSONL records at phase/wave boundaries to `.planning/telemetry/<runId>.jsonl`. Foundation for the Wave 1 telemetry program (subagent invocation costs, recall hit/miss rates, review convergence, cross-run aggregator).

## Why

No visibility into:
- How long each phase/wave takes (performance baseline)
- When the pipeline spends time (execution, review iteration cycles)
- How recall filtering impacts pipeline decisions

TelemetryRecord v:1 locked (additive evolution only) so 4 follow-on todos consume it verbatim without coordination.

## How

### New module: `src/state/telemetry.ts`

Exports fail-safe writer + reader:

- `appendTelemetry(kind, meta?, overrides?)` — emits event, never throws
- `readTelemetry(runId)` — parses JSONL, drops malformed lines with warn
- `TelemetryRecord` + v:1 schema (Zod)

### New state field: `PhaseResult.waveStartedAt`

Tracks wave start across:
- `startPhase(new-phase)` — set to now
- `startPhase(RESUME)` — reset to now (currentWave resets to 1)
- `advanceWave()` — update to now

### Hook sites in `workflowState.ts`

Three telemetry events:
1. `start-phase` action → `phase.start` + `wave.start`
2. `advance-wave` action → `wave.end` (with pre-mutation phase/slug/wave in overrides)
3. `complete-phase` action → `wave.end` + `phase.end` (with pre-mutation context)

All hooks fail-safe (try/catch internally).

### Whitelist update

`ROOT_WHITELIST_DIRS` includes `'telemetry'` for straggler-detection allowlist.

## Testing

314/314 tests pass (up from 310 due to test.each split + new invalid-runId test).

- `src/__tests__/telemetry.test.ts` — writer unit tests (append, read, malformed, fail-safe)
- `src/__tests__/luca-store.test.ts` — `waveStartedAt` lifecycle (new, resume, advance)
- `src/__tests__/workflow-state-actions.test.ts` — 3 hook sites emit correct records

## Schema (v:1 locked)

```typescript
{
  v: 1,
  ts: ISO8601,
  runId: string,
  kind: "phase.start" | "wave.start" | "wave.end" | "phase.end",
  phase: string,
  slug: string,
  wave: number,
  complexity: "TRIVIAL" | "SIMPLE" | "MODERATE" | "COMPLEX" | "CRITICAL",
  oversight: "full-auto" | "checkpoint" | "human-in-loop",
  durationMs: number | null,
  meta: Record<string, unknown>
}
```

File: `.planning/telemetry/<runId>.jsonl` (append-only, one record per line).

## Review

- **Iter 1**: 8 items (2 MF + 6 SF) → resolved
- **Iter 2**: 8 items (2 MF + 6 SF) → resolved
- **Iter 3**: Final audit → 0 MF, APPROVED

Security: CWE-117 log injection prevention (sanitized path interpolation).
Simplification: Zombie export removal (isValidRunId audited, 0 callers).
Testing: test.each conversion, explicit edge-case coverage.

## Metrics

Commits: 6 (3 waves + 2 review-fix + 1 changeset)
Tests: 314/314 pass
Files: 5 changed
Changeset: @alecsibilia/luca-mastracode minor bump

## Notes

- Failure modes (ENOSPC, EACCES) logged + swallowed — pipeline never blocked
- File integrity: runId validated /^run_[a-z0-9]+_[a-z0-9]+$/ before path construction
- Lifecycle: waveStartedAt reset on phase resume (currentWave resets to 1)
- Overrides: closing events pass pre-mutation phase/slug/wave to handle state mutation
