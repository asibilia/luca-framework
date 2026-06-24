# Phase 103-01 Summary: Port ESLint Config into luca-observer

**Plan:** 103-01
**Phase:** 103
**Wave:** 1
**Complexity:** SIMPLE
**Status:** COMPLETE

## What Was Done

### Task 1: Install ESLint and required plugins/presets

Installed 8 dev dependencies into `packages/luca-observer`:

- `eslint@^9` -- core linter (v9 flat config)
- `@eslint/js@^9` -- ESLint recommended rules
- `typescript-eslint@^8` -- TypeScript integration
- `@next/eslint-plugin-next@^15` -- Next.js rules (recommended + core-web-vitals)
- `eslint-plugin-import@^2` -- import ordering and validation
- `eslint-plugin-prettier@^5` -- Prettier integration as ESLint rule
- `prettier@^3` -- code formatter
- `globals` -- global variable definitions for browser/node
- `eslint-import-resolver-typescript` -- added during Task 4 to resolve `~/` path aliases

### Task 2: Create eslint.config.mjs

Created ESLint v9 flat config at `packages/luca-observer/eslint.config.mjs` with:

- **@eslint/js recommended** base rules
- **typescript-eslint recommended** for TypeScript-specific linting
- **@next/eslint-plugin-next** recommended + core-web-vitals rules
- **eslint-plugin-import** with ordering groups (builtin, external, internal) and pathGroups for `bun`, `react`, `next`, and `~/`
- **eslint-plugin-prettier** matching existing code style:
  - `semi: true` (semicolons)
  - `singleQuote: false` (double quotes)
  - `trailingComma: "es5"` (trailing commas in objects/arrays, not function params)
  - `printWidth: 80`
  - `tabWidth: 2` (2-space indent)
- **Relaxed rules** appropriate for an observer/monitoring codebase:
  - `no-explicit-any: off` (monitoring data is dynamic)
  - `no-unused-vars: warn` with `^_` ignore pattern
  - `no-empty-object-type: off`
  - `no-non-null-assertion: off`
  - `no-require-imports: off`

### Task 3: Add lint scripts

Added to `packages/luca-observer/package.json`:

- `"lint": "eslint src/"`
- `"lint:fix": "eslint src/ --fix"`

### Task 4: Fix lint errors

Starting point: 90 warnings across 46 files.

Fixes applied:

- Installed `eslint-import-resolver-typescript` to resolve TypeScript path alias warnings
- Auto-fixed import ordering (newlines between groups, sort order)
- Auto-fixed Prettier trailing comma issues in function parameters
- Manually removed unused `basename` import from `src/app/api/notes/route.ts`

End result: **0 errors, 0 warnings** on `bun run lint`.

## Verification

| Check                                      | Result               |
| ------------------------------------------ | -------------------- |
| `bun run lint` (in packages/luca-observer) | 0 errors, 0 warnings |
| `bunx --bun tsc --noEmit` (repo root)      | Pass                 |
| `bun test` (repo root)                     | 3274 pass, 0 fail    |

## Files Changed

| File                                       | Change                                                             |
| ------------------------------------------ | ------------------------------------------------------------------ |
| `packages/luca-observer/package.json`      | Added 9 devDeps + 2 scripts                                        |
| `packages/luca-observer/eslint.config.mjs` | **New** -- ESLint v9 flat config                                   |
| `bun.lock`                                 | Updated lockfile                                                   |
| 23 files in `packages/luca-observer/src/`  | Auto-fixed import ordering, trailing commas, removed unused import |

## Commits

1. `9926d30` -- feat(103-01): install ESLint v9 and plugins into luca-observer
2. `7dfdcd4` -- feat(103-01): create ESLint v9 flat config for luca-observer
3. `c915577` -- feat(103-01): add lint and lint:fix scripts to luca-observer
4. `a7bc330` -- fix(103-01): fix all lint errors in luca-observer codebase
