---
phase: 1
plan: 1
type: feature
autonomous: true
wave: 1
depends_on: []
---

# Phase 1 Plan 1: Core Branding Infrastructure Utilities

## Objective

Create the two foundational branding utilities that Phase 2 and Phase 3 depend on: `readProjectBranding()` in the existing `branding.ts` and a new `alias-skill.ts` with `createAliasSkill()` / `cleanupStaleAlias()`. These utilities enable per-project command-prefix aliasing so users who configure custom branding during `vault:init` see their chosen prefix in the user-facing surface.

> Appetite: Small (remaining budget within 50000 token ceiling, target ~40% context)

## Context

- @packages/luca-framework/src/utils/branding.ts -- existing `defaultBranding`, `mergeBranding()`, `BrandingConfig` type
- @packages/luca-framework/src/utils/sanitize.ts -- `safeSanitizeJsonParse()` for safe JSON parsing
- @packages/luca-framework/src/utils/vault-setup.ts -- canonical `Bun.file().exists()` + config-read pattern (lines 259-266)
- @packages/luca-framework/src/utils/luca-home.ts -- `mkdir` + `Bun.write` pattern
- @packages/luca-framework/src/utils/files.ts -- `readdir` pattern for directory scanning
- @packages/luca-framework/src/types.ts -- `BrandingConfig` interface (4 fields)
- @.planning/phases/01-core-branding-infrastructure/01-CONTEXT.md -- locked decisions
- @.planning/phases/01-core-branding-infrastructure/01-RESEARCH.md -- implementation sketches and pitfalls
- @.planning/phases/01-core-branding-infrastructure/PREMORTEM.md -- risk mitigations

## Tasks

### 1. Add readProjectBranding() to branding.ts

**Type:** auto
**TDD:** false
**Depends on:** none

Add an async function `readProjectBranding(projectDir?)` to the existing `packages/luca-framework/src/utils/branding.ts`. This function reads `.planning/config.json` from the project directory, extracts the `branding` section, merges with defaults via the existing `mergeBranding()`, and returns a complete `BrandingConfig`. It must never throw -- all error paths return `defaultBranding`.

Follow the vault-setup.ts config-read pattern exactly:

1. Build path with `join(projectDir, '.planning', 'config.json')`
2. Guard with `Bun.file(path).exists()`
3. Parse with `safeSanitizeJsonParse(await file.text())`
4. Extract `raw.branding` with nullish coalescing (`?? {}`)
5. Return `mergeBranding(partial)`

Import `join` from `pathe` and `safeSanitizeJsonParse` from `./sanitize` (both already used in adjacent utils).

**Files to create/edit:**

- `packages/luca-framework/src/utils/branding.ts` (edit -- add ~15 lines)

**Verification:**

- `bunx --bun tsc --noEmit` passes with zero errors
- Function signature: `readProjectBranding(projectDir?: string): Promise<BrandingConfig>`
- Returns `defaultBranding` when config file is missing
- Returns `defaultBranding` when config JSON is malformed
- Returns merged config when branding section is present
- No try/catch needed at call sites -- function handles all errors internally

### 2. Create alias-skill.ts with createAliasSkill() and cleanupStaleAlias()

**Type:** auto
**TDD:** false
**Depends on:** none

Create a new file `packages/luca-framework/src/utils/alias-skill.ts` exporting two async functions.

**createAliasSkill(prefix, frameworkName, projectDir?)**

- Skip immediately if `prefix === 'lu'` (no alias needed for default)
- Create directory `.claude/skills/{prefix}/` with `mkdir({ recursive: true })` from `node:fs/promises`
- Write `SKILL.md` via `Bun.write()` containing:
  - Line 1: marker comment `<!-- luca-alias: auto-generated -->`
  - Skill title `# /{prefix}`
  - Description referencing `frameworkName`
  - `## main` section instructing delegation to `/lu` via `Skill(skill: "lu", args: "$ARGS")`
- Wrap entire operation in try/catch -- log error with actionable message on failure, never throw

**cleanupStaleAlias(newPrefix, projectDir?)**

- Resolve `.claude/skills/` directory path
- Try `readdir()` from `node:fs/promises` -- if ENOENT, return early (directory does not exist yet)
- For each entry that is NOT `newPrefix`:
  - Read `{entry}/SKILL.md` via `Bun.file().text()`
  - Check if content includes the marker `<!-- luca-alias: auto-generated -->` (position-independent via `string.includes()`)
  - If marker found, remove directory with `rm({ recursive: true, force: true })`
- Skip entries where `entry === newPrefix` to avoid removing the current alias (Pitfall 4 from RESEARCH.md)

Import `readdir`, `mkdir`, `rm` from `node:fs/promises` for directory operations. Import `join` from `pathe`. Use `Bun.file()` / `Bun.write()` for file I/O per Bun-preference rule.

Add complete JSDoc documentation for both exported functions with parameter descriptions, return types, and usage examples.

**Files to create/edit:**

- `packages/luca-framework/src/utils/alias-skill.ts` (create -- ~80 lines)

**Verification:**

- `bunx --bun tsc --noEmit` passes with zero errors
- `createAliasSkill('pt', 'Cent')` would create `.claude/skills/pt/SKILL.md` with marker
- `createAliasSkill('lu', 'Luca')` returns immediately without creating files
- `cleanupStaleAlias('pt')` removes any other alias directories containing the marker
- `cleanupStaleAlias('pt')` does NOT remove `.claude/skills/pt/`
- `cleanupStaleAlias('pt')` does NOT remove skill directories without the marker
- Neither function throws -- all errors are caught and logged

## Verification

1. Run `bunx --bun tsc --noEmit` from repo root -- zero type errors
2. Confirm `readProjectBranding` is exported from `branding.ts` and has correct return type
3. Confirm `createAliasSkill` and `cleanupStaleAlias` are exported from `alias-skill.ts`
4. Confirm no new dependencies added (all imports are from existing deps or built-ins)
5. Confirm functional patterns used (no classes)
6. Confirm kebab-case file naming (`alias-skill.ts`)
7. Confirm JSDoc documentation on all exported functions

## Success Criteria

- Two new exported functions in `branding.ts` (1 new) and `alias-skill.ts` (2 new)
- All three functions are async, never throw, and handle errors gracefully
- Type-check passes cleanly
- No new `bun add` calls required
- Implementation follows established patterns from vault-setup.ts, luca-home.ts, and files.ts
- Ready for Phase 2 to consume these utilities in vault-init wiring

## Output Specification

- **Modified:** `packages/luca-framework/src/utils/branding.ts` -- adds `readProjectBranding()`
- **Created:** `packages/luca-framework/src/utils/alias-skill.ts` -- adds `createAliasSkill()` and `cleanupStaleAlias()`
