---
phase: 192
plan: 1
type: improvement
autonomous: true
wave: 1
depends_on: []
---

# Phase 192 Plan 1: Split build:all into compile + deploy stages

## Objective

Split the monolithic `bun run build:all` into two independent stages -- `build:compile` (src/ to templates/) and `build:deploy` (templates/ to .claude/) -- while keeping `build:all` backward-compatible by chaining both stages.

This enables `luca init` to share the same template resolution code path as the dev build, and decouples template generation from local deployment.

## Context

@scripts/build-all.ts
@scripts/build-shared.ts
@scripts/copy-harness-templates.ts (reference only -- DO NOT MODIFY)
@src/compilers/\_\_helpers/template-transform.ts
@packages/luca-framework/src/utils/branding.ts
@.planning/config.json (branding section)
@.planning/phases/192-build-pipeline-split/192-CONTEXT.md

## Tasks

### 1. Create scripts/resolve-templates.ts -- shared EJS resolution module

**Type:** auto
**TDD:** false
**Depends on:** none

Create `scripts/resolve-templates.ts` exporting a `resolveTemplates` function that reads EJS template files from a source directory, resolves `<%= branding.X %>` content placeholders and `__branding.X__` filename/dirname placeholders using a branding context object, and returns a Map of resolved paths to content.

This module is the shared resolution layer used by both `build:deploy` and (later) `luca init`.

**Implementation details:**

- Export `resolveTemplates(templateDir: string, branding: BrandingContext): Promise<Map<string, string>>`
- `BrandingContext` matches the shape from `createBrandingContext()` in `packages/luca-framework/src/utils/branding.ts` -- includes `commandPrefix`, `commandSlash`, `frameworkName`, `nameLowercase`, `nameUppercase`, `ticketPattern`, `ticketPatternJson`, `placeholderTicket`
- For content resolution: replace all `<%= branding.X %>` occurrences with the corresponding value from the branding context
- For filename resolution: replace `__branding.X__` segments in file paths with the corresponding value
- Walk the template directory recursively, read each file, resolve content (for .md files) and paths (for all files)
- Return Map<relativePath, content> where relativePath is relative to the templateDir root

**Files to create:**

- `scripts/resolve-templates.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Module exports `resolveTemplates` function with correct signature

### 2. Create scripts/build-compile.ts -- src/ to templates/ stage

**Type:** auto
**TDD:** false
**Depends on:** none

Create `scripts/build-compile.ts` that calls `generateAllOutputs()` from `build-shared.ts`, filters to only `.claude/` prefixed entries (not `dist/plugin/`), pipes them through `transformOutputsToTemplates()` from `src/compilers/__helpers/template-transform.ts`, and writes the result to `packages/luca-framework/templates/harness/claude/`.

**Implementation details:**

- Import `generateAllOutputs` from `./build-shared`
- Import `transformOutputsToTemplates` from `../src/compilers/__helpers/template-transform`
- Call `generateAllOutputs()` to get the full Map
- Filter entries: keep only keys starting with `.claude/` (exclude `dist/plugin/` and the special `settings.json__hooks` key)
- Strip the `.claude/` prefix from keys before transformation (templates are stored as `agents/`, `skills/`, etc.)
- Handle the settings.json hooks fragment: merge it into a settings.json entry before writing
- Call `transformOutputsToTemplates()` on the filtered+normalized Map
- Clean the output directory (`packages/luca-framework/templates/harness/claude/`) before writing
- Write all entries to disk
- Print a summary (file count, branding transforms)
- NO session lock guard (that stays in build:all only)

**Files to create:**

- `scripts/build-compile.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Running `bun scripts/build-compile.ts` produces files in `packages/luca-framework/templates/harness/claude/` with EJS placeholders (e.g., `<%= branding.frameworkName %>` in .md content, `__branding.commandPrefix__` in filenames)

### 3. Create scripts/build-deploy.ts -- templates/ to .claude/ stage

**Type:** auto
**TDD:** false
**Depends on:** 1

Create `scripts/build-deploy.ts` that reads EJS templates from `packages/luca-framework/templates/harness/claude/`, resolves them using branding from `.planning/config.json`, and writes the resolved output to `.claude/`.

