---
id: "102-01"
title: "Add Tailwind CSS build commands to luca-observer"
phase: 102
wave: 1
complexity: SIMPLE
depends_on: []
tasks:
  - id: "102-01-1"
    title: "Install @tailwindcss/cli as a dev dependency"
    goal: "Add the Tailwind v4 CLI package so that standalone CSS compilation is available outside of the Next.js/PostCSS pipeline"
    verify: "@tailwindcss/cli appears in packages/luca-observer/package.json devDependencies; bun install succeeds"
  - id: "102-01-2"
    title: "Add Tailwind build/dev/watch scripts to package.json"
    goal: "Add css:build, css:dev, and css:watch scripts that use @tailwindcss/cli to compile src/app/globals.css into public/globals.css"
    verify: "All three scripts appear in packages/luca-observer/package.json; bun run --filter @alecsibilia/luca-observer css:build exits 0 and produces public/globals.css"
  - id: "102-01-3"
    title: "Verify end-to-end Tailwind CSS compilation"
    goal: "Confirm that the CSS build output contains compiled Tailwind utilities and that the existing Next.js dev/build pipeline still works alongside the new scripts"
    verify: "public/globals.css contains compiled CSS (not just @import directives); bun run --filter @alecsibilia/luca-observer build exits 0; bun run --filter @alecsibilia/luca-observer dev starts without error"
---

# 102-01: Add Tailwind CSS Build Commands to luca-observer

## Goal

Add standalone Tailwind CSS build/dev/watch scripts to the luca-observer `package.json` so CSS can be compiled independently of the Next.js build pipeline. This provides a proper CSS compilation workflow using the Tailwind v4 CLI (`@tailwindcss/cli`), complementing the existing PostCSS-based integration that runs during `next dev` / `next build`.

## Context

@packages/luca-observer/package.json -- Target package; currently has `tailwindcss` ^4 and `@tailwindcss/postcss` ^4 as dependencies but no standalone CSS build scripts
@packages/luca-observer/postcss.config.ts -- PostCSS config using `@tailwindcss/postcss` plugin (Phase 105 will remove this later)
@packages/luca-observer/src/app/globals.css -- Main CSS file using Tailwind v4 `@import "tailwindcss"` and `@theme` directives
@packages/luca-observer/next.config.ts -- Minimal Next.js config with `reactStrictMode: true`

### Current State

- **Tailwind v4** is installed (`tailwindcss: ^4`) with the PostCSS integration (`@tailwindcss/postcss: ^4`)
- **No `tailwind.config.ts`** exists -- Tailwind v4 uses CSS-based configuration via `@theme` blocks in `globals.css`
- **PostCSS config** exists at `postcss.config.ts` and wires `@tailwindcss/postcss` -- this is what Next.js uses during `next dev` and `next build`
- **No standalone CLI** -- there are no scripts to compile CSS outside the Next.js pipeline
- **Phase 105** will later remove PostCSS entirely and align with a pure Tailwind v4 CLI approach; this phase lays the groundwork by adding the CLI scripts

### Tailwind v4 CLI

Tailwind v4 ships a separate CLI package `@tailwindcss/cli` (distinct from the v3 `tailwindcss` CLI). Usage:

```bash
# One-off build
bunx @tailwindcss/cli -i src/app/globals.css -o public/globals.css

# Watch mode
bunx @tailwindcss/cli -i src/app/globals.css -o public/globals.css --watch
```

The CLI reads the same `@import "tailwindcss"` and `@theme` directives from the input CSS file, scans source files for utility classes, and outputs compiled CSS. No separate config file is required.

## Tasks

### Task 102-01-1: Install @tailwindcss/cli as a dev dependency

Add the Tailwind v4 CLI package to luca-observer so standalone CSS compilation is available.

**Steps:**

1. From the luca-observer directory, add the CLI:
   ```bash
   cd packages/luca-observer && bun add -d @tailwindcss/cli
   ```
2. Run `bun install` from repo root to sync the lockfile
3. Verify the package appears in `devDependencies`

**Verify:**

