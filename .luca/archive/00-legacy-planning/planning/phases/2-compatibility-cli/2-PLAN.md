---
phase: 2
plan: 1
type: feature
autonomous: true
wave: 1
depends_on: []
---

# Phase 2 Plan 1: Compatibility Report CLI Integration

## Objective

Wire the existing per-adapter validators into a single orchestration function that runs emit -> validate -> aggregate -> write JSON -> print stdout summary. This completes the CLI-facing compatibility report pipeline so developers can run a single function and get both a machine-readable `dist/compatibility-report.json` and a human-readable terminal summary.

## Context

- @src/adapters/\_\_schemas/compatibility-report.schemas.ts — CompatibilityReport, AggregatedReport schemas
- @src/adapters/\_\_helpers/compatibility-validator.ts — validateCursorOutput(), validateWindsurfOutput(), validateVscodeOutput(), aggregateReports()
- @src/adapters/\_\_helpers/adapter-registry.ts — listRegisteredAdapters(), getAdapter()
- @src/adapters/\_\_schemas/adapter.schemas.ts — EmitResult, Adapter type
- @src/adapters/index.ts — barrel exports

## Tasks

### 1. Create adapter-report-cli.ts orchestration helper

**Type:** auto
**TDD:** false
**Depends on:** none

Create `src/adapters/__helpers/adapter-report-cli.ts` with a single exported async function `generateCompatibilityReport()` that:

1. Accepts a `projectRoot: string` parameter (absolute path)
2. Imports `listRegisteredAdapters` from the adapter registry
3. Iterates all registered adapters, calling `adapter.emit(projectRoot)` on each
4. Guards against empty `emitResult.filesPaths` (skip validation for adapters that emit zero files)
5. Routes each EmitResult to the correct validator by `adapter.config.name` (cursor -> `validateCursorOutput`, windsurf -> `validateWindsurfOutput`, vscode -> `validateVscodeOutput`; skip unknown adapters with a warning)
6. Calls `aggregateReports()` on all collected CompatibilityReport results
7. Writes the aggregated JSON to `dist/compatibility-report.json` using `Bun.write()` (ensure `dist/` directory exists via `mkdir -p` equivalent with `Bun.$`)
8. Prints a stdout summary: one line per adapter showing adapter name, COMPATIBLE or DEGRADED status, and warning count (e.g., `cursor: COMPATIBLE (0 warnings)`)
9. Returns the AggregatedReport for programmatic consumers

The function should handle errors gracefully: if a single adapter's emit or validation fails, log the error to stderr and continue with remaining adapters.

**Files to create:**

- `src/adapters/__helpers/adapter-report-cli.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes with no type errors
- Function signature is consistent with existing adapter patterns (async, returns typed result)
- No cross-tier imports violated (only imports from within adapters domain and T0/T1)

### 2. Export from barrel

**Type:** auto
**TDD:** false
**Depends on:** 1

Add `generateCompatibilityReport` export to `src/adapters/index.ts` under a new section header `Compatibility Report CLI`.

**Files to edit:**

- `src/adapters/index.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `bun run scripts/check-domain-boundaries.ts` passes (no tier violations)
- Import `generateCompatibilityReport` resolves through `~/adapters`

## Verification

1. `bunx --bun tsc --noEmit` -- type check passes with zero errors
2. `bun run scripts/check-domain-boundaries.ts` -- no module boundary violations
3. Manual verification: import `generateCompatibilityReport` from `~/adapters` in a scratch file and confirm it resolves

## Success Criteria

- `generateCompatibilityReport()` exists and is exported from `~/adapters`
- Function accepts `projectRoot`, returns `Promise<AggregatedReport>`
- Function writes `dist/compatibility-report.json` with valid JSON matching `aggregatedReportSchema`
- Function prints per-adapter status lines to stdout
- No new type errors or module boundary violations introduced

## Output Specification

- New file: `src/adapters/__helpers/adapter-report-cli.ts`
- Modified file: `src/adapters/index.ts` (new barrel export)
- Runtime artifact: `dist/compatibility-report.json` (produced when function is called)
