---
id: "104-01"
title: "Observer directory restructure — move src/ content to package root"
phase: 104
wave: 1
complexity: MODERATE
depends_on: []
tasks:
  - id: "104-01-1"
    title: "Move content folders from src/ to package root"
    goal: "Relocate app/, components/, hooks/, lib/, stores/ from packages/luca-observer/src/ to packages/luca-observer/ using git mv to preserve history"
    verify: "Directories exist at package root (packages/luca-observer/app/, components/, hooks/, lib/, stores/); src/ directory is removed or empty; git log --follow shows preserved history for moved files"
  - id: "104-01-2"
    title: "Move globals.css from src/app/ to app/"
    goal: "Ensure globals.css moves with the app/ directory and the relative import in layout.tsx still resolves"
    verify: "packages/luca-observer/app/globals.css exists; layout.tsx import './globals.css' resolves correctly"
  - id: "104-01-3"
    title: "Update tsconfig.json path mappings"
    goal: "Change the ~/\\* path alias from ./src/* to ./* so all existing ~/lib/*, ~/hooks/*, ~/components/*, ~/stores/* imports resolve to the new root-level directories"
    verify: 'tsconfig.json paths entry reads { "~/*": ["./*"] }; bunx --bun tsc --noEmit passes within packages/luca-observer'
  - id: "104-01-4"
    title: "Update package.json scripts referencing src/"
    goal: "Update CSS build scripts (css:build, css:dev, css:watch) input path from src/app/globals.css to app/globals.css; update lint scripts from 'eslint src/' to 'eslint app/ components/ hooks/ lib/ stores/'"
    verify: "bun run css:build succeeds; bun run lint succeeds; no references to src/ remain in package.json scripts"
  - id: "104-01-5"
    title: "Update ESLint config if needed"
    goal: "Verify eslint.config.mjs does not contain src/-specific paths or settings that break after the move; update import resolver settings if needed"
    verify: "bun run lint runs without config errors; import/order rule still recognizes ~/* as internal"
  - id: "104-01-6"
    title: "Update next.config.ts if needed"
    goal: "Verify Next.js config does not reference src/ in any way; Next.js auto-detects app/ at root vs src/app/ — confirm the app router is discovered at the new location"
    verify: "bun run dev starts without errors (manual or script check); next build completes successfully"
  - id: "104-01-7"
    title: "Verify build, dev server, and type checking"
    goal: "Run the full verification suite: type checking, build, and dev server startup to confirm nothing is broken after the restructure"
    verify: "bunx --bun tsc --noEmit passes; bun run build (next build) succeeds; bun run dev starts and serves the dashboard on port 3456"
---

# 104-01: Observer Directory Restructure

## Goal

Move luca-observer content folders (`app/`, `components/`, `hooks/`, `lib/`, `stores/`) from under `packages/luca-observer/src/` to `packages/luca-observer/` (the package root). This aligns with standard Next.js conventions where `app/` lives at the project root rather than inside `src/`. The `~/*` path alias must be updated in `tsconfig.json`, and all build scripts referencing `src/` must be corrected.

## Context

@packages/luca-observer/tsconfig.json -- Current path mapping: `"~/*": ["./src/*"]` must become `"~/*": ["./*"]`
@packages/luca-observer/package.json -- CSS build scripts reference `src/app/globals.css`; lint scripts reference `src/`
@packages/luca-observer/next.config.ts -- Minimal config (reactStrictMode only); Next.js auto-detects app/ location
@packages/luca-observer/eslint.config.mjs -- Import resolver points to tsconfig.json; pathGroups reference `~/**`
@packages/luca-observer/postcss.config.ts -- No src/ references
@packages/luca-observer/bunfig.toml -- Test config only; no src/ references
@packages/luca-observer/src/app/layout.tsx -- Root layout importing `./globals.css` and `~/components/layout/*`
@packages/luca-observer/src/app/page.tsx -- Dashboard page with `~/components/*` and `~/hooks/*` imports
@packages/luca-observer/**tests**/ -- Tests use relative imports only; no `~/` alias usage

