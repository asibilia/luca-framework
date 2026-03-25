---
phase: 6
plan: 1
type: feature
autonomous: true
wave: 1
depends_on: []
---

# Phase 6 Plan 1: Layout Components

## Objective

Build the four foundational layout components (LayoutShell, NavRail, DetailPanel, ResizableSplit) that replace the current sidebar/SidebarInset layout. These components establish the three-zone CSS Grid shell that all Studio pages mount into. Navigation restructuring (Plan 2) depends on NavRail from this plan.

## Context

@packages/luca-studio/app/layout.tsx
@packages/luca-studio/components/layout/sidebar.tsx
@packages/luca-studio/components/layout/page-container.tsx
@packages/luca-studio/app/providers.tsx
@packages/luca-studio/stores/theme.ts
@docs/brainstorm/observer-studio-rework/3.ui-architecture.md (Layout Patterns section)

Current state: The app uses shadcn's `SidebarProvider` + `Sidebar` + `SidebarInset` for a conventional sidebar layout. This plan replaces that with a CSS Grid three-zone shell (NavRail | Content | DetailPanel) that adapts per page context.

Dependencies already installed: `react-resizable-panels`, `jotai`, shadcn/ui primitives.

## Tasks

### 1. Create layout Jotai atoms and types

**Type:** auto
**TDD:** false
**Depends on:** none

Create the shared state atoms that drive layout behavior across all four components.

**Files to create/edit:**

- `packages/luca-studio/stores/layout.ts` (new)

Atoms to define:

- `navRailExpandedAtom` (boolean, default false) -- whether rail is pinned expanded
- `navRailHoveredAtom` (boolean, default false) -- transient hover state
- `detailPanelStateAtom` (enum: 'closed' | 'floating' | 'docked', default 'closed')
- `detailPanelWidthAtom` (number, default 480, min 400, max 600)
- `layoutContextAtom` (enum: 'dashboard' | 'editor' | 'browser', default 'dashboard') -- drives adaptation table

Derive a computed `navRailWidthAtom` that returns 240 when expanded or hovered, 48 otherwise.

Persist `navRailExpandedAtom`, `detailPanelStateAtom`, and `detailPanelWidthAtom` to localStorage via `atomWithStorage` so layout preferences survive navigation and reload.

**Verification:**

- Atoms export correctly from the stores barrel
- Types are inferred from Jotai atoms (no manual type duplication)

### 2. Build NavRail component

**Type:** auto
**TDD:** false
**Depends on:** 1

Build the left navigation rail that collapses to 48px (icon-only) and expands to 240px (icon + label). Replaces the current shadcn `Sidebar` component.

**Files to create/edit:**

- `packages/luca-studio/components/layout/nav-rail.tsx` (new)

Implementation:

