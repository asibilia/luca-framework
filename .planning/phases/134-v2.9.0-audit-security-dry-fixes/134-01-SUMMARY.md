---
id: 134-01
status: complete
---

# Summary: audit-findings.ts security & DRY fixes

## Tasks Completed

### T1: Remove double SQL escaping (H1)

- Removed 7 redundant `.replace(/'/g, "''")` calls after `validateFilterString()` which already handles escaping internally
- Removed unused `escapeSqlString` and `validateAndEscapeSqlString` imports
- Eliminates double-escaping bug that would corrupt strings containing apostrophes

### T2: Hoist severityOrder to module-level (M2)

- Moved `severityOrder` Record from inside `queryFindingsForFile()` to module-level `SEVERITY_ORDER` constant
- Avoids re-creating the lookup map on every function call

### T3: Extract createEnumMap helper (M3)

- Added `createEnumMap<T>()` generic factory function
- Refactored `createEmptySummary()` to use it, eliminating duplicated `Object.fromEntries(...map(...))` pattern

## Files Changed

- `packages/luca-framework/src/state/__helpers/audit-findings.ts`

## Verification

- `bunx --bun tsc --noEmit` passes with zero errors