**Architecture constraints:**

- Use `git mv` for all directory moves to preserve file history
- The `~/*` path alias is used in ~90 import statements across hooks, components, pages, and API routes
- All `~/` imports resolve through tsconfig `paths` -- no hardcoded `src/` prefixes in import statements
- The import statements themselves do NOT need to change; only the tsconfig path mapping needs updating
- CSS build scripts in `package.json` hardcode `src/app/globals.css` as the input path
- Lint scripts hardcode `eslint src/` as the target
- `__tests__/` directory stays at package root (already outside `src/`)
- `bin/` directory stays at package root (already outside `src/`)

**What does NOT need to change:**

- Import statements in TypeScript/TSX files (they all use `~/` which is resolved via tsconfig)
- Relative imports within the same directory (e.g., `./globals.css` in layout.tsx, `./providers` in layout.tsx)
- Test files (they use relative imports, not `~/`)
- `bin/luca-observer.js` (already at package root)
- `next.config.ts` (Next.js auto-detects `app/` location)
- `.gitignore` (references `public/globals.css`, no `src/` paths)

**What DOES need to change:**

1. Directory locations: `src/app/` -> `app/`, `src/components/` -> `components/`, etc.
2. `tsconfig.json` paths: `"~/*": ["./src/*"]` -> `"~/*": ["./*"]`
3. `package.json` scripts: `src/app/globals.css` -> `app/globals.css`, `eslint src/` -> updated target
4. ESLint config: verify import resolver still works after tsconfig change

## Tasks

### Task 104-01-1: Move content folders from src/ to package root

Use `git mv` to relocate each content directory from `src/` to the package root. This preserves git history for all files.

**Directories to move:**

| Source                                   | Destination                          |
| ---------------------------------------- | ------------------------------------ |
| `packages/luca-observer/src/app/`        | `packages/luca-observer/app/`        |
| `packages/luca-observer/src/components/` | `packages/luca-observer/components/` |
| `packages/luca-observer/src/hooks/`      | `packages/luca-observer/hooks/`      |
| `packages/luca-observer/src/lib/`        | `packages/luca-observer/lib/`        |
| `packages/luca-observer/src/stores/`     | `packages/luca-observer/stores/`     |

**Steps:**

1. From repo root, run `git mv` for each directory
2. Remove the now-empty `src/` directory
3. Verify git status shows renames (not deletes + adds)

**Verify:**

- [ ] All five directories exist at package root
- [ ] `src/` directory is removed
- [ ] `git status` shows renames with high similarity percentage
- [ ] No files left behind in `src/`

### Task 104-01-2: Move globals.css from src/app/ to app/

This is handled automatically by moving `src/app/` in Task 1. Verify that the relative import in `app/layout.tsx` (`import "./globals.css"`) still resolves since both files moved together.

**Verify:**

- [ ] `packages/luca-observer/app/globals.css` exists
- [ ] `app/layout.tsx` import `./globals.css` is valid (same-directory relative import, unchanged)

### Task 104-01-3: Update tsconfig.json path mappings

Change the `paths` entry so the `~/*` alias resolves to the package root instead of `src/`.

**Before:**

```json
{
  "paths": {
    "~/*": ["./src/*"]
  }
}
```

**After:**

```json
{
  "paths": {
    "~/*": ["./*"]
  }
}
```

No other tsconfig changes needed. The `baseUrl: "."` remains the same.

**Steps:**

1. Edit `packages/luca-observer/tsconfig.json`
2. Change `"./src/*"` to `"./*"` in the paths mapping
3. Delete `tsconfig.tsbuildinfo` to force a clean incremental rebuild

**Verify:**

- [ ] `tsconfig.json` paths reads `"~/*": ["./*"]`
- [ ] `bunx --bun tsc --noEmit` passes within `packages/luca-observer`
- [ ] All ~90 `~/` imports resolve correctly

### Task 104-01-4: Update package.json scripts referencing src/

Update three CSS scripts and two lint scripts that hardcode `src/` paths.