**Implementation details:**

- Import `resolveTemplates` from `./resolve-templates`
- Import `createBrandingContext` from `packages/luca-framework/src/utils/branding.ts` (or inline the branding context construction from config)
- Read branding from `.planning/config.json` branding section
- Compute derived branding values: `commandSlash` = `/${commandPrefix}`, `nameLowercase` = `frameworkName.toLowerCase()`, `nameUppercase` = `frameworkName.toUpperCase()`, `ticketPatternJson` = escaped ticketPattern
- Call `resolveTemplates(templateDir, brandingContext)` to get resolved Map
- Clean `.claude/` subdirectories (agents/, skills/, rules/, hooks/) before writing -- same pattern as build-all.ts lines 136-170
- Write resolved files to `.claude/`
- chmod +x on .sh files (same as build-all.ts lines 202-207)
- Merge settings.json hooks fragment if present (same as build-all.ts lines 212-240)
- Write build manifest to `.claude/.build-manifest.json` (same as build-all.ts lines 322-338)
- Generate hooks registry JSON (same as build-all.ts line 344)
- Print summary

**Files to create:**

- `scripts/build-deploy.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Running `bun scripts/build-deploy.ts` (after build:compile has populated templates/) produces identical `.claude/` output to the current `build:all`

### 4. Update build-all.ts and package.json -- chain compile + deploy

**Type:** auto
**TDD:** false
**Depends on:** 2, 3

Modify `scripts/build-all.ts` to chain the compile and deploy stages instead of doing everything inline. Keep the session lock guard, dist/plugin output, and summary reporting in build-all. Add `build:compile` and `build:deploy` scripts to `package.json`.

**Implementation details for build-all.ts:**

- Keep the session lock guard (lines 28-97) exactly as-is
- Replace the current inline `.claude/` write logic with: (a) call compile stage to generate templates, (b) call deploy stage to resolve templates to `.claude/`
- Keep dist/plugin output path unchanged (it does not use EJS templates)
- Keep the build summary section but update it to reflect the two-stage pipeline
- Keep build manifest and hooks registry generation

**Implementation details for package.json:**

- Add `"build:compile": "bun run ./scripts/build-compile.ts"`
- Add `"build:deploy": "bun run ./scripts/build-deploy.ts"`
- Update `"build:all"` to chain: `"bun run ./scripts/build-all.ts && bun run build:templates"` (keep existing build:templates for now -- it becomes redundant but removal is Phase 194)

**Files to edit:**

- `scripts/build-all.ts`
- `package.json`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `bun run build:compile` succeeds and produces templates with EJS placeholders
- `bun run build:deploy` succeeds and produces resolved `.claude/` output
- `bun run build:all` succeeds and produces identical output to before this phase (backward compat)
- Build manifest `.claude/.build-manifest.json` is still generated after deploy

## Verification

1. **Type check**: `bunx --bun tsc --noEmit` passes with zero errors
2. **Compile stage**: `bun run build:compile` writes EJS templates to `packages/luca-framework/templates/harness/claude/`
3. **Deploy stage**: `bun run build:deploy` resolves templates and writes to `.claude/`
4. **Backward compat**: `bun run build:all` produces the same `.claude/` output as before
5. **Build manifest**: `.claude/.build-manifest.json` exists after `bun run build:all`

## Success Criteria

- Three new scripts exist: `resolve-templates.ts`, `build-compile.ts`, `build-deploy.ts`
- `package.json` has `build:compile` and `build:deploy` scripts
- `build:compile` has no dependency on luca CLI or init command
- `build:deploy` uses `resolveTemplates` (same code path `luca init` will use later)
- `build:all` chains both stages and remains backward-compatible
- `copy-harness-templates.ts` is not modified (deferred to Phase 194)

## Output Specification

- `scripts/resolve-templates.ts` -- shared EJS resolution module
- `scripts/build-compile.ts` -- compile stage script
- `scripts/build-deploy.ts` -- deploy stage script
- `scripts/build-all.ts` -- updated to chain stages
- `package.json` -- updated with new script entries
