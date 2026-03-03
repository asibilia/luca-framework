# Phase 95-A Summary: Extract Shared Tribunal Infrastructure to src/shared/ (T0)

## Objective

Resolved CRITICAL entity isolation violation (Module Boundary Rule 2) where `src/skills/` imported directly from `src/agents/`. Both are T2 entity domains and must NEVER cross-import.

## What Changed

### New Files (canonical implementations in T0)

- `src/shared/__schemas/tribunal.schemas.ts` — All tribunal Zod schemas and type exports (9 schemas/constants + 7 types)
- `src/shared/__helpers/tribunal-detector.ts` — Finding normalization, disagreement detection, tribunal gating (3 exports)
- `src/shared/__helpers/tribunal-rebuttals.ts` — Rebuttal prompt building, resolution, result assembly (3 functions + 1 interface)

### Modified Files

- `src/shared/index.ts` — Added tribunal schema, detector, and rebuttal re-exports to barrel
- `src/agents/__schemas/tribunal.schemas.ts` — Replaced implementation with re-exports from `~/shared`
- `src/agents/__helpers/tribunal-detector.ts` — Replaced implementation with re-exports from `~/shared`
- `src/agents/__helpers/tribunal-rebuttals.ts` — Replaced implementation with re-exports from `~/shared`
- `src/skills/__helpers/milestone-debate.ts` — Changed imports from `~/agents/` to `~/shared/`
- `src/skills/__schemas/milestone-debate.schemas.ts` — Changed import from `~/agents/` to `~/shared/`
- `__tests__/src/skills/milestone-debate.test.ts` — Changed imports from agents to shared paths

## Verification

- `bunx --bun tsc --noEmit`: PASS (no new errors; pre-existing checkpoint.ts errors unrelated)
- `bun test __tests__/src/skills/milestone-debate.test.ts`: 31/31 PASS
- `bun test __tests__/src/agents/tribunal-detector.test.ts __tests__/src/agents/tribunal-rebuttals.test.ts`: 39/39 PASS
- `grep ~/agents/ src/skills/`: 0 matches (entity isolation confirmed)

## Architecture

Before: `skills (T2) -> agents (T2)` — VIOLATION
After: `skills (T2) -> shared (T0)` — COMPLIANT, `agents (T2) -> shared (T0)` — COMPLIANT

The agents barrel's public API is preserved via re-exports, so all existing consumers (including agent tests) continue to work unchanged.
