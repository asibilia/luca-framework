---
id: "105-01"
title: "Remove PostCSS and align Tailwind setup with joes-book--next"
phase: 105
wave: 1
complexity: SIMPLE
depends_on: ["102"]
tasks:
  - id: "105-01-1"
    title: "Remove PostCSS config and @tailwindcss/postcss dependency"
    goal: "Delete postcss.config.ts and remove @tailwindcss/postcss from package.json dependencies, since the observer will use @tailwindcss/cli exclusively"
    verify: "postcss.config.ts no longer exists; @tailwindcss/postcss is not in package.json; bun install completes without errors"
  - id: "105-01-2"
    title: "Move Tailwind source CSS to tailwind/ directory"
    goal: "Relocate src/app/globals.css to tailwind/base.css to match the joes-book--next convention, keeping the @import 'tailwindcss' directive and @theme block intact"
    verify: "tailwind/base.css exists with the Tailwind source CSS; src/app/globals.css no longer contains Tailwind source directives"
  - id: "105-01-3"
    title: "Update CSS build scripts to match reference repo pattern"
    goal: "Update package.json scripts to use bunx @tailwindcss/cli with the new source path (tailwind/base.css) and output to src/app/globals.css (for Next.js import) instead of public/globals.css"
    verify: "css:build script reads from tailwind/base.css and outputs to src/app/globals.css; css:dev and css:watch scripts updated similarly; bun run css:build produces valid compiled CSS"
  - id: "105-01-4"
    title: "Move tailwindcss to devDependencies and ensure @tailwindcss/cli is present"
    goal: "Move tailwindcss from dependencies to devDependencies since it is only needed at build time, matching the joes-book--next approach; confirm @tailwindcss/cli remains in devDependencies"
    verify: "tailwindcss listed under devDependencies (not dependencies); @tailwindcss/cli listed under devDependencies; bun install and bun run css:build both succeed"
  - id: "105-01-5"
    title: "Verify Tailwind styles compile and Next.js dev server starts"
    goal: "Run the full CSS build pipeline and confirm the Next.js dev server can start without PostCSS-related errors; verify that existing Tailwind utility classes still render correctly"
    verify: "bun run css:build completes without errors; bunx --bun tsc --noEmit passes for luca-observer; layout.tsx still imports ./globals.css and the compiled output contains expected Tailwind utilities"
---

# 105-01: Remove PostCSS and Align Tailwind Setup with joes-book--next

## Goal

Remove the PostCSS integration from luca-observer and align its Tailwind CSS build pipeline with the pattern used in the joes-book--next repository. The reference repo uses `@tailwindcss/cli` exclusively (no PostCSS), keeps Tailwind source CSS in a dedicated `tailwind/` directory, and outputs the compiled CSS where the app imports it. This simplifies the build chain by eliminating PostCSS as an intermediary.

## Context

@packages/luca-observer/postcss.config.ts -- Current PostCSS config using @tailwindcss/postcss plugin (to be deleted)
@packages/luca-observer/package.json -- Dependencies including @tailwindcss/postcss (to be removed) and @tailwindcss/cli (already present)
@packages/luca-observer/src/app/globals.css -- Current Tailwind source CSS with @import "tailwindcss" and @theme block
@packages/luca-observer/src/app/layout.tsx -- Imports ./globals.css (this import path must continue to work)
@packages/luca-observer/public/globals.css -- Current compiled output (will change to src/app/globals.css as compiled output)
@packages/luca-observer/next.config.ts -- Minimal Next.js config (no changes needed)

**Reference repo pattern (joes-book--next):**

- No `postcss.config` file at all
- `tailwindcss` and `@tailwindcss/cli` in devDependencies only
- Source CSS lives at `tailwind/base.css`
- Build script: `bunx @tailwindcss/cli -i ./tailwind/base.css -o ./app/globals.css`
- Layout imports `./globals.css` (the compiled output)

**Architecture constraints:**

- The compiled CSS must be importable from `layout.tsx` via `./globals.css`
- The Tailwind source CSS (`@import "tailwindcss"`, `@theme` block, custom styles) must be preserved
- No PostCSS dependency should remain after this phase
- All existing Tailwind utility classes must continue to work

## Tasks

### Task 105-01-1: Remove PostCSS config and @tailwindcss/postcss dependency

Delete the PostCSS config file and remove the PostCSS-related dependency from package.json.

**Steps:**

1. Delete `packages/luca-observer/postcss.config.ts`
2. Remove `"@tailwindcss/postcss": "^4"` from `dependencies` in `packages/luca-observer/package.json`
3. Run `bun install` to update the lock file

**Verify:**

- [ ] `postcss.config.ts` no longer exists in `packages/luca-observer/`
- [ ] `@tailwindcss/postcss` is not listed in `package.json` dependencies or devDependencies
- [ ] `bun install` completes without errors

