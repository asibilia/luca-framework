# Phase 5 Plan 1: Config Section Write Routes -- Execution Summary

## Status: COMPLETE

## What Was Built

### Shared Infrastructure (Task 1)

**`packages/luca-studio/lib/config-section-schemas.ts`** -- Six Zod schemas for config.json sections:

- `WorkflowSectionSchema` -- workflow step toggles and tech stack profiles
- `GatesSectionSchema` -- `Record<string, boolean>` for gate toggles
- `HarnessSectionSchema` -- mirrors `src/harness/__schemas/` for Studio zod v3
- `ComplexitySectionSchema` -- default level + per-level loop budget matrix
- `LuSectionSchema` -- mirrors `src/shared/__schemas/` for Studio zod v3
- `PlannerSectionSchema` -- session caps, weekly allocation, zone boundaries, cold-start costs
- `ConfigSectionKey` type union and `CONFIG_SECTION_SCHEMAS` registry

**`packages/luca-studio/lib/config-section-handler.ts`** -- `createConfigSectionHandler()` factory:

- Read-modify-write cycle: reads full config.json, replaces only target section, atomic writes back
- Three-step validation: JSON parse (400), schema safeParse (422), semantic validators (422)
- Atomic write via `atomicWrite()` (tmp + rename pattern)
- Returns updated section data with ETag header on success

### Six PUT Route Files (Task 2)

| Route                        | Schema                  | Semantic Validators                                  |
| ---------------------------- | ----------------------- | ---------------------------------------------------- |
| `PUT /api/config/workflow`   | WorkflowSectionSchema   | None                                                 |
| `PUT /api/config/gates`      | GatesSectionSchema      | checkRequiredGates (confirm_project, confirm_phases) |
| `PUT /api/config/harness`    | HarnessSectionSchema    | checkHarnessEnabled (at least one check enabled)     |
| `PUT /api/config/complexity` | ComplexitySectionSchema | None                                                 |
| `PUT /api/config/lu`         | LuSectionSchema         | None                                                 |
| `PUT /api/config/planner`    | PlannerSectionSchema    | None                                                 |

## Deviations

### Schema Mirroring Instead of Direct Import

The plan called for reusing `HarnessConfigSchema` from `src/harness/__schemas/` and `LuConfigSchema` from `src/shared/__schemas/`. These cannot be imported directly because:

1. The `~/` path alias in luca-studio resolves to the studio package root, not `src/`
2. The monorepo root uses zod v4 while luca-studio uses zod v3 -- schemas are incompatible

**Resolution:** Created equivalent `HarnessSectionSchema` and `LuSectionSchema` locally in `config-section-schemas.ts`, matching the shapes from the real config.json. This is a standard pattern for cross-package-version schema alignment.

## Verification

- `bunx --bun tsc --noEmit` passes (no new type errors; pre-existing errors in shared-constant-registry.ts and nav-content.tsx are unrelated)
- All six route files follow the same concise factory pattern
- Each route exports only a `PUT` function
- Schemas match the structure in the real `.planning/config.json`

## Files Created

- `packages/luca-studio/lib/config-section-handler.ts`
- `packages/luca-studio/lib/config-section-schemas.ts`
- `packages/luca-studio/app/api/config/workflow/route.ts`
- `packages/luca-studio/app/api/config/gates/route.ts`
- `packages/luca-studio/app/api/config/harness/route.ts`
- `packages/luca-studio/app/api/config/complexity/route.ts`
- `packages/luca-studio/app/api/config/lu/route.ts`
- `packages/luca-studio/app/api/config/planner/route.ts`
