---
phase: 1
plan: 1
type: improvement
autonomous: true
wave: 1
depends_on: []
---

# Phase 1 Plan 1: Adapter DRY Extraction

## Objective

Extract three categories of duplicated code across cursor-adapter.ts, windsurf-adapter.ts, and vscode-adapter.ts into shared helpers within `src/adapters/__helpers/`. This closes HIGH audit findings #1, #2, and #3 from the v7.2.0 audit without changing external API surface or adapter behavior.

> Appetite: Medium (100000 tokens remaining of 100000 ceiling)

## Context

@src/adapters/cursor/cursor-adapter.ts
@src/adapters/windsurf/windsurf-adapter.ts
@src/adapters/vscode/vscode-adapter.ts
@src/adapters/**helpers/character-budget.ts
@src/adapters/**schemas/adapter.schemas.ts
@src/adapters/index.ts
@src/shared/**helpers/format.ts (contains `toClaudeFormat` and `Section` type -- related but intentionally NOT the extraction target since adapter sections differ slightly in join semantics)
@src/shared/**helpers/utils.ts (contains `formatFrontmatter` -- already used by vscode-adapter)

### Duplication Analysis

**sectionsToMarkdown (HIGH #1):**
Three identical functions exist with different names:

- `sectionsToMarkdown()` in cursor-adapter.ts (lines 35-45)
- `compileSectionsToBody()` in windsurf-adapter.ts (lines 123-135)
- `concatenateSections()` in vscode-adapter.ts (lines 49-59)

All three: `orderBy(sections, [s => s.order ?? 0], ['asc'])`, map to `## title\n\ncontent`, `.join('\n\n').trim()`. Extraction is safe -- the shared format.ts `toClaudeFormat` uses slightly different join semantics (trailing `\n\n` per section vs `\n\n` separator), so a new adapter-scoped helper is correct.

**emit() orchestration (HIGH #2):**
Cursor and Windsurf have byte-identical emit patterns: iterate `compiledOutputs` Map, `mkdir -p`, `Bun.write`, construct `EmitResult`, clear buffer. VS Code's emit has the same core loop but adds a copilot-instructions aggregation step. The shared helper should accept an optional pre-write hook or post-process callback to handle VS Code's aggregation.

**Frontmatter building (HIGH #3):**

- Cursor: manual string concatenation (lines 66-91)
- Windsurf: manual string concatenation via `buildWindsurfFrontmatter()` (lines 97-110)
- VS Code: already uses `formatFrontmatter()` from `~/shared/__helpers/utils`

Resolution: Cursor and Windsurf should adopt `formatFrontmatter()` from shared utils. This unifies all three adapters on the same frontmatter builder. Cursor's `alwaysApply` logic and Windsurf's `trigger` mapping remain in their respective adapters (they are adapter-specific field mapping, not frontmatter serialization).

## Tasks

### 1. Create shared helper: format-sections.ts

**Type:** auto
**TDD:** false
**Depends on:** none

Extract the duplicated sections-to-markdown function into `src/adapters/__helpers/format-sections.ts`.

The function should:

- Accept `Section[]` (or `ReadonlyArray<Section>`) parameter
- Sort by `order` ascending (nulls as 0) using `orderBy`
- Map each section to `## {title}\n\n{content}` (or bare `{content}` when no title)
- Join with `\n\n` separator
- Trim and return

Name the exported function `sectionsToMarkdown` (matching the most descriptive existing name).

Import `Section` type from `~/shared/__helpers/format` and `orderBy` from `lodash/orderBy`.

**Files to create:**

- `src/adapters/__helpers/format-sections.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Function signature matches all three current call sites
- JSDoc documents the function with parameter descriptions and an example

### 2. Create shared helper: adapter-emit.ts

**Type:** auto
**TDD:** false
**Depends on:** none

Extract the duplicated emit orchestration logic into `src/adapters/__helpers/adapter-emit.ts`.

The shared function should:

- Accept a `compiledOutputs: Map<string, string>`, an `outputDir: string`, and an optional `options` object
- The options object supports:
  - `preEmit?: (entries: Map<string, string>) => { files: Map<string, string>; extraFiles?: Array<{ path: string; content: string }>; warnings?: string[] }` -- allows VS Code adapter to aggregate copilot-instructions before the write loop
  - `existingWarnings?: string[]` -- warnings accumulated during compilation (VS Code's ruleWarnings)
- Iterate the (possibly transformed) map entries: `mkdir -p` parent dirs, `Bun.write` each file
- Write any `extraFiles` returned by preEmit
- Construct and return `EmitResult` with correct `filesWritten`, `filesPaths`, and merged `warnings`
- Clear the `compiledOutputs` buffer after emission

Name the exported function `emitCompiledOutputs`.

**Files to create:**

- `src/adapters/__helpers/adapter-emit.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Function signature supports all three adapter emit patterns (cursor: simple, windsurf: simple, vscode: with preEmit hook)
- JSDoc documents all parameters and the preEmit callback contract

### 3. Refactor cursor-adapter.ts to use shared helpers

**Type:** auto
**TDD:** false
**Depends on:** 1, 2

Update cursor-adapter.ts:

- Remove the local `sectionsToMarkdown()` function (lines 35-45)
- Import `sectionsToMarkdown` from `../__helpers/format-sections`
- Remove the local `emit` implementation that manually iterates `compiledOutputs`
- Import `emitCompiledOutputs` from `../__helpers/adapter-emit`
- Replace the `emit` method body with a call to `emitCompiledOutputs(compiledOutputs, outputDir)`
- Replace manual frontmatter string building in `compileCursorRule()` with `formatFrontmatter()` from `~/shared/__helpers/utils`. Build a plain object with `description`, conditionally `globs` (joined string), and `alwaysApply` (computed boolean), then pass to `formatFrontmatter()`. The alwaysApply resolution logic (explicit > no-globs-default > false) stays in the adapter.
- Remove the `import { mkdir } from "node:fs/promises"` and `import { dirname } from "node:path"` (no longer needed after emit extraction). Keep `join` import if still used by `detect()`.

**Files to edit:**

- `src/adapters/cursor/cursor-adapter.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- No remaining local `sectionsToMarkdown` or `compileSectionsToBody` function
- No remaining manual `for (const [relativePath, content] of compiledOutputs)` loop
- No remaining manual frontmatter string concatenation (no `frontmatterLines` array)
- The compiled output for rules still produces valid YAML frontmatter with `---` delimiters

### 4. Refactor windsurf-adapter.ts to use shared helpers

**Type:** auto
**TDD:** false
**Depends on:** 1, 2

Update windsurf-adapter.ts:

- Remove the local `compileSectionsToBody()` function (lines 123-135)
- Import `sectionsToMarkdown` from `../__helpers/format-sections`
- Replace all calls to `compileSectionsToBody()` with `sectionsToMarkdown()`
- Remove the local `emit` implementation
- Import `emitCompiledOutputs` from `../__helpers/adapter-emit`
- Replace the `emit` method body with a call to `emitCompiledOutputs(compiledOutputs, outputDir)`
- Replace manual frontmatter building in `buildWindsurfFrontmatter()` with `formatFrontmatter()` from `~/shared/__helpers/utils`. Build a plain object with `trigger`, `description`, and conditionally `globs`, then pass to `formatFrontmatter()`. The `mapTrigger()` function stays in the adapter (adapter-specific logic).
- Remove unused imports (`mkdir`, `dirname`) after emit extraction. Keep `join` if still needed.

**Files to edit:**

- `src/adapters/windsurf/windsurf-adapter.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- No remaining local `compileSectionsToBody` function
- No remaining manual emit loop
- No remaining manual frontmatter string concatenation (no `buildWindsurfFrontmatter` function)
- Windsurf rule output still produces YAML frontmatter with trigger field

### 5. Refactor vscode-adapter.ts to use shared helpers

**Type:** auto
**TDD:** false
**Depends on:** 1, 2

Update vscode-adapter.ts:

- Remove the local `concatenateSections()` function (lines 49-59)
- Import `sectionsToMarkdown` from `../__helpers/format-sections`
- Replace all calls to `concatenateSections()` with `sectionsToMarkdown()`
- Remove the local `emit` implementation
- Import `emitCompiledOutputs` from `../__helpers/adapter-emit`
- Replace the `emit` method body with a call to `emitCompiledOutputs()`, passing a `preEmit` hook that:
  1. Extracts `copilot-instructions/*` entries from the map
  2. Aggregates them into a single `copilot-instructions.md` with `\n\n---\n\n` separators
  3. Returns the modified map (without copilot entries) plus the aggregated file as an extraFile
- Pass `ruleWarnings` as `existingWarnings` option
- Clear `ruleWarnings` after emit (or let the shared helper handle it via a post-emit callback)
- Remove unused imports (`mkdir`, `dirname`) after emit extraction. Keep `join` if still needed.
- vscode-adapter.ts already uses `formatFrontmatter()` from shared utils, so no frontmatter changes needed.

**Files to edit:**

- `src/adapters/vscode/vscode-adapter.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- No remaining local `concatenateSections` function
- No remaining manual emit loop
- copilot-instructions aggregation still works correctly via preEmit hook
- Re-exported compile functions (`compileVscodeAgent`, `compileVscodeSkill`, `compileVscodeRule`) still accessible

### 6. Update barrel exports

**Type:** auto
**TDD:** false
**Depends on:** 1, 2

Add exports for the new shared helpers to `src/adapters/index.ts` if they are useful for external consumers. Specifically:

- Export `sectionsToMarkdown` from `__helpers/format-sections` (useful for custom adapter authors)
- Export `emitCompiledOutputs` from `__helpers/adapter-emit` (useful for custom adapter authors)
- Add appropriate type exports if any new types are defined

Review whether any removed functions (e.g., `buildWindsurfFrontmatter`) were previously exported from sub-module barrels. If so, remove those exports cleanly.

**Files to edit:**

- `src/adapters/index.ts`
- `src/adapters/cursor/index.ts` (if it re-exports anything removed)
- `src/adapters/windsurf/index.ts` (if it re-exports anything removed)
- `src/adapters/vscode/index.ts` (if it re-exports anything removed)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- No broken import paths in any consumer
- `bun run scripts/check-domain-boundaries.ts` passes (all imports stay within T3 or T0)

## Verification

1. **Type check**: `bunx --bun tsc --noEmit` passes with zero errors
2. **Domain boundary check**: `bun run scripts/check-domain-boundaries.ts` passes -- all new helpers are within `src/adapters/__helpers/` (T3), importing only from `~/shared` (T0) and `lodash` (external)
3. **No behavior change**: The three adapter factory functions (`createCursorAdapter`, `createWindsurfAdapter`, `createVscodeAdapter`) return Adapter objects with identical external behavior -- same compiled output strings, same EmitResult shapes, same detect behavior
4. **No API change**: The Adapter interface and EmitResult type are untouched
5. **Drift check**: `bun run check:drift` passes (no generated output affected since adapters are source, not generated)

## Success Criteria

- Zero duplicated sectionsToMarkdown/compileSectionsToBody/concatenateSections functions -- single source of truth in `format-sections.ts`
- Zero duplicated emit orchestration loops -- single source of truth in `adapter-emit.ts`
- All three non-Claude adapters use `formatFrontmatter()` from shared utils for YAML frontmatter serialization
- All three HIGH audit findings (#1, #2, #3) closed
- `bunx --bun tsc --noEmit` and `bun run scripts/check-domain-boundaries.ts` pass

## Output Specification

**New files:**

- `src/adapters/__helpers/format-sections.ts` -- shared `sectionsToMarkdown()` function
- `src/adapters/__helpers/adapter-emit.ts` -- shared `emitCompiledOutputs()` function

**Modified files:**

- `src/adapters/cursor/cursor-adapter.ts` -- uses shared helpers, removes local duplicates
- `src/adapters/windsurf/windsurf-adapter.ts` -- uses shared helpers, removes local duplicates
- `src/adapters/vscode/vscode-adapter.ts` -- uses shared helpers, removes local duplicates
- `src/adapters/index.ts` -- exports new shared helpers
