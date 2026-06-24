---
id: "97-01"
title: "Observer scaffolding cleanup"
phase: 97
wave: 1
complexity: TRIVIAL
depends_on: []
tasks:
  - id: "97-01-1"
    title: "Remove empty machines/ directory"
    goal: "Delete the unused src/machines/ directory from the observer package"
    verify: "Directory no longer exists: ls packages/luca-observer/src/machines/ should fail"
  - id: "97-01-2"
    title: "Remove broken build:styles script"
    goal: "Remove the build:styles script that references nonexistent tailwind/base.css"
    verify: "No build:styles key in packages/luca-observer/package.json"
  - id: "97-01-3"
    title: "Remove unused dependencies"
    goal: "Remove xstate, lodash, and @types/lodash from observer package.json"
    verify: "bun install succeeds; no xstate, lodash, or @types/lodash in observer package.json"
  - id: "97-01-4"
    title: "Verify .next/ gitignore coverage"
    goal: "Confirm packages/luca-observer/.next/ is properly gitignored"
    verify: "git status shows no .next/ files tracked"
---

# 97-01: Observer Scaffolding Cleanup

## Goal

Remove dead code, broken scripts, and unused dependencies from the `packages/luca-observer/` package. This is prerequisite hygiene before establishing test infrastructure.

## Context

@packages/luca-observer/package.json -- Contains broken `build:styles` script and unused deps
@packages/luca-observer/src/machines/ -- Empty directory (xstate machines never created)
@packages/luca-observer/postcss.config.ts -- PostCSS handles Tailwind v4 automatically
@packages/luca-observer/src/app/globals.css -- Correct Tailwind v4 `@import "tailwindcss"` syntax
@.gitignore -- Root gitignore covers `.next` pattern

## Tasks

### Task 97-01-1: Remove empty machines/ directory

The `packages/luca-observer/src/machines/` directory is empty. It was scaffolded for XState machines that were never created. Remove it.

**Steps:**

1. Delete the directory: `rm -rf packages/luca-observer/src/machines/`
2. Verify removal: `ls packages/luca-observer/src/machines/` should fail with "No such file or directory"

**Verify:**

- [ ] `packages/luca-observer/src/machines/` no longer exists
- [ ] No imports reference `~/machines` or `../machines` anywhere in observer source

### Task 97-01-2: Remove broken build:styles script

The `build:styles` script in `packages/luca-observer/package.json` references `./tailwind/base.css` which does not exist. The observer uses Tailwind v4 via PostCSS (`@tailwindcss/postcss` in `postcss.config.ts`), which handles CSS compilation automatically during `next build` and `next dev`. The separate CLI build step is unnecessary and broken.

**Steps:**

1. Edit `packages/luca-observer/package.json`
2. Remove the `"build:styles"` line from the `"scripts"` object:
   ```json
   // REMOVE this line:
   "build:styles": "bunx @tailwindcss/cli -i ./tailwind/base.css -o ./app/globals.css",
   ```
3. Ensure the remaining scripts object is valid JSON (no trailing comma after the last script)

**Verify:**

- [ ] No `build:styles` key in `packages/luca-observer/package.json`
- [ ] `package.json` is valid JSON (`bun run --filter @alecsibilia/luca-observer build` still works, or at minimum the JSON parses)

### Task 97-01-3: Remove unused dependencies

Three dependencies have zero imports in the observer source code:

- `xstate` (^5) -- `machines/` is empty, no imports found
- `lodash` (^4.17.23) -- no lodash imports in observer source
- `@types/lodash` (^4.17.23) -- dev dep matching unused lodash

**Steps:**

1. Run from the observer package directory:
   ```bash
   cd packages/luca-observer && bun remove xstate lodash @types/lodash
   ```
2. Verify `package.json` no longer lists these three packages
3. Run `bun install` from root to update lockfile

**Verify:**

- [ ] `xstate` not in `packages/luca-observer/package.json` dependencies
- [ ] `lodash` not in `packages/luca-observer/package.json` dependencies
- [ ] `@types/lodash` not in `packages/luca-observer/package.json` devDependencies
- [ ] `bun install` succeeds from repo root

### Task 97-01-4: Verify .next/ gitignore coverage

The root `.gitignore` has the pattern `.next` which matches `packages/luca-observer/.next/` at any depth.

**Steps:**

1. Check if any `.next/` files are tracked: `git ls-files packages/luca-observer/.next/`
2. If any files are returned, untrack them: `git rm -r --cached packages/luca-observer/.next/`
3. If no files are tracked, no action needed

**Verify:**

- [ ] `git ls-files packages/luca-observer/.next/` returns empty output
- [ ] `git status` does not show any `.next/` files as tracked

## Success Criteria

- [ ] Empty `machines/` directory removed
- [ ] Broken `build:styles` script removed
- [ ] Unused `xstate`, `lodash`, `@types/lodash` removed from observer package.json
- [ ] `.next/` properly gitignored
- [ ] `bun install` succeeds
- [ ] Observer package structure is clean for test infrastructure setup
