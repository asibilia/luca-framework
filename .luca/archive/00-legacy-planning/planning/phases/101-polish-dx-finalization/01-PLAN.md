---
id: "101-01"
title: "Observer UI polish: loading states, error boundaries, responsive layout, dark mode"
phase: 101
wave: 1
complexity: COMPLEX
depends_on: []
tasks:
  - id: "101-01-1"
    title: "Create reusable loading skeleton component"
    goal: "Build a shared LoadingSkeleton component with variants (card, table, chart, text) that replaces ad-hoc animate-pulse loading patterns across all pages"
    verify: "LoadingSkeleton component exported from ~/components/shared/; supports card, table, chart, and text variants; uses Tailwind animate-pulse with consistent sizing"
  - id: "101-01-2"
    title: "Create global error boundary component"
    goal: "Build a React error boundary using Next.js error.tsx convention at the app root and per-page level to catch rendering errors gracefully"
    verify: "error.tsx exists at packages/luca-observer/src/app/error.tsx; renders user-friendly error state with reset button; catches rendering errors without crashing the whole app"
  - id: "101-01-3"
    title: "Add per-page error boundaries for each route"
    goal: "Create error.tsx files for each route segment (workflow, iterations, harness, planning, memory, tribunal, agents, notes) to isolate page-level errors"
    verify: "error.tsx exists in each route directory under src/app/; each renders a contextual error message; one page crashing does not affect others"
  - id: "101-01-4"
    title: "Add per-page loading.tsx files for route-level Suspense"
    goal: "Create loading.tsx files for each route segment using the LoadingSkeleton component for instant visual feedback during navigation"
    verify: "loading.tsx exists in each route directory under src/app/; each renders appropriate skeleton variant for its page type"
  - id: "101-01-5"
    title: "Audit and fix responsive layout across all pages"
    goal: "Ensure all observer pages render correctly at mobile (375px), tablet (768px), and desktop (1280px+) widths — fix grid breakpoints, table overflow, and sidebar collapse"
    verify: "All pages render without horizontal scroll at 375px; grid layouts stack on mobile; tables use horizontal scroll wrapper; sidebar auto-collapses below 768px"
  - id: "101-01-6"
    title: "Add light/dark mode toggle with CSS custom property switching"
    goal: "Add a theme toggle to the header that switches between dark mode (current default) and light mode by toggling CSS custom properties in globals.css"
    verify: "Theme toggle button visible in header; clicking it switches all color variables; preference persisted in localStorage; defaults to dark mode"
  - id: "101-01-7"
    title: "Define light mode color palette in globals.css"
    goal: "Add a light mode @theme block in globals.css with appropriate colors for background, foreground, card, border, muted, accent, and all event colors"
    verify: "Light mode colors defined; all text readable on light background; event colors still distinguishable; no hardcoded dark-only colors in components"
---

# 101-01: Observer UI Polish — Loading States, Error Boundaries, Responsive Layout, Dark Mode

## Goal

Polish the luca-observer dashboard for production readiness. Currently, loading states are ad-hoc inline patterns, there are no error boundaries, responsiveness is untested at small viewports, and the app is dark-mode-only with no toggle. This plan standardizes loading UX, adds resilient error handling, ensures mobile/tablet usability, and introduces a light/dark mode toggle.

## Context

@packages/luca-observer/src/app/layout.tsx -- Root layout with hardcoded `className="dark"`
@packages/luca-observer/src/app/globals.css -- CSS custom properties (dark-only currently)
@packages/luca-observer/src/app/page.tsx -- Dashboard page with inline loading pattern
@packages/luca-observer/src/app/iterations/page.tsx -- Example inline loading state
@packages/luca-observer/src/components/layout/page-container.tsx -- Shared page wrapper
@packages/luca-observer/src/components/layout/header.tsx -- Header with sidebar toggle
@packages/luca-observer/src/components/layout/sidebar.tsx -- Sidebar navigation with Jotai atom
@packages/luca-observer/src/stores/sidebar.ts -- Sidebar open/closed atom
@packages/luca-observer/src/app/providers.tsx -- Jotai provider wrapper

**Current state:**

- Loading states: Each page has inline `animate-pulse` divs with inconsistent sizing and messaging
- Error boundaries: None exist. A rendering crash takes down the entire app
- Responsive: Layout uses `flex h-screen` but grids are not tested at mobile widths. Tables may overflow
- Dark mode: Hardcoded dark color palette in globals.css. No toggle, no light mode alternative

**Architecture constraints:**

- Next.js App Router conventions for error.tsx and loading.tsx
- CSS custom properties for theming (not Tailwind dark: prefix, since we use @theme)
- Jotai for state management (theme atom alongside sidebar atom)
- Functional components only (no class-based error boundaries -- use Next.js error.tsx convention)
- Font-mono design language preserved across themes

## Tasks

