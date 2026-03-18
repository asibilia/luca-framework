---
phase: 199
plan: 1
type: improvement
autonomous: true
wave: 1-2
depends_on: []
---

# Phase 199 Plan 1: Build Pipeline DRY & Security

## Objective

Address 3 HIGH and 2 MEDIUM audit findings from the v5.3.0 milestone audit by extracting shared build utilities, deduplicating the vault-guard prompt, adding branding validation, and replacing deep cross-boundary imports with shim files. All changes are confined to `scripts/`.

> Appetite: Small (50,000 tokens remaining of 50,000 ceiling)

## Context

- @scripts/build-compile.ts (vault-guard injection, file-count duplication, error handler)
- @scripts/build-deploy.ts (file-count duplication, error handler, deep cross-boundary imports, missing branding validation)
- @scripts/build-all.ts (error handler with troubleshooting guidance)
- @scripts/build-utils.ts (existing shared utilities -- ensureDir, cleanDirectory, etc.)
- @scripts/resolve-templates.ts (shim pattern to follow for new shims)
- @packages/luca-framework/src/utils/branding.ts (validateBranding function to call)
- @packages/luca-framework/src/utils/sanitize.ts (sanitizeJsonParse to re-export via shim)
- @packages/luca-framework/templates/hooks/settings-hooks.json (vault-guard prompt copy that needs SYNC comment)

## Tasks

### Wave 1: Create shared utilities and shim files

#### 1. Add vault-guard prompt constant, computeOutputCounts, and buildErrorHandler to build-utils.ts

**Type:** auto
**TDD:** false
**Depends on:** none

Add three new exports to the existing `scripts/build-utils.ts`:

1. **VAULT_GUARD_PROMPT** -- A `const string` containing the full vault-guard prompt text currently duplicated in `build-compile.ts` (lines 149-166). This is a plain string constant, not a function.

2. **computeOutputCounts(keys: string[])** -- Extracts the file-count computation pattern repeated in `build-compile.ts` (lines 213-220) and `build-deploy.ts` (lines 259-266):

   ```typescript
   function computeOutputCounts(keys: string[]): {
     agents: number;
     skills: number;
     rules: number;
     hooks: number;
     total: number;
   };
   ```

   Filters keys by prefix (`agents/`, `skills/`, `rules/`, `hooks/*.sh`) and returns counts.

3. **buildErrorHandler(scriptName: string, error: unknown)** -- Unifies the error output pattern from all three build scripts. Includes the troubleshooting guidance currently only in `build-all.ts` (lines 258-270):
   ```typescript
   function buildErrorHandler(scriptName: string, error: unknown): never;
   ```
   Prints formatted error banner, error message, troubleshooting steps, stack trace, then calls `process.exit(1)`.

**Files to create/edit:**

- `scripts/build-utils.ts` (edit -- add 3 exports)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- The file exports VAULT_GUARD_PROMPT, computeOutputCounts, and buildErrorHandler
- VAULT_GUARD_PROMPT string content matches the existing prompt in build-compile.ts exactly

#### 2. Create scripts/branding.ts shim

**Type:** auto
**TDD:** false
**Depends on:** none

Create a re-export-only shim file matching the `scripts/resolve-templates.ts` pattern. The shim re-exports from `packages/luca-framework/src/utils/branding.ts`.

Exports to re-export:

- `defaultBranding`
- `validateBranding`
- `validateBrandingField`
- `type BrandingConfig` (from `packages/luca-framework/src/types`)

The file must contain only re-export statements and JSDoc -- no logic.

**Files to create/edit:**

- `scripts/branding.ts` (new)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- File contains only `export { ... } from` and `export type { ... } from` statements

#### 3. Create scripts/sanitize.ts shim

**Type:** auto
**TDD:** false
**Depends on:** none

Create a re-export-only shim file matching the `scripts/resolve-templates.ts` pattern. The shim re-exports from `packages/luca-framework/src/utils/sanitize.ts`.

Exports to re-export:

- `sanitizeJsonParse`
- `safeSanitizeJsonParse`

The file must contain only re-export statements and JSDoc -- no logic.

**Files to create/edit:**

- `scripts/sanitize.ts` (new)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- File contains only `export { ... } from` statements

### Wave 2: Update existing build scripts to use shared utilities

#### 4. Update build-compile.ts to use VAULT_GUARD_PROMPT and computeOutputCounts

**Type:** auto
**TDD:** false
**Depends on:** 1

Two changes:

1. **Vault-guard prompt**: Replace the inline prompt string (lines 149-166) with an import of `VAULT_GUARD_PROMPT` from `./build-utils`. The `prompt` field in the PreToolUse hook entry becomes `VAULT_GUARD_PROMPT` instead of the concatenated string.