- Renders as a `<nav>` element with `data-expanded` attribute for CSS targeting
- Width transitions via CSS `transition: width 200ms ease`
- Collapsed state (48px): shows only icons, centered
- Expanded state (240px): shows icons + labels, left-aligned
- Hover to preview expand (sets `navRailHoveredAtom`), pin button to lock expanded (sets `navRailExpandedAtom`)
- Pin button visible only on hover/expanded -- uses a `PinIcon` / `PinOffIcon` toggle
- Auto-collapse: when `layoutContextAtom` is 'editor', force collapsed regardless of pin state
- Keyboard shortcut: `Cmd+\` toggles pin state (register in a `useEffect`)
- Accepts `children` for navigation content (groups and items rendered by parent)

Do NOT render navigation items inside NavRail -- it only provides the collapsible container. Navigation content is passed as children (Plan 2 will populate it).

**Verification:**

- NavRail renders at 48px width when collapsed
- NavRail expands to 240px on hover and on pin toggle
- `data-expanded` attribute toggles correctly
- `Cmd+\` keyboard shortcut toggles pin state

### 3. Build DetailPanel and ResizableSplit components

**Type:** auto
**TDD:** false
**Depends on:** 1

Build the right-side detail panel (three-state: closed/floating/docked) and the ResizableSplit wrapper.

**Files to create/edit:**

- `packages/luca-studio/components/layout/detail-panel.tsx` (new)
- `packages/luca-studio/components/layout/resizable-split.tsx` (new)

DetailPanel implementation:

- Three states driven by `detailPanelStateAtom`:
  - **closed**: not rendered (or `display: none`)
  - **floating**: absolute positioned overlay on right, does NOT push content, has backdrop shadow
  - **docked**: part of grid flow, pushes content left, resizable width
- Animate open/close with `transform: translateX()` and `data-state` attribute
- Width controlled by `detailPanelWidthAtom` (400-600px range)
- Close button in header area
- Keyboard shortcut: `Cmd+.` toggles between closed and last-open state
- Accepts `children` for panel content

ResizableSplit implementation:

- Thin wrapper around `react-resizable-panels` (`PanelGroup`, `Panel`, `PanelResizeHandle`)
- Props: `direction` ('horizontal' | 'vertical'), `minSize`, `maxSize`, `defaultSize`
- Consistent resize handle styling (1px border, 4px hit area, cursor indicator)
- Used internally by LayoutShell for docked DetailPanel resize, and available for page-level splits (e.g., agent editor tree + editor)

**Verification:**

- DetailPanel transitions between closed, floating, and docked states
- Floating panel overlays without pushing content
- Docked panel pushes content and is resizable within 400-600px
- `Cmd+.` toggles detail panel
- ResizableSplit renders panels with drag-to-resize behavior

### 4. Build LayoutShell and wire into root layout

**Type:** auto
**TDD:** false
**Depends on:** 2, 3

Create the LayoutShell component that composes NavRail + content + DetailPanel into a CSS Grid, then replace the current SidebarProvider layout in `app/layout.tsx`.

**Files to create/edit:**

- `packages/luca-studio/components/layout/layout-shell.tsx` (new)
- `packages/luca-studio/app/layout.tsx` (edit -- replace SidebarProvider with LayoutShell)

LayoutShell implementation:

- CSS Grid: `grid-template-columns: auto 1fr auto`
- Three zones: NavRail (left), content slot (center), DetailPanel (right)
- Reads `layoutContextAtom` to apply adaptation:
  - **dashboard**: NavRail expanded (240px), content max-w-7xl centered, DetailPanel closed
  - **editor**: NavRail collapsed (48px), content full bleed, DetailPanel docked
  - **browser**: NavRail expanded (240px), content flexible, DetailPanel floating
- Content slot receives `children`
- Full viewport height (`h-screen`)

Root layout wiring:

- Remove `SidebarProvider`, `Sidebar`, `SidebarInset` imports and usage
- Replace with `LayoutShell` wrapping `Header` + content area
- Keep `Providers` wrapper (Jotai, TooltipProvider, ThemeSync)
- NavRail children left empty for now (Plan 2 populates navigation)

**Verification:**

- LayoutShell renders three-zone CSS Grid with correct column template
- Layout adapts when `layoutContextAtom` changes between dashboard/editor/browser
- Root layout renders without errors after swap
- Existing pages still render inside the content zone (no blank screens)
- Header component still renders correctly above content

## Verification

1. `bunx --bun tsc --noEmit` passes with no new type errors
2. App starts (`bun run dev` in luca-studio) and renders the new three-zone layout
3. NavRail collapses/expands on hover and pin
4. DetailPanel opens/closes with keyboard shortcuts
5. Layout context switching changes zone sizing
6. No regressions on existing page content rendering

## Success Criteria

- Four new layout components exist in `packages/luca-studio/components/layout/`
- Root layout uses LayoutShell instead of SidebarProvider
- Panel state persists across navigation via Jotai + localStorage
- Keyboard shortcuts `Cmd+\` and `Cmd+.` work
- All three layout contexts (dashboard/editor/browser) produce distinct zone configurations

## Output Specification

- `packages/luca-studio/stores/layout.ts` -- Jotai atoms for layout state
- `packages/luca-studio/components/layout/nav-rail.tsx` -- NavRail component
- `packages/luca-studio/components/layout/detail-panel.tsx` -- DetailPanel component
- `packages/luca-studio/components/layout/resizable-split.tsx` -- ResizableSplit wrapper
- `packages/luca-studio/components/layout/layout-shell.tsx` -- LayoutShell grid component
- `packages/luca-studio/app/layout.tsx` -- Updated root layout
