---
phase: 219
plan: 1
type: fix
status: complete
---

# Phase 219 — Git Routes Shell Safety — Summary

## Objective

Eliminate shell injection vulnerabilities in Studio's git API routes by migrating from `execSync` template literals to `execFileSync` array syntax. Consolidate duplicated constants and scattered types.

## Changes Made

### Task 1: Created shared git-types module

- **File:** `packages/luca-studio/lib/git-types.ts` (new)
- Extracted `HistoryCommit` type from inline definition in `history/route.ts`
- Full JSDoc documentation with usage example

### Task 2: Migrated publish/route.ts (4 calls)

- **File:** `packages/luca-studio/app/api/git/publish/route.ts`
- `git status --porcelain` -> `execFileSync("git", ["status", "--porcelain"], ...)`
- `git add "{file}"` -> `execFileSync("git", ["add", file], ...)`
- `git commit -m "{msg}"` -> `execFileSync("git", ["commit", "-m", commitMessage], ...)`
- `git rev-parse --short HEAD` -> `execFileSync("git", ["rev-parse", "--short", "HEAD"], ...)`
- Removed shell escaping logic (`replace(/"/g, '\\"')`) that is no longer needed

### Task 3: Migrated revert/route.ts (1 call) + deduplicated constants

- **File:** `packages/luca-studio/app/api/git/revert/route.ts`
- `git checkout ${sha} -- "${path}"` -> `execFileSync("git", ["checkout", sha, "--", path], ...)`
- Removed local `STUDIO_PATH_PREFIXES` definition (was duplicating `~/lib/constants`)
- Now imports `STUDIO_PATH_PREFIXES` from `~/lib/constants`

### Task 4: Migrated history/route.ts (2 calls) + shared type

- **File:** `packages/luca-studio/app/api/git/history/route.ts`
- `git log --fixed-strings --grep="..." --format="..." -n ${limit}` -> `execFileSync("git", ["log", ...args], ...)`
- `git diff-tree --no-commit-id --name-only -r ${sha}` -> `execFileSync("git", ["diff-tree", ...args], ...)`
- Replaced inline `HistoryCommit` type with import from `~/lib/git-types`

## Audit Findings Addressed

| Finding                                       | Severity | Status |
| --------------------------------------------- | -------- | ------ |
| #1: Shell injection in git commit message     | HIGH     | Fixed  |
| #4: STUDIO_PATH_PREFIXES duplicated in revert | HIGH     | Fixed  |
| #5: Shell escaping incomplete in git add      | MEDIUM   | Fixed  |
| #6: Unescaped commit SHA in git checkout      | MEDIUM   | Fixed  |
| #13: Scattered git types (HistoryCommit)      | LOW      | Fixed  |
| #16: Template literal for limit in git log    | LOW      | Fixed  |

## Why execFileSync

`execFileSync` from `node:child_process` does NOT spawn a shell. Arguments are passed directly to the process via `argv`, so shell metacharacters (`$`, backticks, `"`, `|`, `;`, etc.) in user-controlled data are harmless. This is the correct API for structured argument passing -- unlike `execSync` which always invokes a shell even with `shell: false`.

## Verification

- TypeScript compilation passes (no new errors in modified files)
- Zero `execSync` calls remain in all 3 git route files
- All git commands use `execFileSync("git", [...args])` array pattern
- `STUDIO_PATH_PREFIXES` has single source of truth in `~/lib/constants`
- `HistoryCommit` type centralized in `~/lib/git-types`

## Deviations

None. All tasks completed as planned.

## Commit

- `29a43fb3` — fix(studio): replace execSync with execFileSync in git routes
