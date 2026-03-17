---
phase: 191
plan: 1
type: feature
autonomous: true
wave: 1
depends_on: []
---

# Phase 191 Plan 1: Extract Template Transform Module into Compilers Domain

## Objective

Create `src/compilers/__helpers/template-transform.ts` by extracting the branding transform functions from `scripts/copy-harness-templates.ts` and exporting the public API from `src/compilers/index.ts`.

This gives downstream phases (192+) a properly-placed, importable transform layer without modifying any build scripts or compiler internals.

> Appetite: Small (50000 tokens remaining of 50000 ceiling)

## Context

@scripts/copy-harness-templates.ts (lines 30-203 — transform functions to extract)
@src/compilers/\_\_helpers/compile.ts (existing compiler — DO NOT MODIFY)
@src/compilers/index.ts (barrel — add export)
@.planning/phases/191-compiler-ejs-output/191-CONTEXT.md (decisions and scope guardrail)

## Tasks

### 1. Create template-transform.ts with extracted transform functions

**Type:** auto
**TDD:** false
**Depends on:** none

Extract the following from `scripts/copy-harness-templates.ts` into `src/compilers/__helpers/template-transform.ts`:

1. `CONTENT_EXCLUSIONS` constant (lines 30-43)
2. `SOURCE_FILE_PATTERN` regex (line 54)
3. `transformBrandingContent()` function (lines 73-163)
4. `transformBrandingFilename()` function (lines 183-188)
5. `transformBrandingDirname()` function (lines 198-203)
6. `transformOutputsToTemplates()` — NEW wrapper function that accepts a `Map<string, string>` (filepath -> content) and returns a new Map with both keys (filenames) and values (content) transformed

Copy the functions exactly as-is. Do not refactor the regex logic or exclusion list. The only new code is the `transformOutputsToTemplates()` wrapper.

The wrapper function should:

- Iterate over each Map entry
- Transform the filename portion of each key path using `transformBrandingFilename()` and `transformBrandingDirname()`
- Transform the content value using `transformBrandingContent()`
- Return a new Map with transformed keys and values
- Only transform `.md` file content (non-md files pass through unchanged, matching existing behavior)

Export all five functions (three extracted + one new wrapper + constants/regex for testability).

**Files to create:**

- `src/compilers/__helpers/template-transform.ts`

**Verification:**

- File exists at correct path
- Contains all five functions with correct signatures
- `CONTENT_EXCLUSIONS` and `SOURCE_FILE_PATTERN` match source exactly
- `transformBrandingContent` regex logic is identical to source (7 replacement patterns)
- `bunx --bun tsc --noEmit` passes

### 2. Export transformOutputsToTemplates from compilers barrel

**Type:** auto
**TDD:** false
**Depends on:** 1

Add the public API export to `src/compilers/index.ts`:

- `transformOutputsToTemplates` (the main consumer-facing function)
- `transformBrandingContent`, `transformBrandingFilename`, `transformBrandingDirname` (for granular use and testability)
- `CONTENT_EXCLUSIONS` (for downstream validation)

**Files to edit:**

- `src/compilers/index.ts`

**Verification:**

- Barrel exports the new functions
- `bunx --bun tsc --noEmit` passes
- No changes to any other files in `src/compilers/`

## Verification

1. `bunx --bun tsc --noEmit` passes with zero errors
2. `src/compilers/__helpers/template-transform.ts` exists and exports all required functions
3. `src/compilers/index.ts` re-exports the public API
4. No modifications to `src/compilers/__helpers/compile.ts` or any build scripts
5. The `transformBrandingContent()` regex patterns are byte-identical to the source in `scripts/copy-harness-templates.ts` (7 patterns: YAML name, skills dir, heading, slash command, agent name refs, .claude/luca/ path, brand name Luca)

## Success Criteria

- The transform module is importable via `import { transformOutputsToTemplates } from "~/compilers"`
- The extracted functions produce identical output to the originals in `scripts/copy-harness-templates.ts`
- No build scripts, compiler internals, or existing barrel exports are modified
- Type-checking passes cleanly

## Output Specification

- `src/compilers/__helpers/template-transform.ts` — New module with extracted transform functions
- `src/compilers/index.ts` — Updated barrel with new exports
