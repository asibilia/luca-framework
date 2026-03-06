---
phase: 130
plan: 130-01
title: Cross-session procedure replay and adaptive complexity
status: complete
---

# Summary: 130-01

## Completed

### Task 1: Cross-session procedure replay engine

- Created `src/memory/__helpers/procedure-replay.ts` with:
  - `findReplayableProcedures()` — keyword/tag overlap scoring with threshold filter
  - `adaptProcedureToContext()` — placeholder replacement and file context injection
  - `replayProcedure()` — full replay with relevance scoring and adaptation detection
  - `ProcedureReplayContextSchema` / `ProcedureReplayResultSchema` with Zod validation
- Exported from `src/memory/index.ts`

### Task 2: Adaptive complexity self-tuning

- Created `src/complexity/__helpers/self-tuning.ts` with:
  - `assessComplexityAccuracy()` — signed distance between predicted vs actual levels
  - `tuneComplexityModel()` — aggregate accuracy metrics with per-level breakdown and actionable threshold adjustment recommendations
  - `ComplexityPredictionRecordSchema` / `AccuracyResultSchema` / `TuningResultSchema`
- Exported from `src/complexity/index.ts`

## Tests

- 37 tests passing across both features
