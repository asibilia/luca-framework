---
phase: 13
plan: 2
type: bug
autonomous: true
wave: 1
depends_on: []
gap_closure: true
findings: [H2, H3]
---

# Phase 13 Plan 02: Add sanitizeJsonParse to Bridge and Persistence SpacetimeDB Paths

## Objective

Replace all raw `JSON.parse` calls on external/SpacetimeDB data in `packages/luca-framework/src/state/bridge.ts` and `packages/luca-framework/src/state/persistence.ts` with the existing `sanitizeJsonParse` function to prevent prototype pollution attacks. The bridge already imports `sanitizeJsonParse` from `../utils/sanitize` and uses it in 2 places -- this plan extends coverage to the remaining 8 raw `JSON.parse` calls on SpacetimeDB data.

## Context

- @packages/luca-framework/src/state/bridge.ts (imports sanitizeJsonParse but has 8 raw JSON.parse calls on SpacetimeDB data)
- @packages/luca-framework/src/state/persistence.ts (1 raw JSON.parse on SpacetimeDB config row at line 224)
- @packages/luca-framework/src/utils/sanitize.ts (sanitizeJsonParse implementation, already imported by bridge.ts)

**Prior work:** Phase 02 deduplicated `sanitizeJsonParse` from 3 copies to 2 (the 2 copies exist because `packages/luca-framework/` and `src/` cannot cross-import by design). This plan does not add new copies -- it uses the existing import in bridge.ts and adds one to persistence.ts.

## Tasks

### 1. Replace raw JSON.parse calls in bridge.ts with sanitizeJsonParse

**Type:** auto
**TDD:** false
**Depends on:** none

The file already imports `sanitizeJsonParse` from `../utils/sanitize`. Replace these 6 raw `JSON.parse` calls on SpacetimeDB data with `sanitizeJsonParse`:

1. **Line ~309**: `JSON.parse(row.contextJson)` in `readComplexity()` SpacetimeDB path
2. **Line ~374**: `JSON.parse(row.contextJson)` in `readOversight()` SpacetimeDB path
3. **Line ~445**: `JSON.parse(row.contextJson)` in `readPhase()` SpacetimeDB path
4. **Line ~537**: `JSON.parse(row.contextJson)` in `setField()` SpacetimeDB path
5. **Line ~678**: `JSON.parse(dataRaw)` in `transition()` for `--data` argument parsing
6. **Line ~1039**: `JSON.parse(row.checkpointJson)` in `resumePhase()` SpacetimeDB path

**Keep as-is (not SpacetimeDB data):**

- **Line ~520**: `JSON.parse(rawValue)` -- this parses the `--value` CLI argument (trusted local input from the user's shell). However, for defense-in-depth consistency, replace this one too.
- **Line ~1219**: `JSON.parse(dataArg)` -- this parses the `--data` CLI argument for `emit-event`. Same as above, replace for consistency.

**Files to edit:**

- `packages/luca-framework/src/state/bridge.ts`

**Verification:**

- `grep -n "JSON\.parse" packages/luca-framework/src/state/bridge.ts` returns 0 results
- `bunx --bun tsc --noEmit` passes
- The existing `sanitizeJsonParse` import is used for all JSON parsing

### 2. Replace raw JSON.parse in persistence.ts with sanitizeJsonParse

**Type:** auto
**TDD:** false
**Depends on:** none

Add the `sanitizeJsonParse` import to persistence.ts and replace the single raw `JSON.parse` call:

- **Line ~224**: `config = JSON.parse(row.configJson)` in `createFreshActor()` SpacetimeDB path

**Files to edit:**

- `packages/luca-framework/src/state/persistence.ts`

**Verification:**

- `grep -n "JSON\.parse" packages/luca-framework/src/state/persistence.ts` returns 0 results
- `bunx --bun tsc --noEmit` passes
- Import added: `import { sanitizeJsonParse } from "../utils/sanitize"`

## Verification

- Zero raw `JSON.parse` calls remain in bridge.ts: `grep -c "JSON\.parse" packages/luca-framework/src/state/bridge.ts` returns `0`
- Zero raw `JSON.parse` calls remain in persistence.ts: `grep -c "JSON\.parse" packages/luca-framework/src/state/persistence.ts` returns `0`
- Type check passes: `bunx --bun tsc --noEmit`
- No behavioral changes -- `sanitizeJsonParse` is a drop-in replacement that only strips prototype pollution keys

## Success Criteria

- H2 closed: all 8 raw `JSON.parse` calls in bridge.ts replaced with `sanitizeJsonParse`
- H3 closed: the 1 raw `JSON.parse` call in persistence.ts replaced with `sanitizeJsonParse`
- Zero regressions (type check passes, same runtime behavior)

## Output Specification

- Updated `packages/luca-framework/src/state/bridge.ts` with all `JSON.parse` -> `sanitizeJsonParse`
- Updated `packages/luca-framework/src/state/persistence.ts` with `sanitizeJsonParse` import and usage