2. **File counts**: Replace the inline filter-and-count block (lines 212-220) with a call to `computeOutputCounts(keys)`.

3. **Error handler**: Replace the catch block (lines 236-244) with a call to `buildErrorHandler("build-compile", error)`.

**Files to create/edit:**

- `scripts/build-compile.ts` (edit)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Inline vault-guard prompt string no longer appears in the file
- Inline file-count filter pattern no longer appears in the file
- Inline error handler no longer appears in the file

#### 5. Update build-deploy.ts to use shims, validation, computeOutputCounts, and buildErrorHandler

**Type:** auto
**TDD:** false
**Depends on:** 1, 2, 3

Four changes:

1. **Shim imports**: Replace the deep cross-boundary imports:
   - `import { defaultBranding } from "../packages/luca-framework/src/utils/branding"` becomes `import { defaultBranding, validateBranding } from "./branding"`
   - `import { sanitizeJsonParse } from "../packages/luca-framework/src/utils/sanitize"` becomes `import { sanitizeJsonParse } from "./sanitize"`

2. **Branding validation**: Add a `validateBranding()` call in `loadBrandingContext()` after reading branding values from config. If validation fails, log a warning with the specific errors but continue with defaults (non-blocking, per premortem).

3. **File counts**: Replace the inline filter-and-count block (lines 259-266) with a call to `computeOutputCounts(keys)`.

4. **Error handler**: Replace the catch block (lines 306-314) with a call to `buildErrorHandler("build-deploy", error)`.

**Files to create/edit:**

- `scripts/build-deploy.ts` (edit)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- No imports from `../packages/luca-framework/src/utils/` remain in the file
- `validateBranding` is called in `loadBrandingContext()`
- Inline file-count filter pattern no longer appears in the file
- Inline error handler no longer appears in the file

#### 6. Update build-all.ts to use buildErrorHandler

**Type:** auto
**TDD:** false
**Depends on:** 1

Replace the catch block (lines 254-272) with a call to `buildErrorHandler("build-all", error)`.

**Files to create/edit:**

- `scripts/build-all.ts` (edit)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Inline error handler no longer appears in the file

#### 7. Add SYNC comment to settings-hooks.json vault-guard prompt

**Type:** auto
**TDD:** false
**Depends on:** 1

Add a note within the JSON (as a comment-like field or adjacent to the prompt) that documents the canonical source. Since JSON does not support comments, the approach is: no structural change to settings-hooks.json. Instead, the SYNC relationship is documented in the JSDoc of `VAULT_GUARD_PROMPT` in `build-utils.ts`, which names `settings-hooks.json` as the file that carries a copy. This is the same approach already used for `sanitizeJsonParse` (see the NOTE comments in `packages/luca-framework/src/utils/sanitize.ts`).

**Files to create/edit:**

- `scripts/build-utils.ts` (edit -- ensure VAULT_GUARD_PROMPT JSDoc references settings-hooks.json)

**Verification:**

- VAULT_GUARD_PROMPT JSDoc contains a SYNC note referencing `packages/luca-framework/templates/hooks/settings-hooks.json`

## Verification

Run after all tasks complete:

1. `bunx --bun tsc --noEmit` -- Full type check passes with zero errors
2. Grep for removed patterns to confirm deduplication:
   - No inline vault-guard prompt string in `build-compile.ts`
   - No `keys.filter((k) => k.startsWith("agents/")).length` in `build-compile.ts` or `build-deploy.ts`
   - No `../packages/luca-framework/src/utils/` imports in `build-deploy.ts`
   - No inline error handlers in any of the three build scripts
3. Confirm shim files are re-export-only (no logic)
4. Do NOT run `bun run build:all` during session (per PREMORTEM constraint)

## Success Criteria

- All 5 audit findings addressed (3 HIGH: vault-guard dedup, file-count dedup, error handler dedup; 2 MEDIUM: branding validation, cross-boundary imports)
- Zero new TypeScript errors
- No behavioral changes to build output (pure refactor)
- Shim files follow the existing `scripts/resolve-templates.ts` pattern exactly
- `VAULT_GUARD_PROMPT` is a const string, not a function (per PREMORTEM constraint)

## Output Specification

**Modified files:**

- `scripts/build-utils.ts` -- 3 new exports (VAULT_GUARD_PROMPT, computeOutputCounts, buildErrorHandler)
- `scripts/build-compile.ts` -- Uses shared constant, counts, and error handler
- `scripts/build-deploy.ts` -- Uses shims, validation, counts, and error handler
- `scripts/build-all.ts` -- Uses shared error handler

**New files:**

- `scripts/branding.ts` -- Re-export shim for branding utilities
- `scripts/sanitize.ts` -- Re-export shim for sanitize utilities