**Before:**

```json
{
  "css:build": "tailwindcss -i src/app/globals.css -o public/globals.css --minify",
  "css:dev": "tailwindcss -i src/app/globals.css -o public/globals.css",
  "css:watch": "tailwindcss -i src/app/globals.css -o public/globals.css --watch",
  "lint": "eslint src/",
  "lint:fix": "eslint src/ --fix"
}
```

**After:**

```json
{
  "css:build": "tailwindcss -i app/globals.css -o public/globals.css --minify",
  "css:dev": "tailwindcss -i app/globals.css -o public/globals.css",
  "css:watch": "tailwindcss -i app/globals.css -o public/globals.css --watch",
  "lint": "eslint app/ components/ hooks/ lib/ stores/",
  "lint:fix": "eslint app/ components/ hooks/ lib/ stores/ --fix"
}
```

**Steps:**

1. Edit `packages/luca-observer/package.json`
2. Replace `src/app/globals.css` with `app/globals.css` in all three CSS scripts
3. Replace `eslint src/` with `eslint app/ components/ hooks/ lib/ stores/` in lint scripts

**Verify:**

- [ ] No references to `src/` remain in `package.json` scripts
- [ ] `bun run css:build` completes without errors (in `packages/luca-observer`)
- [ ] `bun run lint` runs without path resolution errors

### Task 104-01-5: Update ESLint config if needed

Review `eslint.config.mjs` for any `src/`-specific references. The current config:

- Uses `import/resolver: { typescript: { project: "./tsconfig.json" } }` -- this will auto-pick up the updated paths
- Has `pathGroups` for `~/**` pattern -- this is alias-based, not path-based, so no change needed
- Ignores `.next/**`, `node_modules/**`, `coverage/**` -- no `src/` references

**Steps:**

1. Review `eslint.config.mjs` for any hardcoded `src/` references
2. If none found (expected), no changes needed
3. Run `bun run lint` to confirm

**Verify:**

- [ ] No `src/` references in `eslint.config.mjs`
- [ ] `bun run lint` completes without config errors
- [ ] Import ordering still correctly categorizes `~/` imports as "internal"

### Task 104-01-6: Update next.config.ts if needed

Next.js supports both `src/app/` and `app/` at project root. When `src/` is removed, Next.js auto-detects `app/` at the root. The current `next.config.ts` only sets `reactStrictMode: true` with no `src/`-specific configuration.

**Steps:**

1. Verify `next.config.ts` has no `src/` references (it does not)
2. No changes expected

**Verify:**

- [ ] `next.config.ts` has no `src/` or directory-specific configuration
- [ ] Next.js discovers the `app/` directory at the package root

### Task 104-01-7: Verify build, dev server, and type checking

Run the full verification suite to confirm the restructure is complete and nothing is broken.

**Steps:**

1. Run `bunx --bun tsc --noEmit` in `packages/luca-observer` -- type checking
2. Run `bun run build` in `packages/luca-observer` -- next build
3. Run `bun run dev` in `packages/luca-observer` -- verify dev server starts on port 3456
4. Spot-check a few routes in the browser (/, /harness, /workflow)

**Verify:**

- [ ] `bunx --bun tsc --noEmit` passes with zero errors
- [ ] `bun run build` (next build) completes successfully
- [ ] `bun run dev` starts without errors and serves on port 3456
- [ ] Dashboard pages load correctly in the browser

## Success Criteria

- [ ] All content directories (`app/`, `components/`, `hooks/`, `lib/`, `stores/`) live at `packages/luca-observer/` root
- [ ] `src/` directory is completely removed from `packages/luca-observer/`
- [ ] `tsconfig.json` paths updated from `./src/*` to `./*`
- [ ] `package.json` scripts updated to reference new paths
- [ ] All `~/` imports resolve correctly via updated tsconfig paths
- [ ] `bunx --bun tsc --noEmit` passes
- [ ] `bun run build` (next build) succeeds
- [ ] `bun run dev` starts and serves the dashboard
- [ ] Git history preserved for moved files
