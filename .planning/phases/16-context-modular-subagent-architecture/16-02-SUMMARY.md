---
plan: 16-02
title: Schema Integration & Compiler Extension
status: complete
---

# Plan 16-02 Summary: Schema Integration & Compiler Extension

## Changes Made

### 1. `src/agents/types/agent.schemas.ts`

- Added import for `contextConfigSchema` from `../../context/types`
- Added `context: contextConfigSchema.optional()` field to `agentFrontmatterSchema`, after the existing `cognition` field

### 2. `src/agents/types/agent.types.ts`

- Added type-only import for `ContextConfig` from `../../context/types`
- Added `context?: ContextConfig` property to the `AgentFrontmatter` interface, after `cognition` and before the index signature

### 3. `src/complexity/types.ts`

- Added import for `ContextTier` type from `../context/types`
- Added `contextPromotions?: Partial<Record<ContextTier, ContextTier>>` field to the `ComplexityGate` interface, after `cognitionPromotions`

### 4. `src/complexity/defaults.ts`

- Added `contextPromotions: { T0: "T1", T1: "T2" }` to the MODERATE gate entry
- Added `contextPromotions: { T0: "T1", T1: "T2", T2: "T3" }` to the COMPLEX gate entry (after cognitionPromotions)
- Added `contextPromotions: { T0: "T1", T1: "T2", T2: "T3" }` to the CRITICAL gate entry (after cognitionPromotions)
- TRIVIAL and SIMPLE remain without contextPromotions (no promotion at lightweight complexity)

### 5. `src/compilers/claude.compiler.ts`

- Updated module docstring to mention context configuration alongside cognition
- Refactored `compileAgent` method to emit YAML frontmatter when EITHER cognition OR context config is present
- Context frontmatter block includes `default_tier`, `promotable_to`, and `isolation` fields

### 6. `src/context/resolve-context-tier.ts`

- Added import for `DEFAULT_COMPLEXITY_MATRIX` from `../complexity/defaults`
- Added new `resolveContextTierFromMatrix` convenience function that reads `contextPromotions` directly from the matrix gate and applies promotion-and-cap logic

### 7. `src/context/index.ts`

- Added `resolveContextTierFromMatrix` to the existing export statement for `resolveEffectiveContextTier`

## Deviations from Plan

None. All changes matched the plan specification exactly.

## Verification

### TypeScript (`bunx --bun tsc --noEmit`)

- **Zero errors in modified files**. All pre-existing errors are in unrelated files (test files, packages/, scripts/).
- Verified by filtering tsc output for modified file paths: no matches.

### Tests (`bun test`)

- **579 pass, 7 fail** across 586 tests in 51 files
- All 7 failures are pre-existing and unrelated to this plan:
  - `agent registry completeness > has entry for every source file` (registry sync issue)
  - `executeDoctor` tests (doctor utility pre-existing failures)
  - `configValidationCheck` tests (config validation pre-existing failures)
- All complexity tests (types, defaults, integration): **27/27 pass**
- All compiler/agent tests: pass
