# SUMMARY: Phase 6 Plan 1 — Layout Components

## Status: COMPLETE

## What Was Done

### Task 1: Layout Jotai atoms and types

Created `packages/luca-studio/stores/layout.ts` with:

- `navRailExpandedAtom` (boolean, persisted via atomWithStorage)
- `navRailHoveredAtom` (boolean, transient)
- `detailPanelStateAtom` ('closed' | 'floating' | 'docked', persisted)
- `detailPanelWidthAtom` (number, default 480, persisted)
- `layoutContextAtom` ('dashboard' | 'editor' | 'browser', transient)
- `navRailWidthAtom` (derived: 240 when expanded/hovered, 48 otherwise)
- Exported `LayoutContext` and `DetailPanelState` types

### Task 2: NavRail component

Created `packages/luca-studio/components/layout/nav-rail.tsx`:

- `<nav>` element with `data-expanded` attribute
- Width transitions: 48px collapsed, 240px expanded
- Hover-to-preview via `navRailHoveredAtom`
- Pin/unpin toggle button (Pin/PinOff icons, visible on hover)
- Auto-collapse when `layoutContextAtom === 'editor'`
- Keyboard shortcut: Cmd+\ toggles pin state
- Children slot for navigation content (Plan 2 populates this)

### Task 3: DetailPanel and ResizableSplit

Created `packages/luca-studio/components/layout/detail-panel.tsx`:

- Three states: closed (returns null), floating (absolute overlay), docked (grid flow)
- Width clamped to 400-600px from `detailPanelWidthAtom`
- Close button in header, Cmd+. keyboard toggle
- Remembers last-open state for toggle behavior

Created `packages/luca-studio/components/layout/resizable-split.tsx`:

- Wrapper around react-resizable-panels v4 (Group/Panel/Separator API)
- Props: orientation, defaultFirstSize, minFirstSize, maxFirstSize
- Consistent resize handle styling (1px border, cursor indicator)

### Task 4: LayoutShell and root layout swap

Created `packages/luca-studio/components/layout/layout-shell.tsx`:

- CSS Grid with `grid-template-columns: {navWidth}px 1fr {panelWidth|0}px`
- Three zones: NavRail (left), main content (center), DetailPanel (right)
- Dashboard context applies max-w-7xl centering to content zone
- Docked panel occupies grid column; floating panel overlays

Updated `packages/luca-studio/app/layout.tsx`:

- Removed SidebarProvider, Sidebar, SidebarInset imports and usage
- Replaced with LayoutShell wrapping Header + content area
- Kept Providers wrapper (Jotai, TooltipProvider, ThemeSync)

Updated `packages/luca-studio/components/layout/header.tsx`:

- Removed SidebarTrigger dependency (no longer has SidebarProvider context)
- Added Luca Studio logo/title (Hexagon icon + text) in header left area

## Deviations

- [Rule 3 — Blocking] Header component used `SidebarTrigger` which depends on `SidebarProvider` context. Since we removed SidebarProvider, the SidebarTrigger import was removed and replaced with a Hexagon logo + "Luca Studio" text. This was required to avoid a runtime crash.
- [Rule 3 — Blocking] `react-resizable-panels` v4 uses different API names (`Group`/`Panel`/`Separator`) vs the v2-v3 API (`PanelGroup`/`Panel`/`PanelResizeHandle`). Updated ResizableSplit to use v4 API. Also uses `orientation` instead of `direction`.

## Verification

1. `bunx --bun tsc --noEmit` passes with zero new type errors (only pre-existing errors in `shared-constant-registry.ts`)
2. Four new layout components created in `packages/luca-studio/components/layout/`
3. Root layout uses LayoutShell instead of SidebarProvider
4. Panel state persists across navigation via Jotai + localStorage
5. Keyboard shortcuts Cmd+\ and Cmd+. registered
6. All three layout contexts (dashboard/editor/browser) produce distinct zone configurations

## Files Changed

| File                                                         | Action                                  |
| ------------------------------------------------------------ | --------------------------------------- |
| `packages/luca-studio/stores/layout.ts`                      | Created                                 |
| `packages/luca-studio/components/layout/nav-rail.tsx`        | Created                                 |
| `packages/luca-studio/components/layout/detail-panel.tsx`    | Created                                 |
| `packages/luca-studio/components/layout/resizable-split.tsx` | Created                                 |
| `packages/luca-studio/components/layout/layout-shell.tsx`    | Created                                 |
| `packages/luca-studio/app/layout.tsx`                        | Edited (SidebarProvider -> LayoutShell) |
| `packages/luca-studio/components/layout/header.tsx`          | Edited (removed SidebarTrigger)         |
