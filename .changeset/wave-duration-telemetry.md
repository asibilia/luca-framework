---
"@alecsibilia/luca": patch
---

Add per-phase wave duration telemetry — foundation for the Wave 1 telemetry program.

`workflowState` now emits structured JSONL records at phase/wave boundaries to `.planning/telemetry/<runId>.jsonl`. Four event kinds at v1 schema: `phase.start`, `wave.start`, `wave.end`, `phase.end`. Each record carries `runId`, phase name + slug, wave number, complexity, oversight, and `durationMs` on closing events.

New module `src/state/telemetry.ts` exports:

- `appendTelemetry(kind, meta?, overrides?)` — fail-safe writer, never throws
- `buildTelemetryRecord(...)` — pure record builder
- `readTelemetry(runId)` — per-run reader with Zod validation
- `TelemetryRecord` + `TelemetryRecordSchema` — locked v1 contract for follow-on consumers

Also: `PhaseResult.waveStartedAt` tracks wave start time across `startPhase` (new + RESUME branches) and `advanceWave`. `ROOT_WHITELIST_DIRS` now includes `'telemetry'`.

This is the foundation for 4 follow-on telemetry todos (subagent invocation costs, `muninn_recall` hit/miss, review iteration convergence, cross-run aggregator skill).
