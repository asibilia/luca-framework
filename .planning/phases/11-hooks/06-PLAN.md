# Plan 11-06: Boundary Checker Multi-Line Import Fix & Observability Domain

## Frontmatter

- **ID**: 11-06
- **Title**: Boundary Checker Multi-Line Import Fix & Observability Domain
- **Phase**: 11 (Hooks)
- **Wave**: 2 (after 04 and 05)
- **Depends on**: 11-05
- **Delivers**: Roadmap item "Fix boundary checker multi-line import scanner (M13) and add observability domain (L9)"

## Objective

Fix the `extractTildeImports()` function in `scripts/check-domain-boundaries.ts` so it correctly handles multi-line import statements (where `import {` and `} from "~/..."` span multiple lines), and add the `observability` domain to the `DOMAIN_TIER` map at tier 1 (Core) so boundary violations involving that domain are detected.

## Context

- `scripts/check-domain-boundaries.ts` -- The boundary checker script (211 lines). Contains:
  - `DOMAIN_TIER` map (lines 24-36): Missing `observability` domain
  - `extractTildeImports()` function (lines 77-108): Line-by-line scanner that breaks early on multi-line imports
- `src/observability/` -- Existing domain with `__helpers/`, `__schemas/`, and `index.ts`. Tier 1 (Core) per domain architecture.
- `src/agents/__schemas/agent.schemas.ts` -- Example of a file with multi-line `~/` imports (lines 6-9: `import { ... } from "~/complexity/__schemas/..."` spans 4 lines)

### The Multi-Line Import Bug

The current `extractTildeImports()` scanner processes files line by line. For multi-line imports like:

```typescript
import {
  ModelIdSchema,
  ModelTierSchema,
} from "~/complexity/__schemas/complexity.schemas";
```

The scanner processes:

1. Line `import {` -- starts with `import`, no `from "~/"` match, continues
2. Line `  ModelIdSchema,` -- does NOT start with `import`, `export`, or `}` -- **breaks early**
3. Lines 3-4 are never reached; the `~/complexity` import is missed

This means the boundary checker silently misses cross-domain imports that use multi-line `import { ... } from "~/..."` syntax. Currently there are multi-line `~/` imports in at least `src/agents/__schemas/agent.schemas.ts` (lines 6-9), `src/context/__helpers/hydration-snapshot.ts` (lines 18-22), and others.

## Tasks

### 1. Fix extractTildeImports() for multi-line imports

**Type:** auto
**TDD:** false
**Depends on:** None

Rewrite the `extractTildeImports()` function in `scripts/check-domain-boundaries.ts` to handle multi-line import/export statements. The fix must:

1. Track whether we are inside a multi-line import statement (saw `import {` or `export {` without a closing `}` on the same line)
2. While inside a multi-line import, continue scanning lines (do not break on lines that contain identifiers like `ModelIdSchema,`)
3. When the closing `} from "~/..."` line is reached, extract the `~/` path
4. Still stop scanning at the first true non-import declaration (a line that is not an import/export statement, not a continuation of one, and not a comment)

**Approach:** Use a state flag `insideMultiLineImport` that is set when a line starts with `import`/`export` and contains `{` but not `}` on the same line. While the flag is set, continue scanning without breaking. When `}` is found (with or without `from`), check for the `from "~/..."` pattern and clear the flag.

**Alternative approach (simpler):** Instead of line-by-line scanning with early termination, use a regex that matches the entire import block. Join lines until the import zone ends, then extract all `from "~/..."` patterns. The import zone ends at the first line that does not start with `import`, `export`, `}`, whitespace-then-identifier (continuation), or a comment.

**Files to edit:**

- `scripts/check-domain-boundaries.ts`

**Verification:**

- Multi-line `import { ... } from "~/..."` statements are correctly extracted
- Single-line imports still work as before
- The scanner still stops at the first non-import declaration (avoids false positives from template literals)
- `bunx --bun tsc --noEmit` passes
- `bun run scripts/check-domain-boundaries.ts` runs without errors (may find new violations from previously missed imports -- these should be evaluated)

### 2. Add observability domain to DOMAIN_TIER map

**Type:** auto
**TDD:** false
**Depends on:** None

Add `observability: 1` to the `DOMAIN_TIER` record in `scripts/check-domain-boundaries.ts` (line 24). The `observability` domain is a T1 Core domain, alongside `context`, `planner`, `harness`, and `iteration`.

**Files to edit:**

- `scripts/check-domain-boundaries.ts`

**Verification:**

- `DOMAIN_TIER` contains `observability: 1`
- `bun run scripts/check-domain-boundaries.ts` includes `observability` domain files in its scan
- No false violations reported for observability (it should import from T0 shared/complexity only)
- `bunx --bun tsc --noEmit` passes

### 3. Verify boundary checker runs clean

**Type:** checkpoint:human-verify
**TDD:** false
**Depends on:** 1, 2

Run the boundary checker and evaluate results:

```bash
bun run scripts/check-domain-boundaries.ts
```

**Expected outcomes:**

- The checker now scans `observability` domain files and detects any tier violations
- Multi-line imports are now correctly detected, which may surface previously hidden violations
- If new violations are found, evaluate whether they are:
  - **True violations** that need fixing (file these as follow-up work)
  - **Known exceptions** that need adding to the `EXCEPTIONS` array
- The checker should exit 0 (clean) or any violations should be documented

**Verification:**

- Boundary checker output is reviewed
- Any new violations are triaged (true violation vs. known exception)
- If violations are found, they are either fixed or added to `EXCEPTIONS` with documented rationale

## Verification

1. Multi-line imports with `~/` paths are correctly extracted by `extractTildeImports()`
2. `DOMAIN_TIER` includes `observability: 1`
3. `bun run scripts/check-domain-boundaries.ts` runs successfully
4. `bunx --bun tsc --noEmit` passes
5. Any newly discovered violations are triaged and documented

## Success Criteria

- Boundary checker correctly parses multi-line import statements (no silent misses)
- Observability domain is included in boundary checking at tier 1
- Boundary checker runs clean (exit 0) or any violations are documented as known exceptions
- No TypeScript regressions

## Output Specification

- `scripts/check-domain-boundaries.ts` (modified: multi-line import fix + observability domain)
