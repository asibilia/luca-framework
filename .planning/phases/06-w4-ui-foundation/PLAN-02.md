---
phase: 6
plan: 2
type: feature
autonomous: true
wave: 2
depends_on: [1]
---

# Phase 6 Plan 2: Navigation Restructure

## Objective

Restructure the flat 11-item navigation into a grouped 9-item structure (OBSERVE / BUILD / CONFIGURE) rendered inside the NavRail from Plan 1. Remove Contradictions and Entities pages, rename Dashboard to Home and Workflow Editor to Pipeline, and set up route redirects for backward compatibility.

## Context

@packages/luca-studio/lib/constants.ts (current NAV_ITEMS -- 11 flat items)
@packages/luca-studio/components/layout/sidebar.tsx (current sidebar consuming NAV_ITEMS)
@packages/luca-studio/components/layout/nav-rail.tsx (new NavRail from Plan 1)
@packages/luca-studio/app/layout.tsx (root layout, now using LayoutShell)
@docs/brainstorm/observer-studio-rework/1.product-vision.md (Navigation Structure section)

Target navigation structure:

```
OBSERVE: Home (/), Sessions (/sessions), Memory (/memory)
BUILD: Pipeline (/pipeline), Agents (/agents), Skills (/skills), Rules (/rules)
CONFIGURE: Config (/config), Settings (/settings)
```

Removals: Contradictions, Entities
Renames: Dashboard -> Home (same / route), Workflow Editor -> Pipeline (/workflow-editor -> /pipeline)
Merges deferred: Memory page tab consolidation (Learning, Vault, Knowledge Graph, Semantic Search) is Phase 7 scope. For now Memory remains a single page and the other pages still exist as routes but are removed from navigation.

## Tasks

### 1. Update navigation constants and types

**Type:** auto
**TDD:** false
**Depends on:** none

Replace the flat `NAV_ITEMS` array with a grouped structure that the NavRail can render as sections with group headers.

**Files to create/edit:**

- `packages/luca-studio/lib/constants.ts` (edit NAV_ITEMS)

New structure:

```typescript
export const NAV_GROUPS = [
  {
    label: "OBSERVE",
    items: [
      { href: "/", label: "Home", icon: "LayoutDashboard" },
      { href: "/sessions", label: "Sessions", icon: "Activity" },
      { href: "/memory", label: "Memory", icon: "Brain" },
    ],
  },
  {
    label: "BUILD",
    items: [
      { href: "/pipeline", label: "Pipeline", icon: "Workflow" },
      { href: "/agents", label: "Agents", icon: "Bot" },
      { href: "/skills", label: "Skills", icon: "Hexagon" },
      { href: "/rules", label: "Rules", icon: "Shield" },
    ],
  },
  {
    label: "CONFIGURE",
    items: [
      { href: "/config", label: "Config", icon: "SlidersHorizontal" },
      { href: "/settings", label: "Settings", icon: "Settings" },
    ],
  },
] as const;
```

Keep the old `NAV_ITEMS` export temporarily (deprecated) for any other consumers, but derive it from `NAV_GROUPS` via flatMap so it stays in sync.

**Verification:**

- `NAV_GROUPS` exports with 3 groups totaling 9 items
- `NAV_ITEMS` still exports (derived from groups) for backward compatibility
- TypeScript types infer correctly

### 2. Build NavRail navigation content

**Type:** auto
**TDD:** false
**Depends on:** 1

Create the navigation content component that renders grouped items inside the NavRail, and wire it into the root layout.

**Files to create/edit:**

- `packages/luca-studio/components/layout/nav-content.tsx` (new)
- `packages/luca-studio/app/layout.tsx` (edit -- pass NavContent as NavRail children)

NavContent implementation:

- Imports `NAV_GROUPS` from constants
- Renders each group with:
  - Non-clickable uppercase label (group header) -- hidden when NavRail is collapsed, visible when expanded
  - Items as `<Link>` elements with icon + label
  - Label hidden when NavRail collapsed (icon only)
- Active page detection via `usePathname()`:
  - Exact match for `/` (Home)
  - `startsWith` match for all others
  - Active indicator: left border accent (2px primary) + subtle background highlight
