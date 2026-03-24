---
phase: 6
plan: 1
type: feature
autonomous: true
wave: 1
depends_on: []
---

# Phase 6 Plan 1: Adapter Foundation (Schemas + Registry)

## Objective

Create the foundational schemas and registry for the adapter domain (`src/adapters/`, T3 Build). These two files define the `Adapter` type interface and the Map-based registry that all subsequent waves depend on. No external dependencies are added in this wave.

## Context

- @.planning/todos/pending/runtime-b01-adapter-schemas.md (exact implementation spec for B01)
- @.planning/todos/pending/runtime-b02-adapter-registry.md (exact implementation spec for B02)
- @.planning/phases/06-adapter-architecture/06-CONTEXT.md (decisions and verified dependencies)
- @.planning/phases/06-adapter-architecture/PREMORTEM.md (risk mitigations)
- @src/workflow/\_\_schemas/workflow.schemas.ts (T1 Adapter type at lines 380-402 -- coexists with T3 Adapter)
- @src/compilers/\_\_helpers/plugin-registry.ts (registry pattern to follow)
- @src/agents/\_\_schemas/agent.schemas.ts (BaseAgent type import)
- @src/skills/\_\_schemas/skill.schemas.ts (BaseSkill type import)
- @src/rules/\_\_schemas/rule.schemas.ts (BaseRule type import)

## Tasks

### 1. Create adapter schemas (B01)

**Type:** auto
**TDD:** false
**Depends on:** none

Create `src/adapters/__schemas/adapter.schemas.ts` with the exact contents specified in the todo file. This includes:

- `AdapterSupportedFeaturesSchema` (Zod schema with boolean feature flags, all defaulted)
- `AdapterConfigSchema` (name, description, supportedFeatures)
- `EmitResultSchema` (filesWritten, filesPaths, warnings -- all defaulted)
- `AdapterStepResultSchema` (success, output, error, tokenUsage)
- `Adapter` type (TypeScript type with function properties: config, compileAgent, compileSkill, compileRule?, executeStep?, emit, detect)
- All inferred types: `AdapterConfig`, `AdapterSupportedFeatures`, `EmitResult`, `AdapterStepResult`

The `executeStep` parameter is typed as `unknown` for now (narrowed to `WorkflowStep` in W4/B09).

Imports: `z` from `"zod"`, type imports for `BaseAgent`, `BaseSkill`, `BaseRule` from their respective `__schemas/` paths. These are T3 importing T2, which is valid.

**Files to create:**

- `src/adapters/__schemas/adapter.schemas.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- File exports all 4 schemas and 5 types listed in the todo
- All Zod schema defaults are defined in schemas (not in destructuring)

### 2. Create adapter registry (B02)

**Type:** auto
**TDD:** false
**Depends on:** 1

Create `src/adapters/__helpers/adapter-registry.ts` following the plugin-registry.ts Map-based pattern. The file contains:

- Module-scoped `Map<string, Adapter>` (the registry)
- `registerAdapter(adapter)` -- add/replace adapter by config.name
- `getAdapter(name)` -- look up by name, returns `Adapter | undefined`
- `listRegisteredAdapters()` -- returns all adapter instances
- `listRegisteredAdapterNames()` -- returns all adapter name strings
- `detectAdapter(projectRoot)` -- auto-detect via two-pass approach (adapter.detect() first, then directory existence fallback), defaults to "claude"
- `resetAdapterRegistry()` -- clear all registrations
- `DETECTION_ORDER` -- readonly array of `{ path, adapterName }` entries

Uses `existsSync` from `node:fs` and `join` from `node:path` for synchronous detection (not Bun.file -- detection must be synchronous per CONTEXT.md decision 5).

This registry does NOT pre-register any adapters. Registration happens in W4/B10 via `register-builtins.ts`.

**Files to create:**

- `src/adapters/__helpers/adapter-registry.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- File exports all 6 functions + `DETECTION_ORDER`
- All functions have JSDoc comments
- Uses `node:fs` `existsSync` and `node:path` `join`

## Verification

```bash
bunx --bun tsc --noEmit
```

- Both files exist in the correct directory structure
- No TypeScript errors across the full project
- All exports are accessible and correctly typed
- No classes used -- functional pattern only
- All files use kebab-case naming

## Success Criteria

- `src/adapters/__schemas/adapter.schemas.ts` defines the complete `Adapter` interface and all supporting schemas
- `src/adapters/__helpers/adapter-registry.ts` provides a fully functional registry with auto-detection
- Type-check passes with zero errors
- Wave 2 can proceed with B03, B04, and B06 in parallel

## Output Specification

- `src/adapters/__schemas/adapter.schemas.ts` (new file)
- `src/adapters/__helpers/adapter-registry.ts` (new file)
