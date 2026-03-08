---
phase: 13
plan: 3
type: improvement
autonomous: true
wave: 1
depends_on: []
gap_closure: true
findings: [H5, H6]
---

# Phase 13 Plan 03: Remove Deprecated Legacy Hook Functions and Migrate Build Script

## Objective

Remove deprecated legacy functions from `src/hooks/__helpers/platform-adapters.ts` and `src/hooks/__helpers/config-generators.ts`, and migrate their sole remaining consumer (`scripts/build-shared.ts`) to use the canonical API instead. This eliminates approximately 230 lines of dead legacy code (H5, H6).

**Important finding during planning:** The deprecated functions are NOT fully dead -- `scripts/build-shared.ts` still actively calls the legacy `generateClaudeHooksConfig()`, `generateCursorHooksConfig()`, and `generatePiExtension()` functions. The `PlatformHookConfig` type and `canonicalToLegacy()` function from platform-adapters.ts are also still used by the active adapter architecture. This plan must migrate the build script FIRST, then remove the legacy code.

## Context

- @src/hooks/\_\_helpers/platform-adapters.ts (192 lines total; deprecated adapter functions + active type `PlatformHookConfig` + active function `canonicalToLegacy`)
- @src/hooks/\_\_helpers/config-generators.ts (485 lines total; ~230 lines of legacy functions starting at line 256)
- @scripts/build-shared.ts (actively calls legacy generators at lines 712, 721, 763)
- @src/hooks/index.ts (re-exports both canonical and legacy functions)
- @src/hooks/adapters/ (new adapter architecture that replaces the deprecated functions)

**CRITICAL:** Edits to `src/` files that compile to `.claude/`, `.cursor/`, `.pi/` require `bun run build:all` afterward. Do NOT run `bun run build:all` during the session -- note it as a manual step for the user.

## Tasks

### 1. Migrate build-shared.ts from legacy to canonical hook generators

**Type:** auto
**TDD:** false
**Depends on:** none

Update `scripts/build-shared.ts` to use the canonical API instead of the legacy generators:

1. Replace `generateClaudeHooksConfig(resolved, { commandPrefix, wrapInHooksKey })` with `generateClaudeHooksConfigFromCanonical(canonicalRegistry, { commandPrefix, wrapInHooksKey })`
2. Replace `generateCursorHooksConfig(resolved)` with `generateCursorHooksConfigFromCanonical(canonicalRegistry)`
3. Replace `generatePiExtension(...)` if still used, with `generatePiExtensionFromCanonical(canonicalRegistry, ...)`
4. Update the import statements to use canonical registry and generators
5. Remove the legacy `resolveHookRegistry()` call if no longer needed (replaced by `resolveCanonicalRegistry()`)

The canonical generators accept `Record<string, CanonicalHook>` instead of `Record<string, HookDefinition>`. The build script already has access to the canonical registry via `resolveCanonicalRegistry()`.

**Files to edit:**

