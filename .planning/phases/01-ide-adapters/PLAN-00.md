---
phase: 1
plan: 0
type: feature
autonomous: true
wave: 0
depends_on: []
---

# Phase 1 Plan 0: Shared Character Budget Utility

## Objective

Create `src/adapters/__helpers/character-budget.ts` -- a shared utility that enforces IDE-specific character limits by truncating content at section boundaries. This utility is a prerequisite for the Windsurf adapter (12K per workspace rule, 6K global) and the VS Code adapter (30K per agent profile).

## Context

@src/adapters/**schemas/adapter.schemas.ts (EmitResult type -- warnings array for truncation notices)
@src/shared/**helpers/format.ts (SectionSchema -- title + content + order)
@.planning/phases/01-ide-adapters/PREMORTEM.md (Risk #2: naive slice breaks content)
@.planning/phases/01-ide-adapters/01-CONTEXT.md (Decision #2: shared character budget)

## Tasks

### 1. Create enforceCharacterBudget helper

**Type:** auto
**TDD:** false
**Depends on:** none

Create `src/adapters/__helpers/character-budget.ts` with the following function:

```typescript
enforceCharacterBudget(content: string, maxChars: number, sourcePath: string): { result: string; truncated: boolean; warning: string | null }
```

**Algorithm (section-boundary truncation, NOT raw slice):**

1. If `content.length <= maxChars`, return content unchanged.
2. Split content into frontmatter (everything between first `---` and second `---`) and body sections (split on `## ` heading markers).
3. Preserve frontmatter entirely (it is required for rule validity).
4. Iterate sections in reverse order (lowest priority last), dropping entire sections until the total fits within `maxChars`.
5. If a single section still exceeds the budget after all others are dropped, truncate that section at the last complete line that fits.
6. Append a truncation marker: `\n\n[Truncated -- full content at {sourcePath}. {removedChars} chars removed.]\n`
7. Return `{ result, truncated: true, warning }` where warning is a human-readable string for `EmitResult.warnings`.

**Key constraints from PREMORTEM:**

- MUST truncate at section boundaries, not raw character offsets.
- Frontmatter must be preserved intact (never truncated).

**Files to create/edit:**

- `src/adapters/__helpers/character-budget.ts` (new)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Function signature matches the spec above
- JSDoc documents the section-boundary algorithm and the truncation marker format

### 2. Export from adapters barrel

**Type:** auto
**TDD:** false
**Depends on:** 1

Add export for `enforceCharacterBudget` to `src/adapters/index.ts`.

**Files to create/edit:**

- `src/adapters/index.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `enforceCharacterBudget` is importable from `~/adapters`

## Verification

- `bunx --bun tsc --noEmit` passes with no errors
- `bun run scripts/check-domain-boundaries.ts` reports no violations (character-budget.ts is in T3 adapters domain, imports only from T0 shared)
- The function handles edge cases: content already under budget (no-op), empty content, content with no sections, content with only frontmatter

## Success Criteria

- `enforceCharacterBudget` is importable from `~/adapters`
- Truncation respects section boundaries per PREMORTEM Risk #2
- A descriptive warning string is returned when truncation occurs
- Frontmatter is never truncated

## Output Specification

- `src/adapters/__helpers/character-budget.ts` -- shared truncation utility
- Updated `src/adapters/index.ts` -- barrel export
