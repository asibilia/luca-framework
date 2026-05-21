---
phase: 214
plan: 2
type: bug
autonomous: true
wave: 1
depends_on: []
---

# Phase 214 Plan 2: Fix Build Pages Entity Sidebar Layout

## Objective

Fix the P0 layout issue where build pages (Agents, Skills, Rules) have their entity list inaccessible because `layoutContext = "editor"` force-collapses the nav rail to 48px. The nav rail collapse is intentional (editor pages need horizontal space), but the entity sidebar panel currently renders inside the main content area behind the collapsed nav rail. The fix adjusts the LayoutShell grid to support an optional entity sidebar slot between the nav rail and the main content.

## Context

@packages/luca-studio/components/layout/layout-shell.tsx
@packages/luca-studio/components/layout/nav-rail.tsx
@packages/luca-studio/app/agents/page.tsx
@packages/luca-studio/app/skills/page.tsx
@packages/luca-studio/app/rules/page.tsx

## Tasks

### 1. Add entity sidebar slot to LayoutShell grid

**Type:** auto
**TDD:** false
**Depends on:** none

Add an optional `entitySidebar` prop to `LayoutShell`. When provided, the grid changes from a 3-column layout (`navRail | content | detail`) to a 4-column layout (`navRail | entitySidebar | content | detail`). The entity sidebar column should be a fixed width (e.g., 260px) that renders between the collapsed nav rail and the main content area.

Implementation notes:

- Add `entitySidebar?: ReactNode` to the component props
- When `entitySidebar` is provided, insert it as a new grid column between NavRail and main
- Adjust `gridTemplateColumns` to include the sidebar column: `${effectiveNavWidth}px 260px 1fr ...` when sidebar is present, unchanged when absent
- The entity sidebar zone should have `overflow-y-auto`, `border-r`, and `bg-muted/30` styling

**Files to edit:**

- `packages/luca-studio/components/layout/layout-shell.tsx`

**Verification:**

- LayoutShell accepts an optional `entitySidebar` prop
- When `entitySidebar` is provided, grid renders 4 columns
- When `entitySidebar` is absent, grid renders 3 columns (backward compatible)
- TypeScript compiles without errors: `bunx --bun tsc --noEmit -p packages/luca-studio/tsconfig.json`

### 2. Extract entity sidebar from build pages into LayoutShell slot

**Type:** auto
**TDD:** false
**Depends on:** 1

Move the entity list panel (currently inside `ResizableSplit` in each build page) out of the page content and into the `entitySidebar` prop of the parent `LayoutShell`. Each build page currently renders `<ResizableSplit>` with the entity tree on the left and the editor on the right. Instead, the entity tree should be passed up to LayoutShell via the `entitySidebar` slot.

Since build pages cannot directly set LayoutShell props (LayoutShell is rendered by the root layout), use a Jotai atom to communicate the entity sidebar content. Create an `entitySidebarAtom` in `stores/layout.ts` that holds `ReactNode | null`. Build pages set it on mount and clear it on unmount. LayoutShell reads it.

Implementation notes:

- Add `entitySidebarAtom` to `stores/layout.ts` as `atom<ReactNode | null>(null)`
- In `layout-shell.tsx`, read `entitySidebarAtom` and pass the value as the entity sidebar column
- In each build page (agents, skills, rules), extract the entity tree JSX and set it into `entitySidebarAtom` via `useEffect`
- Remove `ResizableSplit` from build pages since the entity panel is now in the LayoutShell grid. The editor area becomes the full `children` content.
- Each page's `useEffect` should clear the atom on unmount: `return () => setEntitySidebar(null)`

**Files to create/edit:**

- `packages/luca-studio/stores/layout.ts` (add `entitySidebarAtom`)
- `packages/luca-studio/components/layout/layout-shell.tsx` (read atom, render sidebar column)
- `packages/luca-studio/app/agents/page.tsx` (set entity sidebar atom, remove ResizableSplit)
- `packages/luca-studio/app/skills/page.tsx` (set entity sidebar atom, remove ResizableSplit)
- `packages/luca-studio/app/rules/page.tsx` (set entity sidebar atom, remove ResizableSplit)

**Verification:**

- Entity tree renders in the LayoutShell grid between nav rail and main content
- Entity tree is visible and scrollable on all three build pages
- Selecting an entity in the sidebar loads its detail in the main content area
- Navigating away from build pages clears the entity sidebar
- Dashboard pages (Home, Sessions, Memory) do not show an entity sidebar
- TypeScript compiles without errors

## Verification

1. Run TypeScript compilation: `bunx --bun tsc --noEmit -p packages/luca-studio/tsconfig.json`
2. Verify agents page: entity tree visible adjacent to collapsed nav rail, selecting an agent loads editor
3. Verify skills page: same behavior as agents
4. Verify rules page: same behavior as agents
5. Verify dashboard pages: no entity sidebar renders, layout unchanged
6. Verify nav rail remains collapsed (48px) on build pages -- this is intentional

## Success Criteria

- Entity list panel is accessible on all three build pages (Agents, Skills, Rules)
- Nav rail remains collapsed at 48px in editor context (intentional)
- Entity sidebar renders as a separate grid column between nav rail and main content
- Dashboard and other non-editor pages are unaffected (no entity sidebar)
- Layout is responsive and does not clip content

## Output Specification

- Modified: `packages/luca-studio/stores/layout.ts`
- Modified: `packages/luca-studio/components/layout/layout-shell.tsx`
- Modified: `packages/luca-studio/app/agents/page.tsx`
- Modified: `packages/luca-studio/app/skills/page.tsx`
- Modified: `packages/luca-studio/app/rules/page.tsx`