- `scripts/build-shared.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `bun run scripts/build-shared.ts --dry-run` (if available) or type check confirms the script compiles
- No references to legacy generators remain in `scripts/build-shared.ts`

### 2. Remove legacy function exports from hooks/index.ts

**Type:** auto
**TDD:** false
**Depends on:** 1

Remove the re-exports of deprecated legacy functions from `src/hooks/index.ts`:

1. Remove the "Config generators -- legacy" export block (lines 63-68): `generateClaudeHooksConfig`, `generateCursorHooksConfig`, `generatePiExtension`
2. Remove deprecated adapter function exports from the "Platform adapters" block: `adaptForClaude`, `adaptForCursor`, `adaptForPi`, `CLAUDE_EVENT_MAP`, `CURSOR_EVENT_MAP`, `PI_EVENT_MAP`
3. Keep `canonicalToLegacy` and `PlatformHookConfig` as they are still used by the active adapter architecture

Also remove corresponding re-exports from the root `index.ts` if present.

**Files to edit:**

- `src/hooks/index.ts`
- `index.ts` (root barrel, if it re-exports legacy generators)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `grep -n "generateClaudeHooksConfig[^F]" src/hooks/index.ts` returns 0 results
- `grep -n "generateCursorHooksConfig[^F]" src/hooks/index.ts` returns 0 results

### 3. Remove legacy functions from config-generators.ts

**Type:** auto
**TDD:** false
**Depends on:** 1, 2

Remove the legacy function implementations from `src/hooks/__helpers/config-generators.ts`:

1. Delete `generateClaudeHooksConfig()` function (lines ~275-317)
2. Delete `generatePiExtension()` function and its helper functions `buildPiMatcherCheck()` and `buildPiStdinJson()` (lines ~340-445)
3. Delete `generateCursorHooksConfig()` function (lines ~461-485)
4. Remove the legacy section header comment (line ~256)
5. Remove the `HookDefinition` import if no longer needed
6. Remove the `adaptForClaude`, `adaptForCursor`, `adaptForPi` imports from `platform-adapters` if no longer needed

**Files to edit:**

- `src/hooks/__helpers/config-generators.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- File reduced by approximately 230 lines
- No legacy `HookDefinition`-accepting functions remain

### 4. Remove deprecated adapter functions from platform-adapters.ts

**Type:** auto
**TDD:** false
**Depends on:** 2, 3

Remove deprecated functions and constants from `src/hooks/__helpers/platform-adapters.ts`:

1. Delete `CLAUDE_EVENT_MAP` constant (lines ~32-38)
2. Delete `CURSOR_EVENT_MAP` constant (lines ~45-51)
3. Delete `PI_EVENT_MAP` constant (lines ~58-64)
4. Delete `adaptForClaude()` function (lines ~103-112)
5. Delete `adaptForCursor()` function (lines ~126-135)
6. Delete `adaptForPi()` function (lines ~149-162)
7. Update `canonicalToLegacy()` function -- it currently calls the deprecated `adaptForClaude`, `adaptForCursor`, `adaptForPi` functions. Either inline their logic or import from the new adapter architecture.

**Keep these (still actively used):**

- `PlatformHookConfig` interface (used by all 3 new adapters)
- `canonicalToLegacy()` function (used by `hook-registry.ts`)
- The `CanonicalHook`, `CanonicalEvent`, `HookDefinition` type imports (needed by kept code)

**Files to edit:**

- `src/hooks/__helpers/platform-adapters.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- No `@deprecated` markers remain on kept code
- File reduced by approximately 130 lines (keeping ~60 lines for PlatformHookConfig + canonicalToLegacy)

## Verification

- Type check passes: `bunx --bun tsc --noEmit`
- No legacy generator function calls remain: `grep -rn "generateClaudeHooksConfig[^F]\|generateCursorHooksConfig[^F]\|generatePiExtension[^F]" src/ scripts/` returns 0 results
- No deprecated adapter function calls remain: `grep -rn "adaptForClaude\|adaptForCursor\|adaptForPi" src/ scripts/` returns 0 results (except the new adapter files that use different function names)
- Build script still works correctly
- **Manual step required:** User must run `bun run build:all` after this plan completes to regenerate `.claude/`, `.cursor/`, `.pi/` outputs

## Success Criteria

- H5 closed: deprecated platform-adapters.ts functions removed (~130 lines)
- H6 closed: legacy config generators removed (~230 lines)
- Build script migrated to canonical API
- No regressions in type checking or build output

## Output Specification

- Updated `scripts/build-shared.ts` (uses canonical generators)
- Updated `src/hooks/index.ts` (no legacy exports)
- Updated `src/hooks/__helpers/config-generators.ts` (legacy functions removed)
- Updated `src/hooks/__helpers/platform-adapters.ts` (deprecated functions removed)
- Updated `index.ts` (root barrel, legacy exports removed)
- **Post-plan manual step:** `bun run build:all`
