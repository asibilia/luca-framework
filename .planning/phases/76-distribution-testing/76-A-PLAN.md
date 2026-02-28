# Plan 76-A: Distribution Testing

## Objective

Comprehensive test suite for v2.3.0 harness distribution features: wizard harness selection, conditional file generation, manifest backward compatibility, and harness doctor check.

## Tasks

### T1: Wizard harness tests (wizard-harness.test.ts)

- `createConfigFromArgs` with `--harness=claude` (single harness)
- `createConfigFromArgs` with `--harness=claude,pi,cursor` (multiple)
- `createConfigFromArgs` with invalid harness values (throws)
- `createConfigFromArgs` without `--harness` (defaults to claude,cursor)
- `runWizard` with custom harness multiselect response
- `runWizard` with harness selection cancelled

### T2: Conditional file generation tests (files-harness.test.ts)

- generateFiles with `harnesses: ["claude"]` creates `.claude/` but NOT `.cursor/`, `.pi/`
- generateFiles with `harnesses: ["pi"]` creates `.pi/` but NOT `.claude/`, `.cursor/`
- generateFiles with `harnesses: ["claude", "cursor", "pi"]` creates all dirs
- generateFiles without harnesses field defaults to claude+cursor (backward compat)

### T3: Manifest backward compatibility (manifest-harness.test.ts)

- `createManifest` includes harnesses field
- `readManifest` handles manifest WITHOUT harnesses field (returns null for field)
- Manifest with harnesses roundtrips correctly (write then read)
- validLucaConfig without harnesses still works (backward compat)

### T4: Doctor harness check (doctor-harness.test.ts)

- Returns warning when no manifest exists
- Returns pass when all harness dirs and subdirs exist
- Returns fail when harness dir is missing
- Returns fail when subdirs are missing

## Verification

- `bunx --bun tsc --noEmit` passes
- `bun test __tests__/packages/luca-framework/` passes
- All new test files pass individually
