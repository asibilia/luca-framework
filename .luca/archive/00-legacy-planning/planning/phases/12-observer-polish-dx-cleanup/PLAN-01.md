---
phase: 12
plan: 1
type: improvement
autonomous: true
wave: 1
depends_on: []
---

# Phase 12 Plan 1: Observer Polish — ErrorBoundary, CSS Fixes, Accessibility

## Objective

Extend Phase 4's ErrorBoundary and LoadingSkeleton infrastructure to Phase 10's MuninnDB dashboard components, fix 16+ missing CSS classes caused by a stale CSS build and non-statically-analyzable class patterns, and add accessibility attributes (role, aria-label, aria-expanded, keyboard navigation) to memory components. Install clsx and class-variance-authority.

## Context

@packages/luca-observer/app/page.tsx — Dashboard page (needs ErrorBoundary wrapping)
@packages/luca-observer/app/memory/page.tsx — Memory page (already has ErrorBoundary, needs CSS fixes)
@packages/luca-observer/components/dashboard/todo-tracker.tsx — CVA refactor target
@packages/luca-observer/components/memory/brain-panel.tsx — CSS + accessibility fixes
@packages/luca-observer/components/memory/memory-entries.tsx — CSS + accessibility fixes
@packages/luca-observer/components/memory/working-sections.tsx — CSS + accessibility fixes
@packages/luca-observer/components/memory/context-usage-bar.tsx — Accessibility fixes
@packages/luca-observer/components/shared/json-viewer.tsx — CSS fix (border-destructive/50)
@packages/luca-observer/components/shared/error-boundary.tsx — Existing ErrorBoundary component
@packages/luca-observer/components/shared/loading-skeleton.tsx — Existing LoadingSkeleton component
@.planning/phases/12-observer-polish-dx-cleanup/12-RESEARCH.md — Full research with CSS audit

## Tasks

### 1. Install clsx + CVA, refactor todo-tracker with CVA variants

**Type:** auto
**TDD:** false
**Depends on:** none

Install `clsx` and `class-variance-authority` in `packages/luca-observer`. Then refactor `todo-tracker.tsx` to replace template literal class interpolation with CVA variant objects and clsx for conditional class merging (addresses H6, H7, M13 from audit).

**Steps:**

1. Run `cd packages/luca-observer && bun add clsx class-variance-authority`
2. In `todo-tracker.tsx`, define CVA variants for section state (pending/done) covering border, background, and text colors
3. Replace any dynamic `bg-${color}/10` patterns with explicit CVA variant values
4. Use `clsx()` for conditional class composition where needed
5. Fix contrast issues (H7): ensure text on colored backgrounds passes WCAG AA

**Files to create/edit:**

- `packages/luca-observer/package.json` (bun add handles this)
- `packages/luca-observer/components/dashboard/todo-tracker.tsx`

**Verification:**

- `bunx --bun tsc --noEmit` passes with no errors in todo-tracker.tsx
- All class names in todo-tracker.tsx are complete literal strings (no template interpolation for Tailwind classes)
- CVA variants defined for pending/done states

### 2. Fix CSS class fragility across memory components + json-viewer

**Type:** auto
**TDD:** false
**Depends on:** 1

Replace opacity modifier syntax and non-statically-analyzable class patterns across all affected components. Use `clsx` (installed in Task 1) for conditional class merging where appropriate.

**Specific fixes by file:**

**brain-panel.tsx:**

- Replace `text-muted-foreground/60` with `text-muted-foreground opacity-60` (or verify it compiles after rebuild)

**memory-entries.tsx:**

- Replace `text-muted-foreground/60` with statically analyzable alternative
- Replace `border-border/30` with statically analyzable alternative
- Verify `max-h-[36rem]`, `line-clamp-2`, `underline-offset-2` compile (arbitrary values should be fine, may just need rebuild)
- Verify `hover:underline` compiles

**working-sections.tsx:**

- Replace `text-muted-foreground/60` with statically analyzable alternative
- Replace `border-border/30` with statically analyzable alternative

**json-viewer.tsx:**

- Replace `border-destructive/50` with statically analyzable alternative

**memory/page.tsx:**

- Replace `text-muted-foreground/60` with statically analyzable alternative

**Strategy:** First, attempt a CSS rebuild (`cd packages/luca-observer && bun run css:build`) to see which classes get picked up by Tailwind v4's scanner. Then replace only the classes that remain missing. If opacity modifiers on custom theme colors compile correctly after rebuild, keep them as-is. If not, switch to `text-muted-foreground opacity-60` pattern.

