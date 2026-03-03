---
id: 96-A
title: "Migrate metrics-collector.ts and hydration-snapshot.ts from node:fs to Bun APIs"
phase: 96
wave: 1
complexity: SIMPLE
todo: 96-A
---

# 96-A: Migrate `metrics-collector.ts` and `hydration-snapshot.ts` from node:fs to Bun APIs

## Objective

Replace bare `'fs'` and `'node:fs'` imports with Bun-native file APIs (`Bun.file()`, `Bun.write()`, `import { exists } from 'node:fs/promises'` or `Bun.file().exists()`) in two files identified by the v2.6.0 milestone audit. This aligns these files with the project convention that Bun is the primary runtime and Bun APIs are preferred over Node.js fs APIs.

## Context

@src/iteration/**helpers/metrics-collector.ts — line 1: `import { readFileSync, writeFileSync, existsSync } from "fs";` (bare `'fs'`, not even `'node:fs'`)
@src/context/**helpers/hydration-snapshot.ts — line 10: `import { readFileSync, existsSync } from "node:fs";`
@CLAUDE.md — "Use Bun.file()/Bun.write() instead of node:fs"
@.claude/rules/bun-preference.md — "Prefer Bun.file over node:fs's readFile/writeFile"

## Tasks

### Task 1: Migrate `metrics-collector.ts` to Bun APIs

**Goal:** Replace `readFileSync`, `writeFileSync`, and `existsSync` with Bun equivalents.

**Files:** `src/iteration/__helpers/metrics-collector.ts`

**Steps:**

1. Remove the line 1 import: `import { readFileSync, writeFileSync, existsSync } from "fs";`

2. Replace the `readMetricsFile` function (lines 223-237):
   - Replace `existsSync(metricsPath)` with `await Bun.file(metricsPath).exists()`
   - Replace `readFileSync(metricsPath, "utf-8")` with `await Bun.file(metricsPath).text()`
   - The function signature must become `async function readMetricsFile(metricsPath: string): Promise<MetricsFile>`

3. Replace `writeFileSync` in `appendMetrics` (line 280):
   - Replace `writeFileSync(metricsPath, JSON.stringify(file, null, 2) + "\n")` with `await Bun.write(metricsPath, JSON.stringify(file, null, 2) + "\n")`
   - The `appendMetrics` function signature must become `async` and return `Promise<void>`

4. Update all callers:
   - `readMetricsFile` is only called on line 260 inside `appendMetrics` — add `await`
   - `appendMetrics` is called on line 317 in the CLI `import.meta.main` block — add `await`

5. Update the exported function signature in `appendMetrics`:

   ```typescript
   export async function appendMetrics(
     metricsPath: string,
     entry: unknown,
     category: MetricCategory,
   ): Promise<void> {
   ```

6. Run `bunx --bun tsc --noEmit`.

**Verification:**

- [ ] No `import` from `"fs"` or `"node:fs"` in the file
- [ ] `readMetricsFile` uses `Bun.file().exists()` and `Bun.file().text()`
- [ ] `appendMetrics` uses `Bun.write()`
- [ ] Both `readMetricsFile` and `appendMetrics` are `async`
- [ ] `bunx --bun tsc --noEmit` passes

### Task 2: Migrate `hydration-snapshot.ts` to Bun APIs

**Goal:** Replace `readFileSync` and `existsSync` with Bun equivalents in the import graph extraction function.

**Files:** `src/context/__helpers/hydration-snapshot.ts`

**Steps:**

1. Remove the line 10 import: `import { readFileSync, existsSync } from "node:fs";`

2. In `extractImportGraph` (line 219-282), update the file-reading loop (lines 242-276):
   - Replace `existsSync(fullPath)` with `await Bun.file(fullPath).exists()` (line 244)
   - Replace `readFileSync(fullPath, "utf-8")` with `await Bun.file(fullPath).text()` (line 247)
   - The function is already `async`, so no signature change needed

3. Note: The `join` import from `"node:path"` on line 11 is acceptable — Bun supports `node:path` natively and there is no Bun-native path API. Keep the `join`, `relative`, and `resolve` imports from `"node:path"`.

4. Run `bunx --bun tsc --noEmit`.

**Verification:**

- [ ] No `import` from `"node:fs"` in the file
- [ ] `extractImportGraph` uses `Bun.file().exists()` and `Bun.file().text()`
- [ ] `node:path` import retained (acceptable)
- [ ] `bunx --bun tsc --noEmit` passes

### Task 3: Final validation

**Goal:** Run full verification to confirm no regressions.

**Steps:**

1. Run `bunx --bun tsc --noEmit` — full type check.
2. Run `bun test` — full test suite.
3. Verify zero imports from `"fs"` or `"node:fs"` in both files.
4. Spot-check the CLI entry point:
   - `bun run src/iteration/__helpers/metrics-collector.ts append --category=iteration_metrics --data='{"phase":96,"loop":"harness","predicted_stall_point":0,"actual_iteration_count":1,"outcome":"passed","stall_events":0,"debate_changed_outcome":false,"timestamp":"2026-03-03T00:00:00Z"}'` should succeed (or fail only on missing directory, not on import errors).

**Verification:**

- [ ] `bunx --bun tsc --noEmit` passes
- [ ] `bun test` passes (pre-existing failures acceptable)
- [ ] Zero `"fs"` or `"node:fs"` imports in either file
- [ ] CLI entry point does not crash on import

## Success Criteria

- [ ] `metrics-collector.ts` uses only Bun.file()/Bun.write() for file I/O
- [ ] `hydration-snapshot.ts` uses only Bun.file() for file I/O
- [ ] Both files compile without errors
- [ ] No functional behavior change (same CLI interface, same output format)
- [ ] `bunx --bun tsc --noEmit` passes
- [ ] `bun test` passes
