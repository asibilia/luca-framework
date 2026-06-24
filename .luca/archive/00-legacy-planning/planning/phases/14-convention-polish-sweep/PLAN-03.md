---
phase: 14
plan: 3
type: improvement
autonomous: true
wave: 1
depends_on: []
gap_closure: true
findings: [M13, M14]
---

# Phase 14 Plan 3: Observer UI Fixes -- Focus Rings + Retry Button Contrast

## Objective

Add missing `focus-visible` ring styles to interactive elements across observer components (M13) and fix the retry button contrast issue in `todo-tracker.tsx` where `text-foreground` on `bg-destructive` creates poor contrast in both light and dark themes (M14).

## Context

@packages/luca-observer/components/dashboard/todo-tracker.tsx
@packages/luca-observer/components/dashboard/recent-events.tsx
@packages/luca-observer/components/iteration/iteration-timeline.tsx
@packages/luca-observer/components/harness/check-result-card.tsx
@packages/luca-observer/components/memory/working-sections.tsx
@packages/luca-observer/components/memory/memory-entries.tsx

## Tasks

### 1. Add focus-visible ring to buttons missing focus styles

**Type:** auto
**TDD:** false
**Depends on:** none

Add `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2` to all interactive buttons that currently lack focus styles. Using `focus-visible` (not `focus`) so focus rings only appear during keyboard navigation, not mouse clicks.

**Buttons to fix (verified via code inspection):**

1. **`iteration-timeline.tsx` line 68** -- expand/collapse button
   - Current: `"flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-left md:gap-3 md:px-4 md:py-3"`
   - Add: `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2`

2. **`check-result-card.tsx` line 87** -- show/hide raw output button
   - Current: `"font-mono text-xs text-muted-foreground hover:text-foreground"`
   - Add: `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 rounded`

3. **`recent-events.tsx` line 27** -- clear button
   - Current: `"rounded border border-border px-2 py-1 font-mono text-xs text-muted-foreground hover:bg-muted hover:text-foreground"`
   - Add: `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2`

4. **`todo-tracker.tsx` line 60** -- retry button (focus ring part; contrast fix in task 2)
   - Current: `"mt-2 rounded bg-destructive px-3 py-1 font-mono text-xs text-foreground hover:bg-destructive/80"`
   - Add: `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2`

5. **`working-sections.tsx` line 190** -- nested expand/collapse button (EntryRow)
   - Current: `"flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-muted/20"`
   - Add: `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2`

6. **`memory-entries.tsx` line 192** -- show uncategorized toggle button
   - Current: `"font-mono text-xs text-muted-foreground underline-offset-2 hover:underline"`
   - Add: `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 rounded`

7. **`memory-entries.tsx` line 285** -- nested engram expand/collapse button (EngramItem)
   - Current: `"w-full px-4 py-2.5 text-left hover:bg-muted/20"`
   - Add: `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2`

**Files to edit:**

- `packages/luca-observer/components/iteration/iteration-timeline.tsx`
- `packages/luca-observer/components/harness/check-result-card.tsx`
- `packages/luca-observer/components/dashboard/recent-events.tsx`
- `packages/luca-observer/components/dashboard/todo-tracker.tsx`
- `packages/luca-observer/components/memory/working-sections.tsx`
- `packages/luca-observer/components/memory/memory-entries.tsx`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- All 7 buttons have `focus-visible:ring-2` in their className
- Focus ring style is consistent with existing components that already have it (e.g., `brain-panel.tsx`, `decision-timeline.tsx`, `error-boundary.tsx`)
- Note: existing components use `focus:ring-2` while we add `focus-visible:ring-2` -- the `focus-visible` variant is preferred for keyboard-only focus indication, but consistency with existing patterns is also acceptable. Use `focus-visible` for new additions.

### 2. Fix retry button contrast in todo-tracker.tsx

**Type:** auto
**TDD:** false
**Depends on:** none

Fix M14: the retry button in `todo-tracker.tsx` (line 60-66) uses `text-foreground` on `bg-destructive`, which creates poor contrast. The `destructive` background is typically red, and `text-foreground` varies by theme (dark in light mode, light in dark mode). Neither combination guarantees sufficient contrast.

**Current (line 63):**

```typescript
className =
  "mt-2 rounded bg-destructive px-3 py-1 font-mono text-xs text-foreground hover:bg-destructive/80";
```

**Fix:** Change `text-foreground` to `text-destructive-foreground`. The `destructive-foreground` color is specifically designed for text on `destructive` backgrounds (typically white or very light).

**Target:**

```typescript
className =
  "mt-2 rounded bg-destructive px-3 py-1 font-mono text-xs text-destructive-foreground hover:bg-destructive/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2";
```

Note: The focus-visible ring from Task 1 is also included here since we are editing this button anyway.

**Files to edit:**

- `packages/luca-observer/components/dashboard/todo-tracker.tsx`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Button uses `text-destructive-foreground` (not `text-foreground`)
- Visual contrast is correct: white/light text on red background

## Verification

1. `bunx --bun tsc --noEmit` exits 0
2. All interactive buttons in the 6 modified files have focus-visible ring styles
3. `grep -r "focus-visible:ring-2" packages/luca-observer/components/` shows the 7 newly added instances
4. `todo-tracker.tsx` retry button uses `text-destructive-foreground` (not `text-foreground`)
5. No behavioral changes -- only CSS class additions/modifications

## Success Criteria

- All interactive buttons across observer components have keyboard-accessible focus indicators
- Retry button in todo-tracker has proper contrast ratio with `text-destructive-foreground`
- TypeScript compilation clean
- Consistent focus ring pattern across all components

## Output Specification

- Modified: `packages/luca-observer/components/iteration/iteration-timeline.tsx`
- Modified: `packages/luca-observer/components/harness/check-result-card.tsx`
- Modified: `packages/luca-observer/components/dashboard/recent-events.tsx`
- Modified: `packages/luca-observer/components/dashboard/todo-tracker.tsx`
- Modified: `packages/luca-observer/components/memory/working-sections.tsx`
- Modified: `packages/luca-observer/components/memory/memory-entries.tsx`
