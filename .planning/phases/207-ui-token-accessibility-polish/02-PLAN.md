---
phase: 207
plan: 2
type: improvement
autonomous: true
wave: 2
depends_on: [1]
---

# Phase 207 Plan 2: Accessibility Fixes (Focus-Visible, ARIA, Responsive Heights, Icon Button Sizing)

## Objective

Fix specific accessibility gaps identified in the UI audit: add `focus-visible` ring styling to interactive elements, add missing ARIA attributes (`aria-expanded`, `aria-label`) to collapsible sections and tables, fix responsive height issues in the command palette and CodeMirror editor, and unify icon button sizing to shadcn's `size="icon"` pattern. Scoped to the listed gaps only -- no full WCAG audit.

> Appetite: Small (50000 tokens remaining of 50000 ceiling)

## Context

@packages/luca-studio/app/settings/page.tsx
@packages/luca-studio/components/layout/command-palette.tsx
@packages/luca-studio/components/settings/config-history.tsx
@packages/luca-studio/components/settings/vault-config.tsx
@packages/luca-studio/components/settings/raw-config-editor.tsx
@packages/luca-studio/components/shared/entity-tab-container.tsx
@packages/luca-studio/components/home/quick-actions.tsx

## Tasks

### 1. Add aria-expanded to collapsible sections in settings/page.tsx and config-history.tsx

**Type:** auto
**TDD:** false
**Depends on:** none

Two components have expandable/collapsible elements missing `aria-expanded`:

**settings/page.tsx -- SettingsSection component (line ~58):**
The `CollapsibleTrigger` button wraps a plain `<button>` but does not propagate the open state as `aria-expanded`. Add `aria-expanded={open}` to the inner button element. The shadcn `Collapsible` primitive handles this via Radix, but the `asChild` pattern with a custom button may not pass it through. Verify and add if missing.

**config-history.tsx -- commit expand/collapse (line ~254):**
The commit header `<button>` toggles `expandedSha` but has no `aria-expanded`. Add `aria-expanded={isExpanded}` to the toggle button.

**Files to create/edit:**

- `packages/luca-studio/app/settings/page.tsx`
- `packages/luca-studio/components/settings/config-history.tsx`

**Verification:**

- Both buttons render `aria-expanded="true"` when open and `aria-expanded="false"` when closed
- `bunx --bun tsc --noEmit` passes

### 2. Add aria-label to data tables in vault-config.tsx

**Type:** auto
**TDD:** false
**Depends on:** none

The routing table in `vault-config.tsx` (line ~215) uses shadcn `<Table>` without an accessible label. Add `aria-label="Dual-vault routing table"` to the `<Table>` element so screen readers can identify the table purpose.

**Files to create/edit:**

- `packages/luca-studio/components/settings/vault-config.tsx`

**Verification:**

- Table element has `aria-label` attribute in rendered HTML
- `bunx --bun tsc --noEmit` passes

### 3. Add focus-visible rings to quick-actions.tsx link cards

**Type:** auto
**TDD:** false
**Depends on:** none

The `<Link>` cards in `quick-actions.tsx` (line ~73) have `hover:bg-muted/50` but no visible focus indicator. Add `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` to the className to provide keyboard navigation visibility.

**Files to create/edit:**

- `packages/luca-studio/components/home/quick-actions.tsx`

**Verification:**

- Link cards show a visible ring when focused via keyboard Tab
- `bunx --bun tsc --noEmit` passes

### 4. Add ARIA roles and focus-visible to command-palette.tsx

**Type:** auto
**TDD:** false
**Depends on:** none

The command palette has several a11y gaps:

1. **Missing role on list container**: The command list `<div>` (line ~301) should have `role="listbox"` and `aria-label="Commands"`.
2. **Missing role on command rows**: Each `CommandRow` button should have `role="option"` and `aria-selected={isSelected}`.
3. **Missing focus-visible on command rows**: Add `focus-visible:ring-2 focus-visible:ring-ring` to the button className.
4. **Missing aria-label on search input**: Add `aria-label="Search commands"` to the search input (line ~293).
5. **Responsive height fix**: The `max-h-80` (320px) on the command list may clip on short viewports. Change to `max-h-[min(320px,50vh)]` so the list adapts to smaller screens.

**Files to create/edit:**

- `packages/luca-studio/components/layout/command-palette.tsx`

**Verification:**

- Search input has `aria-label`
- List container has `role="listbox"`
- Command rows have `role="option"` and `aria-selected`
- Palette list height adapts on short viewports
- `bunx --bun tsc --noEmit` passes

### 5. Fix responsive CodeMirror height in raw-config-editor.tsx

**Type:** auto
**TDD:** false
**Depends on:** none

The CodeMirror container (line ~408) uses fixed `min-h-[300px] max-h-[500px]`. On small screens, 300px minimum can cause overflow. Change to responsive values:

- `min-h-[200px]` (allows the editor to be smaller on mobile)
- `max-h-[min(500px,60vh)]` (caps at viewport-relative height)

**Files to create/edit:**

- `packages/luca-studio/components/settings/raw-config-editor.tsx`

**Verification:**

- Editor container respects viewport height on small screens
- `bunx --bun tsc --noEmit` passes

### 6. Unify icon button sizing to shadcn size="icon" in entity-tab-container.tsx

**Type:** auto
**TDD:** false
**Depends on:** none

The edit/close buttons in `entity-tab-container.tsx` (lines ~262-282) use custom sizing: `className="h-6 w-6 p-0"` with `size="sm"`. Replace with shadcn's `size="icon"` variant which provides consistent 36x36 (or 32x32 depending on variant) sizing with centered icon. Since these are small header icons, use a custom approach: keep `size="icon"` and add a className override for the smaller header context: `className="size-7"` (28px, compact but touch-friendly).

Current:

```tsx
<Button variant="ghost" size="sm" className="h-6 w-6 p-0" ...>
```

Replacement:

```tsx
<Button variant="ghost" size="icon" className="size-7" ...>
```

The `aria-label` attributes are already present on these buttons -- no change needed there.

**Files to create/edit:**

- `packages/luca-studio/components/shared/entity-tab-container.tsx`

**Verification:**

- Icon buttons use `size="icon"` prop
- No remaining `h-6 w-6 p-0` custom sizing patterns in the file
- `bunx --bun tsc --noEmit` passes

## Verification

1. Run `bunx --bun tsc --noEmit` across luca-studio -- no type errors
2. Audit checklist:
   - `aria-expanded` present on collapsible triggers in settings page and config history
   - `aria-label` present on vault routing table
   - `focus-visible:ring-*` present on quick action link cards
   - Command palette has `role="listbox"`, `role="option"`, `aria-selected`, and `aria-label` on input
   - CodeMirror editor height is viewport-responsive
   - Icon buttons in entity-tab-container use `size="icon"`
3. Keyboard navigation test: Tab through quick actions, command palette, and collapsible sections -- all interactive elements show visible focus indicators

## Success Criteria

- All 6 listed a11y gaps are addressed in the target files
- No new accessibility regressions introduced
- Responsive heights adapt to small viewports
- Icon button sizing is consistent via shadcn `size="icon"`
- TypeScript compilation passes

## Output Specification

- 7 modified component/page files with accessibility improvements
