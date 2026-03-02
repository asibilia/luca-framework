# Plan 87-B: Refactor Impure Barrel Files

## Goal

Extract logic from impure barrel `index.ts` files so they contain only re-export statements.

## Context

Priority-ordered by impurity severity:

1. `src/rules/index.ts` (HIGH) — ~80 lines of registry logic, file I/O, profile loading
2. `packages/luca-framework/src/utils/doctor/index.ts` (HIGH) — 99 lines of orchestration
3. `packages/luca-framework/src/adapters/index.ts` (MEDIUM) — Factory with switch statement
4. `src/agents/index.ts` (LOW) — Pure registry mapping, optional extraction
5. `src/skills/index.ts` (LOW) — Pure registry mapping, optional extraction
6. `src/harness/parsers/index.ts` (NONE) — Already clean, skip
7. `packages/luca-framework/src/index.ts` (LOW) — CLI entry, minimal

## Tasks

### Wave 1: High-Priority Extractions

- [ ] T1: Extract rules registry logic to `src/rules/__helpers/assemble-registry.ts`
  - Move loadProfileConfig, loadProfileRules, and ruleRegistry assembly
  - index.ts becomes pure re-exports

- [ ] T2: Extract doctor logic to `packages/luca-framework/src/utils/doctor/run-doctor.ts`
  - Move all orchestration, display, and exit code logic
  - index.ts becomes `export { runDoctor } from "./run-doctor"`

- [ ] T3: Extract adapter factory to `packages/luca-framework/src/adapters/adapter-factory.ts`
  - Move createWorkTrackerAdapter and WorkTrackerConfig
  - index.ts becomes pure re-exports

### Wave 2: Low-Priority Extractions

- [ ] T4: Extract agents registry to `src/agents/__helpers/build-agent-registry.ts`
  - Move agentRegistry Record construction
  - index.ts becomes pure re-exports

- [ ] T5: Extract skills registry to `src/skills/__helpers/build-skill-registry.ts`
  - Move skillRegistry Record construction
  - index.ts becomes pure re-exports

## Verification

- `bunx --bun tsc --noEmit` passes
- `bun test` passes
- All barrel files contain only export/re-export statements
- All existing imports continue to resolve

## Success Criteria

- 5 barrel files refactored to pure re-exports
- No functional behavior changes
- All tests pass
