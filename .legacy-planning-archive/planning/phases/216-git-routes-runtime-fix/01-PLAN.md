---
phase: 216
plan: 1
type: bug
autonomous: true
wave: 1
depends_on: []
---

# Phase 216 Plan 1: Replace Bun.$ with execSync in Git Routes

## Objective

Fix all three git API routes (`publish`, `revert`, `history`) that are broken at runtime because `Bun.$` is not available in the Next.js server runtime. Replace all 7 `Bun.$` calls with `execSync` from `node:child_process`, using `{ cwd, encoding: 'utf-8' }` options. This also resolves pre-existing TS2532 errors from Bun.$ output typing.

## Context

@packages/luca-studio/app/api/git/publish/route.ts
@packages/luca-studio/app/api/git/revert/route.ts
@packages/luca-studio/app/api/git/history/route.ts
@.planning/phases/216-git-routes-runtime-fix/216-CONTEXT.md

## Tasks

### 1. Fix publish/route.ts (4 Bun.$ calls)

**Type:** auto
**TDD:** false
**Depends on:** none

Replace all 4 `Bun.$` calls in the publish route with `execSync`:

| Line | Current Bun.$ call                                           | Replacement                                                                        |
| ---- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| 75   | `Bun.$\`git -C ${root} status --porcelain\`.text()`          | `execSync(\`git status --porcelain\`, { cwd: root, encoding: 'utf-8' })`           |
| 117  | `Bun.$\`git -C ${root} add ${file}\`.quiet()`                | `execSync(\`git add ${file}\`, { cwd: root, encoding: 'utf-8' })`                  |
| 124  | `Bun.$\`git -C ${root} commit -m ${commitMessage}\`.quiet()` | `execSync(\`git commit -m "${commitMessage}"\`, { cwd: root, encoding: 'utf-8' })` |
| 127  | `Bun.$\`git -C ${root} rev-parse --short HEAD\`.text()`      | `execSync('git rev-parse --short HEAD', { cwd: root, encoding: 'utf-8' })`         |

Add `import { execSync } from "node:child_process"` at top. Use `cwd` option instead of `git -C`. Shell-escape the commit message by quoting it. The `git add` call must also shell-escape the file path.

**Files to create/edit:**

- `packages/luca-studio/app/api/git/publish/route.ts`

**Verification:**

- `bunx --bun tsc --noEmit --project packages/luca-studio/tsconfig.json` passes with no errors in this file
- No remaining `Bun.$` references in file

### 2. Fix revert/route.ts (1 Bun.$ call)

**Type:** auto
**TDD:** false
**Depends on:** none

Replace the single `Bun.$` call in the revert route:

| Line | Current Bun.$ call                                                            | Replacement                                                                                       |
| ---- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 91   | `Bun.$\`git -C ${root} checkout ${commit_sha} -- ${normalizedPath}\`.quiet()` | `execSync(\`git checkout ${commit_sha} -- ${normalizedPath}\`, { cwd: root, encoding: 'utf-8' })` |

Add `import { execSync } from "node:child_process"` at top. Both `commit_sha` and `normalizedPath` are already validated (regex and normalize+prefix check), so interpolation is safe.

**Files to create/edit:**

- `packages/luca-studio/app/api/git/revert/route.ts`

**Verification:**

- `bunx --bun tsc --noEmit --project packages/luca-studio/tsconfig.json` passes with no errors in this file
- No remaining `Bun.$` references in file

### 3. Fix history/route.ts (2 Bun.$ calls)

**Type:** auto
**TDD:** false
**Depends on:** none

Replace both `Bun.$` calls in the history route:

| Line  | Current Bun.$ call                                                                                       | Replacement                                                                                                                       |
| ----- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 43-44 | `Bun.$\`git -C ${root} log --fixed-strings --grep=[studio-edit] --format=${format} -n ${limit}\`.text()` | `execSync(\`git log --fixed-strings --grep="[studio-edit]" --format="${format}" -n ${limit}\`, { cwd: root, encoding: 'utf-8' })` |
| 71    | `Bun.$\`git -C ${root} diff-tree --no-commit-id --name-only -r ${sha}\`.text()`                          | `execSync(\`git diff-tree --no-commit-id --name-only -r ${sha}\`, { cwd: root, encoding: 'utf-8' })`                              |

Add `import { execSync } from "node:child_process"` at top. The `sha` is validated against `/^[0-9a-f]{40}$/i` before use. The `--grep` value needs shell quoting for the brackets.

This also fixes the TS2532 (Object possibly undefined) errors that existed because `Bun.$` output required optional chaining. With `execSync` returning `string` directly (via `encoding: 'utf-8'`), the type is non-nullable.

**Files to create/edit:**

- `packages/luca-studio/app/api/git/history/route.ts`

**Verification:**

- `bunx --bun tsc --noEmit --project packages/luca-studio/tsconfig.json` passes with no errors in this file
- No remaining `Bun.$` references in file

## Verification

1. Run `bunx --bun tsc --noEmit --project packages/luca-studio/tsconfig.json` -- zero errors across all 3 files
2. Search all 3 route files for `Bun.$` -- zero matches confirms complete migration
3. Confirm each file imports `execSync` from `node:child_process`
4. Confirm no `git -C` usage remains (replaced by `cwd` option)

## Success Criteria

- All 7 `Bun.$` calls replaced with `execSync` across 3 files
- TypeScript compiles cleanly (no TS2532 or other errors)
- Git publish, revert, and history endpoints are functional in Next.js runtime
- REQ-05 satisfied: No `Bun.$` in Next.js API routes

## Output Specification

- Modified: `packages/luca-studio/app/api/git/publish/route.ts`
- Modified: `packages/luca-studio/app/api/git/revert/route.ts`
- Modified: `packages/luca-studio/app/api/git/history/route.ts`
