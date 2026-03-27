# Phase 220 — Layout & Architecture Cleanup — Summary

## Outcome: COMPLETE

All 5 audit findings addressed in a single atomic commit.

## Tasks Completed

| #   | Finding                     | Severity | File(s)                                                       | Status     |
| --- | --------------------------- | -------- | ------------------------------------------------------------- | ---------- |
| 1   | Detail panel dual-rendering | HIGH     | `layout-shell.tsx`                                            | Fixed      |
| 2   | Missing barrel type exports | MEDIUM   | `shared/index.ts`, `diff-preview.tsx`, `shiki-code-block.tsx` | Fixed      |
| 3   | Hardcoded config sections   | MEDIUM   | `use-config-save.ts`                                          | Fixed      |
| 4   | ETag header pattern         | LOW      | `use-config-save.ts`                                          | Documented |
| 5   | Atom documentation          | LOW      | `stores/layout.ts`                                            | Fixed      |

## Changes

### Task 1 — Detail panel dual-render guard (Finding #2)

Added mutual-exclusion guards to both DetailPanel render branches in `layout-shell.tsx`:

- Docked branch: `{isDocked && !isFloating && ...}`
- Floating branch: `{isFloating && !isDocked && ...}`

While `panelState` is a single-value union (so both can never be true from the same atom read), the guards provide defense-in-depth against state manipulation bugs.

### Task 2 — Missing barrel type exports (Finding #10)

- Promoted `DiffPreviewProps` to `export type` in `diff-preview.tsx`
- Promoted `ShikiCodeBlockProps` to `export type` in `shiki-code-block.tsx`
- Added `export type { DiffPreviewProps }` and `export type { ShikiCodeBlockProps }` to `shared/index.ts`

### Task 3 — CONFIG_SECTIONS constant (Finding #11)

Extracted `["complexity", "gates", "harness"]` to a module-level `CONFIG_SECTIONS` constant with JSDoc in `use-config-save.ts`. The save callback now references this constant instead of an inline array.

### Task 4 — ETag header pattern documentation (Finding #14)

Added a NOTE comment to the `putSection` JSDoc in `use-config-save.ts` listing all save hooks that share the pattern and suggesting extraction to `lib/fetch-helpers.ts` if the pattern grows. Opted against extraction because the pattern is only 3-4 lines and a helper would add more indirection than it saves.

### Task 5 — @private JSDoc on \_saveCallbackAtom (Finding #17)

Added `@private` JSDoc tag to the `_saveCallbackAtom` declaration in `stores/layout.ts`.

## Verification

- TypeScript: `bunx --bun tsc --noEmit -p packages/luca-studio/tsconfig.json` -- all errors are pre-existing (harness-tab.tsx, raw-config-editor.tsx, file-watcher.ts); no new errors introduced.

## Deviations

None.

## Commit

- `ba60759f` — fix(studio): detail panel dual-render guard and architecture cleanup (#111)

## Files Modified

- `packages/luca-studio/components/layout/layout-shell.tsx`
- `packages/luca-studio/components/shared/diff-preview.tsx`
- `packages/luca-studio/components/shared/index.ts`
- `packages/luca-studio/components/shared/shiki-code-block.tsx`
- `packages/luca-studio/hooks/use-config-save.ts`
- `packages/luca-studio/stores/layout.ts`