### Task 101-01-1: Create reusable loading skeleton component

Create `packages/luca-observer/src/components/shared/loading-skeleton.tsx`.

A reusable skeleton component that replaces the ad-hoc `animate-pulse` loading patterns used across every page. Supports multiple variants to match the content layout being loaded.

**Variants:**

- `card` -- Rectangular card placeholder (for overview cards, summary banners)
- `table` -- Row-based skeleton (for WSJF tables, scorecard tables, findings tables)
- `chart` -- Bar chart placeholder (for convergence chart, budget gauge)
- `text` -- Multi-line text skeleton (for markdown content in memory/notes pages)

**Props:**

```typescript
interface LoadingSkeletonProps {
  variant: "card" | "table" | "chart" | "text";
  rows?: number;
  columns?: number;
}
```

**Key features:**

- Uses consistent `animate-pulse` with `bg-muted` coloring
- Respects current theme (light/dark)
- Sizing matches the actual content it replaces (not too small, not too large)
- Accessible: includes `aria-label="Loading"` and `role="status"`

**Verify:**

- [ ] File exists at `packages/luca-observer/src/components/shared/loading-skeleton.tsx`
- [ ] Supports all 4 variants
- [ ] Uses consistent styling with existing design system
- [ ] Accessible with aria attributes
- [ ] `bunx --bun tsc --noEmit` passes

### Task 101-01-2: Create global error boundary component

Create `packages/luca-observer/src/app/error.tsx`.

Next.js App Router `error.tsx` convention provides automatic error boundaries. This file catches any unhandled rendering error in child routes and displays a recovery UI.

**Key features:**

- "use client" directive (required by Next.js error.tsx)
- Displays error message in a styled card
- "Try Again" button that calls `reset()` to retry rendering
- "Go Home" link to navigate back to dashboard
- Styled consistently with observer design system (font-mono, border, card background)
- Logs error to console for debugging

**Steps:**

1. Create `packages/luca-observer/src/app/error.tsx`
2. Export default component receiving `{ error, reset }` props
3. Call `useEffect` to log error on mount

**Verify:**

- [ ] File exists at `packages/luca-observer/src/app/error.tsx`
- [ ] Exports default "use client" component
- [ ] Shows error message and reset button
- [ ] Styled consistently with observer design system
- [ ] `bunx --bun tsc --noEmit` passes

### Task 101-01-3: Add per-page error boundaries for each route

Create `error.tsx` files for each route segment to isolate page-level failures.

**Routes needing error.tsx:**

- `packages/luca-observer/src/app/workflow/error.tsx`
- `packages/luca-observer/src/app/iterations/error.tsx`
- `packages/luca-observer/src/app/harness/error.tsx`
- `packages/luca-observer/src/app/planning/error.tsx`
- `packages/luca-observer/src/app/memory/error.tsx`
- `packages/luca-observer/src/app/tribunal/error.tsx`
- `packages/luca-observer/src/app/agents/error.tsx`
- `packages/luca-observer/src/app/notes/error.tsx`

Each error.tsx should:

- Use the same error component pattern as the root error.tsx
- Include the page name in the error message for context (e.g., "Error loading Iterations page")
- Provide reset button and link back to dashboard

**Verify:**

- [ ] error.tsx exists in all 8 route directories
- [ ] Each includes contextual page name in error message
- [ ] Each provides reset and navigation options
- [ ] `bunx --bun tsc --noEmit` passes

### Task 101-01-4: Add per-page loading.tsx files for route-level Suspense

Create `loading.tsx` files for each route segment using the LoadingSkeleton component.

**Routes needing loading.tsx:**

- `packages/luca-observer/src/app/workflow/loading.tsx` -- chart variant
- `packages/luca-observer/src/app/iterations/loading.tsx` -- chart + table variant
- `packages/luca-observer/src/app/harness/loading.tsx` -- card + table variant
- `packages/luca-observer/src/app/planning/loading.tsx` -- card + table variant
- `packages/luca-observer/src/app/memory/loading.tsx` -- text variant
- `packages/luca-observer/src/app/tribunal/loading.tsx` -- card + table variant
- `packages/luca-observer/src/app/agents/loading.tsx` -- table variant
- `packages/luca-observer/src/app/notes/loading.tsx` -- text variant

Each loading.tsx should:

- Import PageContainer and LoadingSkeleton
- Render the appropriate skeleton variant(s) matching the page layout
- Wrap in PageContainer with correct title

**Verify:**

- [ ] loading.tsx exists in all 8 route directories
- [ ] Each uses LoadingSkeleton with appropriate variant
- [ ] Each wraps content in PageContainer
- [ ] `bunx --bun tsc --noEmit` passes

### Task 101-01-5: Audit and fix responsive layout across all pages

Audit all observer pages and fix responsive issues.

**Key areas to fix:**