- Icon rendering via a Lucide icon map (similar to current sidebar.tsx pattern)
- Brand header at top: Hexagon icon + "Luca Studio" text (text hidden when collapsed)

Root layout wiring:

- Import NavContent
- Render `<NavRail><NavContent /></NavRail>` inside LayoutShell
- Remove old `Sidebar` component import (it is now fully replaced)

**Verification:**

- Navigation renders 3 groups (OBSERVE, BUILD, CONFIGURE) with correct items
- Group labels visible when expanded, hidden when collapsed
- Active page has left border accent
- Icons render for all 9 items
- Brand header shows at top of rail

### 3. Set up route redirects and page stubs

**Type:** auto
**TDD:** false
**Depends on:** 1

Create redirects for renamed routes, stub pages for new routes that do not exist yet, and remove deleted pages from navigation (keep route files for now to avoid 404s during transition).

**Files to create/edit:**

- `packages/luca-studio/app/workflow-editor/page.tsx` (edit -- add redirect to /pipeline)
- `packages/luca-studio/app/pipeline/page.tsx` (new -- stub or move from workflow-editor)
- `packages/luca-studio/app/agents/page.tsx` (new -- stub)
- `packages/luca-studio/app/skills/page.tsx` (new -- stub)
- `packages/luca-studio/app/rules/page.tsx` (new -- stub)
- `packages/luca-studio/app/config/page.tsx` (new -- stub)
- `packages/luca-studio/app/settings/page.tsx` (new -- stub)

Redirects:

- `/workflow-editor` -> redirect to `/pipeline` (use Next.js `redirect()` from `next/navigation`)
- `/` stays as Home (just the page title changes from "Dashboard" to "Home" in the page component)

Stub pages use `PageContainer` with title and a "Coming soon" or "Under construction" message so the app does not 404 on new routes. Pipeline page can initially copy the workflow-editor content.

Home page rename: Edit the existing `app/page.tsx` to change its title from "Dashboard" to "Home" if it uses PageContainer.

Contradictions and Entities: Leave their route files in place (they just become unreachable from navigation). They will be deleted in a future cleanup.

**Verification:**

- Navigating to `/workflow-editor` redirects to `/pipeline`
- All 9 navigation items link to pages that render without errors
- `/pipeline` shows workflow editor content (moved or copied)
- New stub pages render with PageContainer and placeholder content
- Home page title reads "Home" instead of "Dashboard"
- No 404 errors when clicking any navigation item

## Verification

1. `bunx --bun tsc --noEmit` passes with no new type errors
2. App starts and renders the grouped navigation inside the NavRail
3. All 9 nav items are clickable and render pages
4. `/workflow-editor` redirects to `/pipeline`
5. Active page indicator highlights correctly for each page
6. Contradictions and Entities are not visible in navigation
7. NavRail collapsed state shows only icons, expanded state shows group labels and item labels

## Success Criteria

- Navigation shows 3 groups (OBSERVE, BUILD, CONFIGURE) with 9 total items
- Contradictions and Entities removed from navigation
- Dashboard renamed to Home, Workflow Editor renamed to Pipeline
- Route redirects work for backward compatibility
- All BUILD group pages (/pipeline, /agents, /skills, /rules) render without MuninnDB dependency
- Active page indicator works on all routes

## Output Specification

- `packages/luca-studio/lib/constants.ts` -- Updated with NAV_GROUPS
- `packages/luca-studio/components/layout/nav-content.tsx` -- Navigation content for NavRail
- `packages/luca-studio/app/layout.tsx` -- Wired NavContent into NavRail
- `packages/luca-studio/app/pipeline/page.tsx` -- Pipeline page (replaces workflow-editor)
- `packages/luca-studio/app/agents/page.tsx` -- Agents stub page
- `packages/luca-studio/app/skills/page.tsx` -- Skills stub page
- `packages/luca-studio/app/rules/page.tsx` -- Rules stub page
- `packages/luca-studio/app/config/page.tsx` -- Config stub page
- `packages/luca-studio/app/settings/page.tsx` -- Settings stub page
- `packages/luca-studio/app/workflow-editor/page.tsx` -- Redirect to /pipeline
- `packages/luca-studio/app/page.tsx` -- Renamed title to Home
