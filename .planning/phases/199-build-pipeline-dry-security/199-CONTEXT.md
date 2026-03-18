# Phase 199: Build Pipeline DRY & Security — Context

## Phase Goal

Address 3 HIGH and 2 MEDIUM audit findings from v5.3.0 milestone audit. All changes confined to `scripts/` directory.

## Decisions

### 1. Vault-guard prompt deduplication

**Decision:** Extract the vault-guard prompt text (currently duplicated in `scripts/build-compile.ts` and `packages/luca-framework/templates/hooks/settings-hooks.json`) into a shared constant. The constant lives in `scripts/build-utils.ts` since both consumers are build scripts.

`build-compile.ts` imports the constant directly. `settings-hooks.json` is a static JSON template — it cannot import TypeScript constants. So the approach is: `build-compile.ts` uses the constant, and `settings-hooks.json` retains its copy with a SYNC comment pointing to the constant as the canonical source. The `build-compile.ts` injection uses the constant, ensuring the dogfood path is always correct.

### 2. File-count computation extraction

**Decision:** Extract the `keys.filter(k => k.startsWith("agents/")).length` pattern into a `computeOutputCounts(keys)` function in `scripts/build-utils.ts`. Both `build-compile.ts` and `build-deploy.ts` call this instead of inlining the filter-and-count logic.

### 3. Error handler extraction

**Decision:** Extract a `buildErrorHandler(scriptName, error)` function into `scripts/build-utils.ts` that includes the troubleshooting guidance currently only in `build-all.ts`. All three build scripts call this in their catch blocks.

### 4. Branding validation

**Decision:** Add `validateBranding()` call (already exists in `packages/luca-framework/src/utils/branding.ts`) to `build-deploy.ts` `loadBrandingContext()` before passing values to `resolveTemplates()`. This validates frameworkName and commandPrefix against their regex patterns.

### 5. Cross-boundary import shims

**Decision:** Create `scripts/branding.ts` and `scripts/sanitize.ts` shim files (matching the existing `scripts/resolve-templates.ts` pattern) that re-export from `packages/luca-framework/src/utils/`. Update `build-deploy.ts` to import from the shims instead of deep paths.

## Scope

- `scripts/build-utils.ts` (new — shared utilities)
- `scripts/build-compile.ts` (modify — use shared constant + counts)
- `scripts/build-deploy.ts` (modify — use shims + validation + shared counts + error handler)
- `scripts/build-all.ts` (modify — use shared error handler)
- `scripts/branding.ts` (new — shim)
- `scripts/sanitize.ts` (new — shim)
