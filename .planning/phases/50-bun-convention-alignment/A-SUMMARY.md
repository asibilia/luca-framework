---
id: 50-A
status: complete
tasks_completed: [T1, T2, T3, T4, T5, T6, T7]
files_changed:
  - packages/luca-framework/src/adapters/github-adapter.ts (modified)
  - packages/luca-framework/src/utils/version-check.ts (modified)
  - packages/luca-framework/src/commands/init.ts (modified)
  - packages/luca-framework/src/commands/update.ts (modified)
  - packages/luca-framework/src/utils/doctor/checks/config-validation.ts (modified)
  - src/rules/index.ts (modified)
  - packages/luca-framework/package.json (modified — execa removed)
  - __tests__/utils/mock-shell.ts (created)
  - __tests__/utils/mock-execa.ts (deleted)
  - __tests__/packages/luca-framework/src/adapters/github-adapter.test.ts (rewritten)
  - __tests__/packages/luca-framework/src/adapters/github-security.test.ts (rewritten)
  - __tests__/packages/luca-framework/src/adapters/work-tracker-contract.test.ts (rewritten)
---

# Summary: Plan 50-A — Bun Convention Alignment

## Outcome

Replaced all non-Bun patterns (execa, npm/npx references, CJS require) with Bun-native equivalents across 6 source files. Rebuilt test infrastructure from execa mocking to Bun.$ mocking. Removed execa dependency entirely. All builds, typechecks, and tests pass with zero regressions.

## Tasks Completed

### T1: Replace execa with Bun.$ in github-adapter.ts

- **Removed** `import { execa } from "execa"` (line 11).
- **Replaced 4 call sites** with `Bun.$` tagged template literals:
  - `getTicket`: `Bun.$\`gh issue view --json ... -- ${issueNumber}\`.quiet()`
  - `createBranch` (gh issue develop): `Bun.$\`gh issue develop ${issueNumber} --name ${branchName}\`.quiet()`
  - `createBranch` (git fallback): `Bun.$\`git checkout -b -- ${branchName}\`.quiet()`
  - `validate`: `Bun.$\`gh auth status\`.quiet()`
- **Updated JSDoc** on `parseGhError` to reference "Bun.$ shell execution" instead of "execa".

### T2: Update npm/npx references in version-check.ts

- Changed `npm install -g` → `bun install -g` and `npx luca update` → `bunx luca update` in the update notifier message.

### T3: Update npx references in init.ts

- Replaced 4 occurrences of `npx luca` with `bunx luca` (lines 59, 64, 85, 122).

### T4: Update npx references in update.ts

- Replaced 4 occurrences of `npx luca` with `bunx luca` (lines 238, 364, 531, 533).

### T4b (bonus): Update npx references in config-validation.ts

- Discovered 7 additional `npx luca` references in `packages/luca-framework/src/utils/doctor/checks/config-validation.ts`.
- Replaced all with `bunx luca`.

### T5: Replace CJS require() with ESM imports in rules/index.ts

- Added ESM imports: `import { readFileSync } from "node:fs"` and `import { join } from "node:path"`.
- Removed `const fs = require("fs")` and `const path = require("path")` from `loadProfileConfig()`.
- Function remains synchronous as required (called at module evaluation time).

### T6: Test infrastructure overhaul

- **Created** `__tests__/utils/mock-shell.ts` with `createShellMock()` and `installShellMock()` utilities.
  - Mock intercepts `Bun.$` on the global by replacing the property.
  - Records raw command strings for assertion.
  - Supports per-call response configs (for multi-step tests like createBranch fallback).
- **Rewritten** 3 test files to use new mock infrastructure:
  - `github-adapter.test.ts` — 32 tests passing
  - `github-security.test.ts` — 16 tests passing
  - `work-tracker-contract.test.ts` — 24 tests passing
- **Deleted** `__tests__/utils/mock-execa.ts` (no longer needed).
- **Removed** `execa` from `packages/luca-framework/package.json` dependencies.

### T7: Final verification

- **tsc --noEmit**: PASS — zero type errors.
- **bun test**: PASS — 1763 tests passed, 0 failed, 6 skipped across 106 test files.
- **grep checks**: Zero execa imports, zero require() calls, zero npx/npm references.

## Deviations

- **T4b (bonus)**: Found and fixed 7 additional `npx` references in `config-validation.ts` that were not in the original plan. These were user-facing `fixCommand` strings in the doctor checks module.

## Files Changed

- `packages/luca-framework/src/adapters/github-adapter.ts` — execa → Bun.$
- `packages/luca-framework/src/utils/version-check.ts` — npm → bun, npx → bunx
- `packages/luca-framework/src/commands/init.ts` — npx → bunx (4 locations)
- `packages/luca-framework/src/commands/update.ts` — npx → bunx (4 locations)
- `packages/luca-framework/src/utils/doctor/checks/config-validation.ts` — npx → bunx (7 locations)
- `src/rules/index.ts` — CJS require → ESM import
- `packages/luca-framework/package.json` — removed execa dependency
- `__tests__/utils/mock-shell.ts` — new mock utility for Bun.$
- `__tests__/utils/mock-execa.ts` — deleted
- `__tests__/packages/luca-framework/src/adapters/github-adapter.test.ts` — rewritten
- `__tests__/packages/luca-framework/src/adapters/github-security.test.ts` — rewritten
- `__tests__/packages/luca-framework/src/adapters/work-tracker-contract.test.ts` — rewritten
