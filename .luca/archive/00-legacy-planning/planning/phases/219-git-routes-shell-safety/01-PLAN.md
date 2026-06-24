---
phase: 219
plan: 1
type: fix
autonomous: true
wave: 1
---

# Wave 1 — Git Routes Shell Safety

## Objective

Eliminate shell injection vulnerabilities in git API routes by migrating all `execSync` template literal calls to `execFileSync` array syntax. Consolidate duplicated constants and scattered types.

## Context

- @packages/luca-studio/app/api/git/publish/route.ts
- @packages/luca-studio/app/api/git/revert/route.ts
- @packages/luca-studio/app/api/git/history/route.ts
- @packages/luca-studio/lib/constants.ts

## Tasks

### Task 1: Create shared git-types module

type="auto"

Create `lib/git-types.ts` with the `HistoryCommit` type currently defined inline in `history/route.ts`.

**Verification:**

- [ ] `lib/git-types.ts` exists with `HistoryCommit` type export
- [ ] Type follows existing project conventions (kebab-case file, JSDoc)

### Task 2: Migrate publish/route.ts to execFileSync

type="auto"

Replace all 4 `execSync` template literal calls with `execFileSync` array syntax:

- `git status --porcelain`
- `git add "{file}"`
- `git commit -m "{message}"`
- `git rev-parse --short HEAD`

**Verification:**

- [ ] Zero `execSync` calls remain in file
- [ ] All git commands use `execFileSync('git', [...args])` pattern
- [ ] No shell escaping logic needed (removed `replace(/"/g, '\\"')`)

### Task 3: Migrate revert/route.ts to execFileSync + deduplicate constants

type="auto"

Replace `execSync` call with `execFileSync` and remove duplicate `STUDIO_PATH_PREFIXES` — import from `~/lib/constants` instead.

**Verification:**

- [ ] Zero `execSync` calls remain in file
- [ ] No local `STUDIO_PATH_PREFIXES` definition (uses import from constants)
- [ ] `git checkout` uses `execFileSync('git', ['checkout', sha, '--', path])`

### Task 4: Migrate history/route.ts to execFileSync + use shared type

type="auto"

Replace 2 `execSync` calls with `execFileSync` and import `HistoryCommit` from shared module.

**Verification:**

- [ ] Zero `execSync` calls remain in file
- [ ] `HistoryCommit` imported from `~/lib/git-types`
- [ ] No inline type definition for `HistoryCommit`

## Verification

- [ ] `bunx --bun tsc --noEmit -p packages/luca-studio/tsconfig.json` passes
- [ ] Zero `execSync` calls in all 3 route files (only `execFileSync`)
- [ ] No duplicate `STUDIO_PATH_PREFIXES` definitions

## Success Criteria

- All git route files use `execFileSync` exclusively (no shell spawning)
- Shell injection vectors eliminated for commit messages, file paths, and SHAs
- `STUDIO_PATH_PREFIXES` has single source of truth in `~/lib/constants`
- `HistoryCommit` type centralized in `~/lib/git-types`
- TypeScript compilation passes without errors
