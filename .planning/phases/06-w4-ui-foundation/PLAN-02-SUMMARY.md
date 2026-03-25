# PLAN-02 Summary: Navigation Restructure

## Status: COMPLETE

## What Changed

Restructured the flat 11-item navigation into a grouped 9-item structure (OBSERVE / BUILD / CONFIGURE) rendered inside the NavRail. Removed Contradictions and Entities from navigation, renamed Dashboard to Home and Workflow Editor to Pipeline, and set up route redirects for backward compatibility.

## Tasks Completed

### Task 1: Navigation constants and types

- Replaced flat `NAV_ITEMS` array with typed `NAV_GROUPS` structure (3 groups, 9 items)
- Exported `NavItem` and `NavGroup` types for consumers
- Preserved deprecated `NAV_ITEMS` as a derived flat array via `flatMap` for backward compatibility

### Task 2: NavContent component

- Created `nav-content.tsx` rendering grouped items inside NavRail
- Brand header (Hexagon + "Luca Studio") at top, text hidden when collapsed
- Group headers as non-clickable uppercase labels, hidden when collapsed
- Active page indicator with left border accent (2px primary) and subtle background
- Icon + label for each item, labels hidden when collapsed (icon-only mode)
- Wired NavContent into root layout as `navChildren` prop on LayoutShell

### Task 3: Route redirects and page stubs

- `/workflow-editor` now redirects to `/pipeline` using Next.js `redirect()`
- Created `/pipeline` page with workflow editor content (dynamic React Flow import)
- Created stub pages: `/agents`, `/skills`, `/rules`, `/config`, `/settings`
- Renamed Home page title from "Dashboard" to "Home"
- Contradictions and Entities route files kept in place (just removed from navigation)

## Files Changed

| File                                                     | Action                                      |
| -------------------------------------------------------- | ------------------------------------------- |
| `packages/luca-studio/lib/constants.ts`                  | Edited -- NAV_GROUPS + derived NAV_ITEMS    |
| `packages/luca-studio/components/layout/nav-content.tsx` | Created -- NavRail content component        |
| `packages/luca-studio/app/layout.tsx`                    | Edited -- wired NavContent into LayoutShell |
| `packages/luca-studio/app/page.tsx`                      | Edited -- title "Dashboard" to "Home"       |
| `packages/luca-studio/app/workflow-editor/page.tsx`      | Edited -- redirect to /pipeline             |
| `packages/luca-studio/app/pipeline/page.tsx`             | Created -- pipeline page                    |
| `packages/luca-studio/app/agents/page.tsx`               | Created -- stub page                        |
| `packages/luca-studio/app/skills/page.tsx`               | Created -- stub page                        |
| `packages/luca-studio/app/rules/page.tsx`                | Created -- stub page                        |
| `packages/luca-studio/app/config/page.tsx`               | Created -- stub page                        |
| `packages/luca-studio/app/settings/page.tsx`             | Created -- stub page                        |

## Deviations

- **[Rule 1 - Bug]** Changed `NAV_GROUPS` from `as const` to explicit `NavItem`/`NavGroup` types. The `as const` assertion produced complex readonly tuple types that broke `flatMap` inference for the backward-compat `NAV_ITEMS` export. Using explicit types is cleaner and avoids the TypeScript inference issue.

## Verification

- `bunx --bun tsc --noEmit` passes with no new type errors (pre-existing errors in `shared-constant-registry.ts` are unrelated)
- NAV_GROUPS has 3 groups (OBSERVE: 3, BUILD: 4, CONFIGURE: 2) totaling 9 items
- NAV_ITEMS derived export maintained for backward compatibility
- All 9 nav items link to existing pages
- `/workflow-editor` redirects to `/pipeline`
- Active page indicator uses left border accent + background highlight
- NavRail collapsed state shows only icons, expanded state shows group labels and item labels
