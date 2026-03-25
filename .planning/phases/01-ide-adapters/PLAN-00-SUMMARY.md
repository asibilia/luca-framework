# PLAN-00 Summary: Shared Character Budget Utility

**Phase:** 1 — IDE Adapters
**Plan:** 00
**Status:** COMPLETE

## Tasks Completed

| #   | Task                                 | Commit     | Status |
| --- | ------------------------------------ | ---------- | ------ |
| 1   | Create enforceCharacterBudget helper | `29a65a23` | Done   |
| 2   | Export from adapters barrel          | `7cf0c985` | Done   |

## Files Created/Modified

- `src/adapters/__helpers/character-budget.ts` (new) -- shared character budget utility
- `src/adapters/index.ts` (modified) -- added barrel export

## Implementation Notes

### Algorithm: Section-Boundary Truncation

The `enforceCharacterBudget()` function implements the PREMORTEM-required section-boundary truncation strategy (Risk #2):

1. Fast path for content within budget (no-op)
2. Splits content into frontmatter (preserved intact) and body sections (split on `## ` headings)
3. Iterates sections in order, keeping as many as fit within the budget
4. When a section partially fits, truncates at the last complete line boundary
5. Appends a truncation marker with source path and removed character count

### Key Design Decisions

- **Frontmatter always preserved**: Even if frontmatter alone exceeds the budget, it is never truncated (required for rule validity per PREMORTEM)
- **Truncation marker reserves space**: The marker's character cost is pre-computed and reserved from the budget to prevent off-by-one overflows
- **Type exported**: `CharacterBudgetResult` type is publicly available for downstream consumers
- **No external dependencies**: Pure TypeScript, no lodash needed for this utility

## Verification

- `bunx --bun tsc --noEmit` passes on both commits
- Function signature matches plan spec
- JSDoc documents the section-boundary algorithm and truncation marker format
- `enforceCharacterBudget` is importable from `~/adapters`

## Deviations

None. Plan executed as specified.
