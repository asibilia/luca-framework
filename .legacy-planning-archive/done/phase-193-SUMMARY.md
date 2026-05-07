# Phase 193 Summary: Dogfood via luca init

## Objective

Wire `luca init` to deploy from `templates/harness/claude/` using `resolveTemplates()` instead of copying pre-built `.claude/` artifacts, achieving the dogfood goal: same code path for both dev build and user installation.

## Tasks Completed

### Task 1: Move resolveTemplates to packages/luca-framework (617a5b2a)

- Created `packages/luca-framework/src/utils/resolve-templates.ts` with the core resolution functions (`resolveContent`, `resolvePathSegment`, `resolveFilePath`, `resolveTemplates`, `BrandingContext`)
- Updated `scripts/resolve-templates.ts` to re-export from the package location, preserving backward compatibility for `build-deploy.ts`
- No new type errors introduced

### Task 2: Update init.ts deploy step to use resolveTemplates (367eefd3)

- Added `resolveTemplatesDir()` helper that locates the templates directory in both dev mode (`<monorepo>/packages/luca-framework/templates/harness/claude/`) and global install mode (walks up from script dir to package root, then `templates/harness/claude/`)
- Added `classifyDeploySource()` helper to map resolved relative paths to deploy manifest source types
- Replaced the file-copy-from-`.claude/` approach in `runDeployStep()` with `resolveTemplates()` call using `createBrandingContext(defaultBranding)`
- Settings.json hooks now sourced from resolved template first, with fallback to `buildProposedHooksFromDeployed()` for backward compatibility
- Preserved: universal rules allowlist, pre-commit-drift-check.sh skip, hook chmod/path rewriting, deploy manifest, settings merge
- Legacy `.claude/` fallback still works for older package versions

## Deviations

- **[Rule 2 - Missing Critical] Global mode package root resolution**: The original init.ts used `ctx.packageDir` (which is `import.meta.dir`, pointing to `src/commands/` or `dist/`) directly as the source root in global mode. This would fail for templates resolution since templates live relative to the package root. Added proper walk-up logic to find the package root (directory containing `package.json`) in global mode.

## Verification

- `bunx --bun tsc --noEmit` passes (only 4 pre-existing errors in `dist/plugin/` remain, unrelated to this phase)

## Files Modified

- `packages/luca-framework/src/utils/resolve-templates.ts` (new) -- Core template resolution functions
- `scripts/resolve-templates.ts` -- Now re-exports from the package
- `packages/luca-framework/src/commands/init.ts` -- Deploy step uses resolveTemplates()