1. **Sidebar**: Auto-collapse below 768px. Currently controlled by Jotai atom but does not respond to viewport width. Add a `useMediaQuery` effect or CSS-based responsive hiding.

2. **Grid layouts**: Ensure all `grid-cols-*` layouts use responsive breakpoints. Many pages use `lg:grid-cols-2` which is correct, but some may need `md:` intermediate breakpoints.

3. **Tables**: All table components (WSJF score table, findings table, agent scorecard table) need a horizontal scroll wrapper (`overflow-x-auto`) for narrow viewports.

4. **Header**: Ensure header content does not overflow on mobile. The SSE status indicator may need to hide on small screens.

5. **Page containers**: The `p-6` padding may be too large on mobile. Consider `p-3 md:p-6`.

**Steps:**

1. Audit each component for hardcoded widths or missing responsive classes
2. Add `overflow-x-auto` wrapper to all table components
3. Update PageContainer padding for mobile
4. Add responsive sidebar behavior
5. Test at 375px, 768px, and 1280px conceptually

**Verify:**

- [ ] No horizontal scroll on any page at 375px width (except tables which scroll in their container)
- [ ] Grid layouts stack to single column on mobile
- [ ] Tables scroll horizontally in their own container
- [ ] Sidebar auto-collapses on mobile
- [ ] PageContainer uses responsive padding
- [ ] `bunx --bun tsc --noEmit` passes

### Task 101-01-6: Add light/dark mode toggle with CSS custom property switching

Add a theme toggle to the header and a Jotai atom for theme state.

**Steps:**

1. Create `packages/luca-observer/src/stores/theme.ts` with a Jotai atom:

```typescript
import { atomWithStorage } from "jotai/utils";

export const themeAtom = atomWithStorage<"dark" | "light">(
  "luca-observer-theme",
  "dark",
);
```

2. Update `packages/luca-observer/src/app/providers.tsx` to read the theme atom and apply class to `<html>`:

```typescript
// Read themeAtom and set document.documentElement class
```

3. Add toggle button to `packages/luca-observer/src/components/layout/header.tsx`:

```typescript
// Button that toggles themeAtom between "dark" and "light"
// Display: sun icon for dark mode (click to switch to light), moon icon for light mode
```

4. Update `packages/luca-observer/src/app/layout.tsx` to remove hardcoded `className="dark"` from `<html>` tag (let the provider manage it).

**Verify:**

- [ ] Theme toggle button visible in header
- [ ] Clicking toggles between dark and light mode
- [ ] Theme persisted in localStorage
- [ ] Defaults to dark mode on first visit
- [ ] `bunx --bun tsc --noEmit` passes

### Task 101-01-7: Define light mode color palette in globals.css

Update `packages/luca-observer/src/app/globals.css` to support both dark and light themes.

**Approach:** Use CSS class selectors on `<html>` to switch between color palettes. The current @theme block becomes the dark palette. Add a `.light` override.

**Light mode colors (approximate):**

```css
html.light {
  --color-background: #fafafa;
  --color-foreground: #0a0a0a;
  --color-muted: #f4f4f5;
  --color-muted-foreground: #71717a;
  --color-border: #e4e4e7;
  --color-card: #ffffff;
  --color-card-foreground: #0a0a0a;
  --color-accent: #2563eb;
  --color-accent-foreground: #ffffff;
  --color-destructive: #dc2626;
  --color-warning: #d97706;
  --color-success: #16a34a;
  --color-info: #0891b2;
  /* Event colors adjusted for light backgrounds */
}
```

**Key requirements:**

- All text must be readable on light backgrounds
- Event type colors must remain distinguishable
- Card borders visible but subtle
- Success/warning/destructive colors darker for contrast on white
- No hardcoded `bg-[#...]` or `text-[#...]` in any component -- all must use CSS custom properties

**Steps:**

1. Audit globals.css for current @theme color definitions
2. Add light mode overrides using `html.light { ... }`
3. Adjust event colors for light mode readability
4. Audit components for any hardcoded dark-only colors

**Verify:**

- [ ] Light mode colors defined in globals.css
- [ ] All text readable on light backgrounds
- [ ] Event colors distinguishable in both modes
- [ ] No hardcoded dark-only colors in components
- [ ] Body background switches correctly
- [ ] `bunx --bun tsc --noEmit` passes

## Success Criteria

- [ ] Reusable LoadingSkeleton component with 4 variants
- [ ] Global error boundary at app root (error.tsx)
- [ ] Per-page error boundaries for all 8 routes
- [ ] Per-page loading.tsx files for all 8 routes with appropriate skeletons
- [ ] Responsive layout: mobile, tablet, and desktop tested
- [ ] Light/dark mode toggle in header with localStorage persistence
- [ ] Light mode color palette with full readability
- [ ] All components use CSS custom properties -- no hardcoded colors
- [ ] `bunx --bun tsc --noEmit` passes
