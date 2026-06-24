---
phase: 227
plan: 1
type: improvement
autonomous: true
wave: 01
depends_on: []
---

# Phase 227 Plan 1: Add current_state to All Context Schemas

## Objective

Add `current_state: z.string().optional()` to all 5 orchestrator context schemas so that `writeXContext({ current_state: "..." })` calls are type-safe and no longer require `as any` casts.

Currently, `current_state` is written to context files at runtime but is not part of any Zod schema. This forces skill specs to use `as any` casts in their code examples (phase-execute has 8, milestone-complete has 5), and means the field is invisible to TypeScript. Adding it to the schemas eliminates the type escape hatch while keeping backward compatibility (the field is optional).

## Context

@src/skills/**schemas/context-helpers.ts
@src/skills/**schemas/lu-context.schemas.ts
@src/skills/**schemas/phase-execute-context.schemas.ts
@src/skills/**schemas/verify-context.schemas.ts
@src/skills/**schemas/milestone-complete-context.schemas.ts
@src/skills/**schemas/pr-address-context.schemas.ts

## Tasks

### 1. Add current_state to LuContextSchema

**Type:** auto
**TDD:** false
**Depends on:** none

Add `current_state: z.string().optional()` to the top-level `LuContextSchema` in `lu-context.schemas.ts`. Remove the JSDoc comment on line 14 that says `current_state` is "NOT part of the Zod schema (runtime-only field)" -- it will now be part of the schema.

**Files to create/edit:**

- `src/skills/__schemas/lu-context.schemas.ts`

**Verification:**

- `LuContextSchema` includes `current_state` field
- JSDoc comment updated to reflect `current_state` is now schema-tracked
- `bunx --bun tsc --noEmit` passes

### 2. Add current_state to PhaseExecuteContextSchema

**Type:** auto
**TDD:** false
**Depends on:** none

Add `current_state: z.string().optional()` to the top-level `PhaseExecuteContextSchema` in `phase-execute-context.schemas.ts`.

**Files to create/edit:**

- `src/skills/__schemas/phase-execute-context.schemas.ts`

**Verification:**

- `PhaseExecuteContextSchema` includes `current_state` field
- `bunx --bun tsc --noEmit` passes

### 3. Add current_state to VerifyContextSchema

**Type:** auto
**TDD:** false
**Depends on:** none

Add `current_state: z.string().optional()` to the top-level `VerifyContextSchema` in `verify-context.schemas.ts`.

**Files to create/edit:**

- `src/skills/__schemas/verify-context.schemas.ts`

**Verification:**

- `VerifyContextSchema` includes `current_state` field
- `bunx --bun tsc --noEmit` passes

### 4. Add current_state to MilestoneCompleteContextSchema

**Type:** auto
**TDD:** false
**Depends on:** none

Add `current_state: z.string().optional()` to the top-level `MilestoneCompleteContextSchema` in `milestone-complete-context.schemas.ts`.

**Files to create/edit:**

- `src/skills/__schemas/milestone-complete-context.schemas.ts`

**Verification:**

- `MilestoneCompleteContextSchema` includes `current_state` field
- `bunx --bun tsc --noEmit` passes

### 5. Add current_state to PrAddressContextSchema

**Type:** auto
**TDD:** false
**Depends on:** none

Add `current_state: z.string().optional()` to the top-level `PrAddressContextSchema` in `pr-address-context.schemas.ts`.

**Files to create/edit:**

- `src/skills/__schemas/pr-address-context.schemas.ts`

**Verification:**

- `PrAddressContextSchema` includes `current_state` field
- `bunx --bun tsc --noEmit` passes

## Verification

1. Run `bunx --bun tsc --noEmit` -- all 5 schema files compile without errors
2. Grep all 5 schema files for `current_state: z.string().optional()` -- each has exactly one occurrence at the top-level schema
3. Grep lu-context.schemas.ts for "runtime-only" -- should return zero results (stale comment removed)

## Success Criteria

- All 5 top-level context schemas include `current_state: z.string().optional()`
- TypeScript compiles cleanly with no errors
- The `context-helpers.ts` factory write signature now accepts `{ current_state: "..." }` without `as any` for all 5 context types

## Output Specification

- 5 modified schema files in `src/skills/__schemas/`
