---
phase: 220
plan: 1
type: fix
autonomous: true
wave: 1
---

# Phase 220 — Layout & Architecture Cleanup

## Objective

Fix the detail panel dual-rendering bug and address architecture findings from the studio quality audit.

## Tasks

### Task 1: Fix detail panel dual-rendering (Finding #2 — HIGH)

**File:** `packages/luca-studio/components/layout/layout-shell.tsx`

Both `isDocked` and `isFloating` can render `DetailPanel` simultaneously when the panel state atom is manipulated. Add `&& !isFloating` guard to the `isDocked` rendering branch to prevent dual rendering.

**Verification:** Only one `<DetailPanel>` renders at a time regardless of `panelState` value.

### Task 2: Add missing barrel type exports (Finding #10 — MEDIUM)

**File:** `packages/luca-studio/components/shared/index.ts`
**Also:** `packages/luca-studio/components/shared/diff-preview.tsx`, `packages/luca-studio/components/shared/shiki-code-block.tsx`

Export `DiffPreviewProps` and `ShikiCodeBlockProps` from their source files, then re-export from the barrel `shared/index.ts`.

**Verification:** All public prop types are available from the barrel import.

### Task 3: Extract CONFIG_SECTIONS constant (Finding #11 — MEDIUM)

**File:** `packages/luca-studio/hooks/use-config-save.ts`

The hardcoded array `["complexity", "gates", "harness"]` is inline in the hook body. Extract to a module-level `CONFIG_SECTIONS` constant with JSDoc.

**Verification:** CONFIG_SECTIONS is declared at module top, used in save callback.

### Task 4: Document ETag header pattern (Finding #14 — LOW)

The `If-Match` ETag header pattern (create headers, conditionally add etag) is repeated across 4+ save hooks. The pattern is only 3-4 lines and extracting a helper would add more indirection than it saves. Document with a code comment in `use-config-save.ts` noting the shared pattern for future consolidation.

**Verification:** Comment documents the pattern and references other save hooks.

### Task 5: Add @private JSDoc to \_saveCallbackAtom (Finding #17 — LOW)

**File:** `packages/luca-studio/stores/layout.ts`

Add `/** @private */` JSDoc tag above the `_saveCallbackAtom` declaration to formally mark it as internal.

**Verification:** `_saveCallbackAtom` has `@private` JSDoc annotation.

## Success Criteria

- [ ] Only one DetailPanel renders at a time
- [ ] Barrel exports all shared prop types
- [ ] CONFIG_SECTIONS is a module-level constant
- [ ] \_saveCallbackAtom documented as @private
- [ ] TypeScript compiles cleanly (`bunx --bun tsc --noEmit -p packages/luca-studio/tsconfig.json`)
