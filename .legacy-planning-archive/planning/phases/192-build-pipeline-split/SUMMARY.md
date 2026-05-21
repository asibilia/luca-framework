# Phase 192 Summary: Split build:all into compile + deploy stages

## Objective

Split the monolithic `bun run build:all` into two independent stages -- `build:compile` (src/ to templates/) and `build:deploy` (templates/ to .claude/) -- while keeping `build:all` backward-compatible by chaining both stages.

## Completed Tasks

### Task 1: Create scripts/resolve-templates.ts

**Commit:** df5f004b

Created the shared EJS resolution module that resolves template tags and filename placeholders:

- `resolveTemplates(templateDir, branding)` -- walks a template directory, resolves `<%= branding.X %>` content tags and `__branding.X__` filename placeholders
- `resolveContent()` -- string-level EJS tag resolution
- `resolveFilePath()` -- path segment placeholder resolution
- `BrandingContext` interface with required fields (frameworkName, commandPrefix, commandSlash, nameLowercase) and optional computed fields

### Task 2: Create scripts/build-compile.ts

**Commit:** 28448e3e

Stage 1 of the split pipeline (src/ to templates/):

- Calls `generateAllOutputs()` from build-shared.ts
- Filters for `.claude/` entries, strips prefix
- Handles `settings.json__hooks` fragment by merging into settings.json entry
- Calls `transformOutputsToTemplates()` to produce branded EJS templates
- Cleans and writes to `packages/luca-framework/templates/harness/claude/`
- Produces 134 template files (39 agents, 54 skills, 24 rules, 15 hooks + settings.json)

### Task 3: Create scripts/build-deploy.ts

**Commit:** 0a208561

Stage 2 of the split pipeline (templates/ to .claude/):

- Reads branding from `.planning/config.json` with fallback defaults
- Calls `resolveTemplates()` to resolve all EJS tags
- Cleans .claude/ subdirectories before writing
- Writes resolved files, chmod +x on .sh files
- Merges settings.json hooks with existing settings
- Writes build manifest to `.claude/.build-manifest.json`
- Produces 133 resolved files deployed to .claude/

### Task 4: Update build-all.ts and package.json

**Commit:** 7c64e317

Restructured build-all.ts to chain the two stages:

- Stage 1: `runCompile()` -- src/ to templates/
- Stage 2: `runDeploy()` -- templates/ to .claude/
- Stage 3: dist/plugin/ output (unchanged, direct from generateAllOutputs)
- Session lock guard preserved exactly as-is
- Hooks registry emission preserved

Added package.json scripts:

- `build:compile` -- runs build-compile.ts independently
- `build:deploy` -- runs build-deploy.ts independently
- `build:all` simplified to just `bun run ./scripts/build-all.ts` (no longer chains build:templates separately since compile stage now handles template output)

## Verification Results

- TypeScript passes (zero errors excluding pre-existing dist/plugin/ module errors)
- `bun run build:compile` works independently (134 files)
- `bun run build:deploy` works independently (133 files)
- `bun run build:all` chains all stages (296 total files)
- Templates contain EJS tags (31 branding references in lu-router.md)
- Deployed files contain zero EJS tags (fully resolved)
- settings.json has hooks and statusLine keys
- Build manifest written with correct counts

## Deviations

- **[Deviation] build:all no longer chains build:templates**: The old `build:all` script was `build-all.ts && build:templates`. Since `runCompile()` now writes to the same `templates/harness/claude/` directory that `copy-harness-templates.ts` targeted, the separate `build:templates` step is redundant in the chain. The `build:templates` script remains available for standalone use.

## Files Created/Modified

- `scripts/resolve-templates.ts` (new) -- shared EJS resolution module
- `scripts/build-compile.ts` (new) -- compile stage
- `scripts/build-deploy.ts` (new) -- deploy stage
- `scripts/build-all.ts` (modified) -- chains compile + deploy + plugin
- `package.json` (modified) -- added build:compile and build:deploy scripts
