# Phase 216 Plan 1 Summary: Replace Bun.$ with execSync in Git Routes

## Outcome

All 3 tasks completed successfully. 7 `Bun.$` calls replaced with `execSync` from `node:child_process` across 3 git API route files.

## Tasks Completed

### Task 1: Fix publish/route.ts (4 Bun.$ calls)

- **Commit:** `bda49e5f`
- Replaced 4 `Bun.$` calls: `git status --porcelain`, `git add`, `git commit -m`, `git rev-parse --short HEAD`
- Added `import { execSync } from "node:child_process"`
- Used `cwd` option instead of `git -C`
- Added shell escaping for commit message double quotes

### Task 2: Fix revert/route.ts (1 Bun.$ call)

- **Commit:** `02fcaa18`
- Replaced 1 `Bun.$` call: `git checkout ${commit_sha} -- ${normalizedPath}`
- Added `import { execSync } from "node:child_process"`
- Used `cwd` option instead of `git -C`

### Task 3: Fix history/route.ts (2 Bun.$ calls)

- **Commit:** `a4e6e111`
- Replaced 2 `Bun.$` calls: `git log` and `git diff-tree`
- Added `import { execSync } from "node:child_process"`
- Used `cwd` option instead of `git -C`
- `execSync` with `encoding: "utf-8"` returns `string` directly, eliminating the need for `.text()`

## Deviations

### [Rule 1 - Bug] TS2532 fixes in history and revert routes

- **Commit:** `c48d3fa1`
- Pre-existing TS2532 ("Object is possibly undefined") errors in `history/route.ts` (4 array index accesses) and `revert/route.ts` (1 Zod issues array access)
- Fixed with optional chaining: `entries[i]?.trim() ?? ""` and `issues[0]?.message ?? "Validation failed"`
- These errors were visible in the codebase before this plan but are in the same files we modified

## Verification

- **Bun.$ grep:** Zero matches in all 3 git route files
- **TypeScript:** All 3 modified files pass type-checking. 3 remaining errors are in unrelated files (harness-tab.tsx, raw-config-editor.tsx, file-watcher.ts)

## Files Modified

- `packages/luca-studio/app/api/git/publish/route.ts`
- `packages/luca-studio/app/api/git/revert/route.ts`
- `packages/luca-studio/app/api/git/history/route.ts`
