# Requirements — v1.7.0 Codebase Health & Build Stability

## Phase 44 — Quick Wins: Repo Hygiene

### R44-1: Remove git-tracked coverage artifacts

- **Must:** Remove `coverage/` directory from git tracking (`git rm -r --cached`)
- **Must:** Remove `dist/.DS_Store` from git tracking (`git rm --cached`)
- **Must:** Verify `.gitignore` covers both patterns
- **Verify:** `git status` shows removals staged, no coverage files tracked

### R44-2: Rename snake_case rule files to kebab-case

- **Must:** Rename `src/rules/general/cursor_rules.rule.ts` to `cursor-rules.rule.ts`
- **Must:** Rename `src/rules/general/self_improve.rule.ts` to `self-improve.rule.ts`
- **Must:** Use `git mv` to preserve history
- **Must:** Update all imports referencing old names
- **Verify:** `bun run build:all` succeeds, `bun run check:drift` passes

### R44-3: Clean empty directories

- **Must:** Remove `packages/luca-state/.planning/` if empty
- **Should:** Document phase numbering gap (37 → 40) in roadmap history or README
- **Verify:** No empty leftover directories

## Phase 45 — TypeScript Error Resolution

### R45-1: Fix source code TypeScript errors

- **Must:** Fix all errors in `index.ts`, adapters, commands, agents, hooks, utils
- **Must:** Use `import type` for verbatimModuleSyntax compliance
- **Must:** Add proper null checks for possibly-undefined values
- **Must:** Fix readonly property assignments in `commands/update.ts`
- **Verify:** `bunx --bun tsc --noEmit` reports 0 source code errors

### R45-2: Fix script TypeScript errors

- **Must:** Fix frontmatter parsing in 3 generate-\*-from-cursor.ts scripts
- **Should:** Extract shared frontmatter parsing utility to reduce duplication
- **Verify:** `bunx --bun tsc --noEmit` reports 0 script errors

### R45-3: Fix test file TypeScript errors

- **Must:** Fix Result<T> discriminated union access patterns
- **Must:** Fix possibly-undefined array/registry lookups
- **Must:** Fix string literal type mismatches
- **Verify:** `bunx --bun tsc --noEmit` reports 0 errors total
- **Verify:** `bun test` passes with all tests green

## Phase 46 — Package Configuration Health

### R46-1: Add main fields to package.json files

- **Must:** Add `"main": "./dist/index.cjs"` to create-luca, luca-framework, luca-state
- **Verify:** Each package.json has both `main` and module/exports fields

### R46-2: Add missing tsconfig.json files

- **Must:** Create `packages/luca-framework/tsconfig.json` extending root
- **Must:** Create `packages/create-luca/tsconfig.json` extending root
- **Verify:** `bunx --bun tsc --noEmit` works from each package directory

### R46-3: Clean unused path alias

- **Must:** Remove `"~/*": ["./src/*"]` from root tsconfig.json if unused
- **Verify:** `bun test` and `bunx --bun tsc --noEmit` still pass

### R46-4: Add typescript devDep to luca-framework

- **Must:** Add `typescript` to `packages/luca-framework/package.json` devDependencies
- **Verify:** `bun install` succeeds

## Phase 47 — Test File Consolidation

### R47-1: Establish test convention

- **Must:** Document centralized `__tests__/` as the standard test location
- **Must:** Mirror source directory structure in `__tests__/`

### R47-2: Move scattered test files

- **Must:** Move 20 scattered test files from `scripts/` and `src/` to `__tests__/`
- **Must:** Update all import paths in moved files
- **Must:** Consolidate source-tree `__tests__/` directories
- **Verify:** `bun test` passes with all tests green
- **Verify:** No test files remain in `scripts/` or `src/` (except `packages/`)

## Phase 48 — Bun API Migration

### R48-1: Fix harness runner import

- **Must:** Change `import { join } from 'path'` to `import { join } from 'pathe'` in `src/harness/runner.ts`
- **Verify:** Harness still runs correctly

### R48-2: Migrate luca-framework fs APIs

- **Must:** Evaluate portability needs (CLI may need Node.js fs for non-Bun users)
- **Should:** Migrate where Bun-only is acceptable
- **Verify:** `bun test` passes, CLI commands still work

---

_Requirements generated: 2026-02-16 (v1.7.0 milestone)_
