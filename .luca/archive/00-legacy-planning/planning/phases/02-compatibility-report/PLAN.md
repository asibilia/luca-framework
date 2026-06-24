---
phase: 2
plan: 1
type: feature
autonomous: true
wave: 1
depends_on: []
---

# Phase 2 Plan 1: Adapter Compatibility Report Schema and Validators

## Objective

Create the compatibility report schema, per-adapter validation functions, and an aggregation utility so any consumer can programmatically validate compiled adapter output and receive a structured `CompatibilityReport`.

CLI/build pipeline wiring is explicitly deferred (see 02-CONTEXT.md decision 2).

## Context

@src/adapters/**schemas/adapter.schemas.ts
@src/adapters/**helpers/character-budget.ts
@src/adapters/index.ts
@src/adapters/cursor/index.ts
@src/adapters/windsurf/index.ts
@src/adapters/vscode/index.ts
@.planning/todos/pending/runtime-e04-adapter-compatibility-report.md

## Tasks

### 1. Create compatibility report schema

**Type:** auto
**TDD:** false
**Depends on:** none

Create `src/adapters/__schemas/compatibility-report.schemas.ts` with the exact Zod schemas defined in the todo specification:

- `featureMappingStatusSchema` -- enum of `fully_mapped`, `partially_mapped`, `unsupported`
- `featureMappingSchema` -- per-feature status with `feature`, `status`, `notes`, `item_count`, `degraded_count`, `warnings`
- `compatibilityReportSchema` -- per-adapter report with `adapter_id`, `adapter_name`, `adapter_version`, `target_ide`, `generated_at`, `features`, `fully_compatible`, `total_warnings`
- `aggregatedReportSchema` -- wrapper with `generated_at` and `adapters` array

All property names use `snake_case` per API conventions. Export both schemas and inferred types.

**Files to create:**

- `src/adapters/__schemas/compatibility-report.schemas.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- All four schemas and their inferred types are exported

### 2. Create per-adapter validators and aggregation utility

**Type:** auto
**TDD:** false
**Depends on:** 1

Create `src/adapters/__helpers/compatibility-validator.ts` with standalone validation functions (NOT on the Adapter interface):

**Per-adapter validators:**

- `validateCursorOutput(emitResult: EmitResult): CompatibilityReport` -- checks:
  - Rule files have valid `.mdc` YAML frontmatter
  - Skill files exist as `SKILL.md` in subdirectories
  - Hook config is valid JSON with known event names
  - No character limit violations (Cursor has no documented limits)

- `validateWindsurfOutput(emitResult: EmitResult): CompatibilityReport` -- checks:
  - No workspace rule file exceeds 12,000 characters
  - Global rules total does not exceed 6,000 characters
  - All workflow files are under 12,000 characters
  - Required `trigger` frontmatter is present in workspace rules
  - Trigger values are one of: `always_on`, `model_decision`, `glob`, `manual`

- `validateVscodeOutput(emitResult: EmitResult): CompatibilityReport` -- checks:
  - Agent profiles have required frontmatter: `name`, `description`
  - Agent profiles do not exceed 30,000 characters
  - Skills have `name` and `description` in SKILL.md frontmatter
  - Hook JSON files have valid structure
  - Hook stability warnings are present

**Aggregation utility:**

- `aggregateReports(reports: CompatibilityReport[]): AggregatedReport` -- collects per-adapter reports into an `AggregatedReport` with current timestamp

Each validator reads the file paths from `EmitResult.filesPaths`, inspects file content via `Bun.file()`, and returns a fully populated `CompatibilityReport`. Use `safeParse` for schema validation internally.

**Files to create:**

- `src/adapters/__helpers/compatibility-validator.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Each validator returns a valid `CompatibilityReport` (conforms to schema)
- `aggregateReports` returns a valid `AggregatedReport`

### 3. Export from barrel

**Type:** auto
**TDD:** false
**Depends on:** 1, 2

Add exports to `src/adapters/index.ts`:

- From `__schemas/compatibility-report.schemas.ts`: all four schemas and their inferred types
- From `__helpers/compatibility-validator.ts`: `validateCursorOutput`, `validateWindsurfOutput`, `validateVscodeOutput`, `aggregateReports`

**Files to edit:**

- `src/adapters/index.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- All new exports are accessible via `import { ... } from "~/adapters"`

## Verification

1. `bunx --bun tsc --noEmit` passes with zero errors
2. The compatibility report schema matches the specification in the todo exactly (property names, types, defaults)
3. All three per-adapter validators produce reports with at least entries for: rules, skills, hooks, agents
4. The aggregation utility correctly wraps multiple reports with a generated_at timestamp
5. All new symbols are re-exported from `src/adapters/index.ts`

## Success Criteria

- Schema file exists at `src/adapters/__schemas/compatibility-report.schemas.ts` with all four schemas
- Validator file exists at `src/adapters/__helpers/compatibility-validator.ts` with three validators and one aggregator
- Barrel file updated with all new exports
- Type checking passes cleanly

## Output Specification

- `src/adapters/__schemas/compatibility-report.schemas.ts` (new)
- `src/adapters/__helpers/compatibility-validator.ts` (new)
- `src/adapters/index.ts` (modified)
