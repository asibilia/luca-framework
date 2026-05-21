# Phase 96-A Summary: Migrate metrics-collector.ts and hydration-snapshot.ts to Bun APIs

**Plan:** 96-A
**Phase:** 96
**Wave:** 1
**Status:** Complete

## Changes

### Task 1: metrics-collector.ts (src/iteration/\_\_helpers/)

- Removed `import { readFileSync, writeFileSync, existsSync } from "fs"`
- Converted `readMetricsFile` from sync to async:
  - `existsSync(path)` replaced with `await Bun.file(path).exists()`
  - `readFileSync(path, "utf-8")` replaced with `await Bun.file(path).text()`
  - Return type changed to `Promise<MetricsFile>`
- Converted `appendMetrics` from sync to async:
  - `writeFileSync(path, data)` replaced with `await Bun.write(path, data)`
  - Return type changed to `Promise<void>`
- Updated CLI entry point to `await appendMetrics(...)`
- Updated test file (`__tests__/src/iteration/metrics-collector.test.ts`):
  - All `appendMetrics` test callbacks made `async`
  - All `appendMetrics` calls prefixed with `await`
  - `expect(...).toThrow()` changed to `expect(...).rejects.toThrow()` for async rejection test

### Task 2: hydration-snapshot.ts (src/context/\_\_helpers/)

- Removed `import { readFileSync, existsSync } from "node:fs"`
- Removed unused `relative` and `resolve` from `node:path` import (only `join` was used)
- In `extractImportGraph` (already async):
  - `existsSync(fullPath)` replaced with `await Bun.file(fullPath).exists()`
  - `readFileSync(fullPath, "utf-8")` replaced with `await Bun.file(fullPath).text()`

### Task 3: Validation

- `bunx --bun tsc --noEmit` passes with zero errors
- 50 tests pass across both test files (14 metrics-collector + 36 hydration-snapshot)

## Commits

1. `bf8a686` fix(96-01): migrate metrics-collector.ts from node:fs to Bun APIs
2. `afcb5ab` fix(96-01): migrate hydration-snapshot.ts from node:fs to Bun APIs

## Files Modified

- `src/iteration/__helpers/metrics-collector.ts`
- `src/context/__helpers/hydration-snapshot.ts`
- `__tests__/src/iteration/metrics-collector.test.ts`