- [ ] `@tailwindcss/cli` appears in `packages/luca-observer/package.json` under `devDependencies`
- [ ] `bun install` succeeds from repo root with no errors
- [ ] `cd packages/luca-observer && bunx @tailwindcss/cli --help` prints usage information

### Task 102-01-2: Add Tailwind build/dev/watch scripts to package.json

Add three CSS-related scripts to `packages/luca-observer/package.json`:

**Steps:**

1. Edit `packages/luca-observer/package.json` to add the following scripts:
   ```json
   {
     "scripts": {
       "dev": "next dev --port 3456",
       "build": "next build",
       "start": "next start --port 3456",
       "lint": "eslint src/",
       "lint:fix": "eslint src/ --fix",
       "css:build": "tailwindcss -i src/app/globals.css -o public/globals.css --minify",
       "css:dev": "tailwindcss -i src/app/globals.css -o public/globals.css",
       "css:watch": "tailwindcss -i src/app/globals.css -o public/globals.css --watch"
     }
   }
   ```

**Script Details:**

| Script      | Command                              | Purpose                                               |
| ----------- | ------------------------------------ | ----------------------------------------------------- |
| `css:build` | `tailwindcss -i ... -o ... --minify` | Production build with minification                    |
| `css:dev`   | `tailwindcss -i ... -o ...`          | One-off development build (no minification)           |
| `css:watch` | `tailwindcss -i ... -o ... --watch`  | Watch mode for development (rebuilds on file changes) |

**Notes:**

- The `tailwindcss` binary resolves to the `@tailwindcss/cli` package via its `bin` entry
- Input: `src/app/globals.css` (contains `@import "tailwindcss"` and `@theme` block)
- Output: `public/globals.css` (compiled CSS with all utilities)
- The `--minify` flag on `css:build` produces optimized output for production

**Verify:**

- [ ] `css:build` script exists in `packages/luca-observer/package.json`
- [ ] `css:dev` script exists in `packages/luca-observer/package.json`
- [ ] `css:watch` script exists in `packages/luca-observer/package.json`
- [ ] `bun run --filter @alecsibilia/luca-observer css:build` exits 0
- [ ] `public/globals.css` is created in the luca-observer directory

### Task 102-01-3: Verify end-to-end Tailwind CSS compilation

Confirm that the standalone CSS build produces correct output and that the existing Next.js pipeline is unaffected.

**Steps:**

1. Run `cd packages/luca-observer && bun run css:build`
2. Inspect `public/globals.css` to confirm it contains compiled CSS (not raw `@import "tailwindcss"` directives)
3. Verify the compiled CSS includes the custom theme variables from `@theme` block (e.g., `--color-background`, `--font-sans`)
4. Run `cd packages/luca-observer && bun run build` to confirm the Next.js build still works
5. Briefly start `cd packages/luca-observer && bun run dev` and confirm it starts without errors (kill after startup confirmation)
6. Add `public/globals.css` to `.gitignore` in the luca-observer package since it is a build artifact

**Verify:**

- [ ] `public/globals.css` contains compiled CSS (utility classes, not raw directives)
- [ ] `public/globals.css` contains custom theme values (`--color-background: #0a0a0a`, `--font-sans`, etc.)
- [ ] `bun run --filter @alecsibilia/luca-observer build` (Next.js build) exits 0
- [ ] `bun run --filter @alecsibilia/luca-observer dev` starts the dev server without CSS errors
- [ ] `public/globals.css` is in `.gitignore` (build artifact, not committed)

## Success Criteria

- [ ] `@tailwindcss/cli` installed as a dev dependency in luca-observer
- [ ] Three new scripts added: `css:build`, `css:dev`, `css:watch`
- [ ] `bun run css:build` produces a valid compiled CSS file at `public/globals.css`
- [ ] Compiled CSS contains Tailwind utilities and custom theme variables
- [ ] Existing `next dev` and `next build` pipelines unaffected
- [ ] `public/globals.css` is gitignored as a build artifact
- [ ] TypeScript compilation unaffected: `bunx --bun tsc --noEmit` passes from luca-observer