**Note:** Dynamic computed colors using `var(--color-${variable})` where the variable name comes from data MUST remain as inline styles. This is the accepted exception from CONTEXT.md.

**Files to edit:**

- `packages/luca-observer/components/memory/brain-panel.tsx`
- `packages/luca-observer/components/memory/memory-entries.tsx`
- `packages/luca-observer/components/memory/working-sections.tsx`
- `packages/luca-observer/components/shared/json-viewer.tsx`
- `packages/luca-observer/app/memory/page.tsx`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- No opacity modifier syntax remains on custom theme colors (unless verified to compile)
- All Tailwind class names are complete literal strings

### 3. Add ErrorBoundary wrapping to dashboard page + accessibility pass

**Type:** auto
**TDD:** false
**Depends on:** 1, 2

Wrap dashboard page components with `<ErrorBoundary>` (matching the pattern already used on the memory page). Add accessibility attributes to Phase 10 memory components.

**Dashboard ErrorBoundary (M19-M20):**

- Import `ErrorBoundary` and `LoadingSkeleton` in `app/page.tsx`
- Wrap `<OverviewCards>`, `<TodoTracker>`, `<RecentEvents>`, `<RecentTransitions>` each with `<ErrorBoundary name="ComponentName">`
- No loading state changes needed (dashboard uses streaming events, not async data fetch)

**Accessibility attributes (M21-M22, M24-M25):**

brain-panel.tsx:

- Add `role="region"` and `aria-label="Brain tree engrams"` to container
- Add `tabIndex={0}` to expandable items for keyboard navigation

context-usage-bar.tsx:

- Add `role="status"` and `aria-label="MuninnDB statistics"` to container
- Add text labels alongside color-only indicators

memory-entries.tsx:

- Add `role="region"` and `aria-label="Memory engrams"` to container
- Add `aria-expanded={expanded}` to EngramCard toggle button

working-sections.tsx:

- Add `role="region"` and `aria-label="Session activity"` to container
- Add `aria-expanded={expanded}` to SessionEntryRow toggle button

**Files to edit:**

- `packages/luca-observer/app/page.tsx`
- `packages/luca-observer/components/memory/brain-panel.tsx`
- `packages/luca-observer/components/memory/context-usage-bar.tsx`
- `packages/luca-observer/components/memory/memory-entries.tsx`
- `packages/luca-observer/components/memory/working-sections.tsx`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Dashboard page imports ErrorBoundary and wraps all 4 child components
- All 4 memory components have `role` and `aria-label` attributes
- Expandable items have `aria-expanded` state
- brain-panel expandable items have `tabIndex={0}`
- context-usage-bar has text labels for color indicators

### 4. Rebuild CSS and verify all classes compile

**Type:** auto
**TDD:** false
**Depends on:** 2, 3

Run the CSS rebuild to pick up all class changes. Verify the compiled output contains all previously-missing classes.

**Steps:**

1. Run `cd packages/luca-observer && bun run css:build`
2. Verify the compiled `app/globals.css` output is updated (newer timestamp, larger file size)
3. If any critical classes are still missing, add them to a safelist in `tailwind/base.css` or adjust the source patterns

**Files to verify:**

- `packages/luca-observer/app/globals.css` (rebuilt output)

**Verification:**

- `bun run css:build` completes without errors
- `bunx --bun tsc --noEmit` passes (full project typecheck)
- All 16+ previously-missing classes are now present in compiled CSS, OR their source patterns have been replaced with alternatives that compile

## Verification

1. `bunx --bun tsc --noEmit` passes with no errors
2. CSS rebuild completes successfully
3. No template literal class interpolation for Tailwind classes in any modified file
4. All 4 dashboard components wrapped with ErrorBoundary
5. All Phase 10 memory components have accessibility attributes (role, aria-label, aria-expanded, tabIndex)
6. Dynamic computed color inline styles preserved (accepted exception)

## Success Criteria

- Zero missing CSS classes in compiled globals.css for all Phase 10 components
- Dashboard page has error isolation matching memory page's pattern
- Memory components pass a manual accessibility check (screen reader landmarks, keyboard navigation)
- `bunx --bun tsc --noEmit` clean

## Output Specification

- Modified: ~10 component/page files in packages/luca-observer
- Updated: packages/luca-observer/package.json (new deps: clsx, class-variance-authority)
- Rebuilt: packages/luca-observer/app/globals.css
