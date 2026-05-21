---
plan: 91-C
title: "Design Tribunal — phase-execute code review debate PoC"
status: complete
---

# 91-C Summary: Design Tribunal

## What Was Built

### Tribunal Schemas (`src/agents/__schemas/tribunal.schemas.ts`)

- `reviewFindingSchema` — Normalized finding from any reviewer agent
- `disagreementSchema` — Detected conflict between 2+ findings (contradictory, severity_mismatch, scope_overlap)
- `rebuttalSchema` — Challenge/defense exchange with resolution (upheld/withdrawn/modified)
- `unifiedRecommendationSchema` — Final finding with confidence rating and debate history
- `tribunalResultSchema` — Aggregate result with counts and token cost estimate

### Disagreement Detection (`src/agents/__helpers/tribunal-detector.ts`)

- `normalizeFindings()` — Parses YAML/JSON/array reviewer output into structured findings
- `detectDisagreements()` — Groups findings by file:line proximity, detects 3 conflict types
- `shouldRunTribunal()` — Gates tribunal on COMPLEX+ complexity and CRITICAL/HIGH disagreements

### Rebuttal Orchestration (`src/agents/__helpers/tribunal-rebuttals.ts`)

- `buildRebuttalPrompts()` — Generates challenger/defender prompt pairs per disagreement
- `resolveRebuttals()` — Produces unified recommendations with confidence calibration
- `buildTribunalResult()` — Aggregates counts (withdrawn, modified, token cost)

### Barrel Export (`src/agents/index.ts`)

- All tribunal schemas and helpers exported via agents barrel

## Test Results

- 39 tests pass, 0 fail
- ~99% line coverage across all tribunal files
- Covers: normalization, conflict detection, rebuttal generation, resolution, edge cases

## Deferred

- Phase-execute integration (Step 8.5) — skill file modification deferred to avoid merge risk in parallel execution
- Metrics connection (91-A) — best-effort, infrastructure ready

## Verification

- [x] `bunx --bun tsc --noEmit` passes
- [x] `bun test` passes for tribunal tests
- [x] All schemas use snake_case
- [x] No cross-tier import violations (tribunal stays in T2 agents domain)