### Task 105-01-2: Move Tailwind source CSS to tailwind/ directory

Relocate the Tailwind source CSS from `src/app/globals.css` to a dedicated `tailwind/base.css` file, matching the joes-book--next convention.

**Steps:**

1. Create `packages/luca-observer/tailwind/` directory
2. Move the current content of `src/app/globals.css` (the Tailwind source with `@import "tailwindcss"`, `@theme` block, and base styles) to `tailwind/base.css`
3. The `src/app/globals.css` file will become the compiled output target (overwritten by the build script), so leave it in place or clear it -- it will be regenerated by the CSS build step

**Verify:**

- [ ] `packages/luca-observer/tailwind/base.css` exists and contains the `@import "tailwindcss"` directive, `@theme` block, and custom base styles
- [ ] `src/app/globals.css` does not contain raw Tailwind source directives (it should be compiled output or empty pending rebuild)

### Task 105-01-3: Update CSS build scripts to match reference repo pattern

Update the CSS-related scripts in `package.json` to use the new source/output paths.

**Before:**

```json
"css:build": "tailwindcss -i src/app/globals.css -o public/globals.css --minify",
"css:dev": "tailwindcss -i src/app/globals.css -o public/globals.css",
"css:watch": "tailwindcss -i src/app/globals.css -o public/globals.css --watch"
```

**After:**

```json
"css:build": "bunx @tailwindcss/cli -i ./tailwind/base.css -o ./src/app/globals.css --minify",
"css:dev": "bunx @tailwindcss/cli -i ./tailwind/base.css -o ./src/app/globals.css",
"css:watch": "bunx @tailwindcss/cli -i ./tailwind/base.css -o ./src/app/globals.css --watch"
```

This matches the joes-book--next pattern where `@tailwindcss/cli` reads the source from `tailwind/base.css` and outputs compiled CSS to where the app imports it.

**Steps:**

1. Update all three CSS scripts in `packages/luca-observer/package.json`
2. Run `bun run css:build` to verify the pipeline works
3. Optionally remove the now-unused `public/globals.css` file (it was the old compiled output)

**Verify:**

- [ ] `css:build` script uses `bunx @tailwindcss/cli -i ./tailwind/base.css -o ./src/app/globals.css --minify`
- [ ] `css:dev` and `css:watch` scripts follow the same pattern
- [ ] `bun run css:build` produces valid compiled CSS at `src/app/globals.css`
- [ ] `layout.tsx` import `./globals.css` still resolves correctly

### Task 105-01-4: Move tailwindcss to devDependencies

Move `tailwindcss` from `dependencies` to `devDependencies` since it is only needed at build time, aligning with the joes-book--next convention.

**Steps:**

1. Remove `"tailwindcss": "^4"` from `dependencies` in `packages/luca-observer/package.json`
2. Add `"tailwindcss": "^4"` to `devDependencies` (alongside the existing `@tailwindcss/cli`)
3. Run `bun install`

**Verify:**

- [ ] `tailwindcss` listed under `devDependencies` (not `dependencies`)
- [ ] `@tailwindcss/cli` remains in `devDependencies`
- [ ] `bun install` completes without errors
- [ ] `bun run css:build` still succeeds after the move

### Task 105-01-5: Verify Tailwind styles compile and Next.js dev server starts

Run the full verification to confirm everything works end-to-end without PostCSS.

**Steps:**

1. Run `bun run css:build` in `packages/luca-observer/` -- confirm no errors
2. Run `bunx --bun tsc --noEmit` in `packages/luca-observer/` -- confirm no TypeScript errors
3. Verify the compiled `src/app/globals.css` contains expected Tailwind output (layer rules, utility classes, custom theme variables)
4. Optionally start the dev server (`bun run dev`) briefly to confirm it launches without PostCSS-related errors
5. Remove `public/globals.css` if it is no longer referenced anywhere

**Verify:**

- [ ] `bun run css:build` completes without errors
- [ ] `bunx --bun tsc --noEmit` passes for luca-observer
- [ ] Compiled `src/app/globals.css` contains Tailwind utility classes and the custom theme variables (--color-background, --font-sans, etc.)
- [ ] No PostCSS-related files or dependencies remain in `packages/luca-observer/`
- [ ] `public/globals.css` is removed (or documented as unnecessary)

## Success Criteria

- [ ] `postcss.config.ts` deleted from luca-observer
- [ ] `@tailwindcss/postcss` removed from all dependency sections
- [ ] `tailwindcss` moved from dependencies to devDependencies
- [ ] Tailwind source CSS lives at `tailwind/base.css`
- [ ] CSS build scripts use `bunx @tailwindcss/cli` with correct input/output paths
- [ ] `bun run css:build` produces valid compiled CSS
- [ ] `bunx --bun tsc --noEmit` passes
- [ ] `layout.tsx` CSS import continues to work
- [ ] Setup matches the joes-book--next Tailwind pattern
