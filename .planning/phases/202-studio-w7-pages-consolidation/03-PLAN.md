---
phase: 202
plan: 3
type: feature
autonomous: true
wave: 3
depends_on: [1, 2]
---

# Phase 202 Plan 3: Edit vs Observe Mode Distinction

## Objective

Implement a per-entity-surface mode distinction between View (observe) and Edit modes across all entity editor pages (Agents, Skills, Rules). View mode is the default. Edit mode is entered explicitly via a button and provides five unsaved-changes signals. This creates a clear visual and behavioral boundary between browsing entities and modifying them.

> Appetite: Large (~80,000 tokens remaining of 200,000 ceiling after Waves 1-2)

## Context

@packages/luca-studio/app/agents/page.tsx (first page to integrate edit mode)
@packages/luca-studio/app/skills/page.tsx (built in Wave 1, needs edit mode)
@packages/luca-studio/app/rules/page.tsx (built in Wave 1, needs edit mode)
@packages/luca-studio/components/agents/agent-tab-container.tsx (tab container needs view/edit modes)
@packages/luca-studio/components/agents/agent-config-form.tsx (form needs read-only mode)
@packages/luca-studio/components/feedback/save-bar.tsx (already exists, shown only in edit mode)
@packages/luca-studio/components/feedback/dirty-indicator.tsx (signal 1)
@packages/luca-studio/stores/dirty-tracking.ts (dirtySetAtom for unsaved detection)
@packages/luca-studio/stores/entity-atoms.ts (draft atoms for all entity types)
@packages/luca-studio/stores/layout.ts (layoutContextAtom)
@.planning/phases/202-studio-w7-pages-consolidation/01-CONTEXT.md
@.planning/phases/202-studio-w7-pages-consolidation/01-PREMORTEM.md

## Tasks

### 1. Create useEditMode hook

**Type:** auto
**TDD:** false
**Depends on:** none

Create a per-entity edit mode hook that manages the View/Edit state for a single editing surface. The hook integrates with dirty tracking to prevent accidental data loss.

**Hook: `hooks/use-edit-mode.ts`**

```typescript
type UseEditModeReturn = {
  /** Whether the entity is in edit mode. */
  isEditing: boolean;
  /** Enter edit mode. */
  enterEdit: () => void;
  /** Exit edit mode. If dirty, shows confirmation first. */
  exitEdit: () => void;
  /** Force exit without confirmation (used after save completes). */
  forceExit: () => void;
  /** Whether the entity has unsaved changes. */
  isDirty: boolean;
  /** Whether the exit confirmation dialog should be shown. */
  showExitConfirm: boolean;
  /** Confirm the exit (discard changes and leave edit mode). */
  confirmExit: () => void;
  /** Cancel the exit (stay in edit mode). */
  cancelExit: () => void;
};
```

**Behavior:**

- `enterEdit()` sets `isEditing = true`
- `exitEdit()` checks `isDirty` -- if dirty, sets `showExitConfirm = true`. If clean, sets `isEditing = false`.
- `confirmExit()` calls the provided `discard` callback, sets `isEditing = false`, hides dialog.
- `forceExit()` sets `isEditing = false` without checking dirty (used after save completes).
- `isDirty` reads from `dirtySetAtom` using the entity key.

**Parameters:**

- `entityKey: string` -- The dirty tracking key (e.g., `"agent:lu-router"`)
- `onDiscard?: () => void` -- Optional discard callback to reset draft on confirmed exit

**Files to create:**

- `packages/luca-studio/hooks/use-edit-mode.ts`

**Verification:**

- Hook returns all expected fields
- `enterEdit()` / `exitEdit()` toggle correctly
- Dirty entity shows confirmation dialog on exit attempt
- Clean entity exits immediately
- TypeScript compiles: `bunx --bun tsc --noEmit` passes

### 2. Create navigation guard for unsaved changes

**Type:** auto
**TDD:** false
**Depends on:** 1

Create a navigation guard component that prevents leaving a page with unsaved edits. Implements two guard mechanisms: browser `beforeunload` for tab close/reload, and Next.js route change interception.

**Component: `components/feedback/navigation-guard.tsx`**

Props:

- `when: boolean` -- Whether to block navigation (typically `isEditing && isDirty`)
- `message?: string` -- Custom message for the dialog (defaults to "You have unsaved changes. Discard and leave?")

**Browser guard:**

- Registers `beforeunload` event listener when `when` is true
- Shows browser-native "Leave site?" dialog on tab close or reload
- Removes listener when `when` becomes false or on unmount

**Route guard:**

- Uses Next.js `useRouter` to intercept client-side navigation
- When `when` is true and user navigates, shows an AlertDialog asking to confirm
- On confirm: allows navigation to proceed
- On cancel: stays on current page

**Files to create:**

- `packages/luca-studio/components/feedback/navigation-guard.tsx`

**Verification:**

- Closing browser tab with dirty edits shows native "Leave site?" dialog
- Clicking a nav link with dirty edits shows AlertDialog confirmation
- Confirming allows navigation; canceling stays on page
- No guard active when `when` is false
- TypeScript compiles: `bunx --bun tsc --noEmit` passes

### 3. Create browser tab title and breadcrumb signals

**Type:** auto
**TDD:** false
**Depends on:** 1

Implement two of the five unsaved-changes signals: browser tab title prefix and breadcrumb suffix.

**Browser tab title (signal 3):**

- Create `hooks/use-dirty-title.ts` that prefixes the document title with `[*] ` when any entity on the current page has unsaved changes.
- Reads from `dirtySetAtom` and filters by entity prefix for the current page.
- Restores original title on cleanup.

**Breadcrumb suffix (signal 5):**

- Update the entity page header area (in each tab container or page) to show `(edited)` suffix next to the entity name when in edit mode with dirty changes.
- This is a visual indicator within the tab container header, not a separate component.

**Files to create/edit:**

- Create: `packages/luca-studio/hooks/use-dirty-title.ts`

**Verification:**

- Browser tab shows `[*] Luca Studio` when edits are unsaved
- Browser tab reverts to `Luca Studio` when changes are saved or discarded
- TypeScript compiles: `bunx --bun tsc --noEmit` passes

### 4. Integrate edit mode into Agents page

**Type:** auto
**TDD:** false
**Depends on:** 1, 2, 3

Wire the edit mode system into the existing Agents page. This serves as the reference implementation for Skills and Rules.

**View mode (default):**

- Agent config form fields render as text/badges, not editable inputs
- No SaveBar visible
- Detail panel header shows agent name only
- Standard `bg-background` background

**Edit mode (entered via button):**

- Thin 2px accent bar (`bg-primary`) at top of editing surface
- Detail panel header shows "Editing: {agent name}"
- Fields transform to editable inputs
- SaveBar slides up from bottom
- Background shifts to `bg-card`
- "Done" button (after save) or "Discard" button to exit

**Edit button:**

- Pencil icon button in the tab container header area
- Only visible in View mode
- Clicking enters Edit mode

**Integration points:**

- `useEditMode("agent:{selectedName}")` in agents/page.tsx
- Pass `isEditing` to `AgentTabContainer` and `AgentConfigForm`
- `AgentConfigForm` reads `isEditing` prop to toggle between view/edit rendering
- `SaveBar` conditionally rendered when `isEditing` is true
- `NavigationGuard` with `when={isEditing && isDirty}`
- `useDirtyTitle("agent:")` for browser tab title signal
- After successful save, call `forceExit()` to return to view mode

**Files to edit:**

- `packages/luca-studio/app/agents/page.tsx` (add useEditMode, pass isEditing down)
- `packages/luca-studio/components/agents/agent-tab-container.tsx` (add edit button, mode indicator, pass isEditing to form)
- `packages/luca-studio/components/agents/agent-config-form.tsx` (add view-only rendering mode)

**Verification:**

- Agents page loads in View mode by default (fields are read-only text)
- Clicking Edit (pencil) enters Edit mode (fields become inputs, SaveBar appears)
- Accent bar visible at top of editing surface in Edit mode
- Header shows "Editing: lu-router" in Edit mode
- Saving returns to View mode
- Discarding dirty changes shows confirmation dialog
- Navigation guard blocks leaving page with unsaved changes
- Browser tab title shows `[*]` prefix when dirty
- All five unsaved-changes signals active: DirtyIndicator dot, SaveBar visibility, tab title prefix, navigation guard dialog, breadcrumb suffix

### 5. Integrate edit mode into Skills page

**Type:** auto
**TDD:** false
**Depends on:** 4

Apply the same edit mode pattern from the Agents page to the Skills page. Since Wave 1 built the Skills page cloning the Agents pattern, this task adds the same edit mode wiring.

**Files to edit:**

- `packages/luca-studio/app/skills/page.tsx` (add useEditMode, NavigationGuard, useDirtyTitle)
- `packages/luca-studio/components/skills/skill-tab-container.tsx` (add edit button, mode indicator)
- `packages/luca-studio/components/skills/skill-config-form.tsx` (add view-only rendering mode)

**Verification:**

- Skills page loads in View mode by default
- Edit mode toggle works identically to Agents page
- All five unsaved-changes signals active
- TypeScript compiles: `bunx --bun tsc --noEmit` passes

### 6. Integrate edit mode into Rules page

**Type:** auto
**TDD:** false
**Depends on:** 4

Apply the same edit mode pattern to the Rules page.

**Files to edit:**

- `packages/luca-studio/app/rules/page.tsx` (add useEditMode, NavigationGuard, useDirtyTitle)
- `packages/luca-studio/components/rules/rule-tab-container.tsx` (add edit button, mode indicator)
- `packages/luca-studio/components/rules/rule-config-form.tsx` (add view-only rendering mode)

**Verification:**

- Rules page loads in View mode by default
- Edit mode toggle works identically to Agents page
- All five unsaved-changes signals active
- TypeScript compiles: `bunx --bun tsc --noEmit` passes

## Verification

1. All three entity pages (Agents, Skills, Rules) load in View mode by default
2. Edit mode is entered via pencil button and exited via Done/Discard
3. View mode shows read-only text; Edit mode shows editable inputs
4. Visual distinction: accent bar, background shift, header text change
5. All five unsaved-changes signals work on all three pages:
   - DirtyIndicator dot on Configure tab
   - SaveBar visibility
   - Browser tab title `[*]` prefix
   - Navigation guard dialog on dirty navigation
   - Header suffix "(edited)" or "Editing: {name}"
6. Navigation guard blocks both browser close and client-side navigation
7. Config page is NOT affected (always editable, no view/edit mode)
8. `bunx --bun tsc --noEmit` passes with no new type errors

## Success Criteria

- Per-entity edit mode works on Agents, Skills, and Rules pages
- View mode is the default -- users must explicitly enter edit mode
- Five unsaved-changes signals prevent accidental data loss
- Navigation guard catches both browser close and route changes
- Config page remains always-editable (not affected by this feature)
- Edit mode UX is consistent across all three entity pages

## Output Specification

**New files (3):**

- `packages/luca-studio/hooks/use-edit-mode.ts`
- `packages/luca-studio/hooks/use-dirty-title.ts`
- `packages/luca-studio/components/feedback/navigation-guard.tsx`

**Edited files (9):**

- `packages/luca-studio/app/agents/page.tsx`
- `packages/luca-studio/components/agents/agent-tab-container.tsx`
- `packages/luca-studio/components/agents/agent-config-form.tsx`
- `packages/luca-studio/app/skills/page.tsx`
- `packages/luca-studio/components/skills/skill-tab-container.tsx`
- `packages/luca-studio/components/skills/skill-config-form.tsx`
- `packages/luca-studio/app/rules/page.tsx`
- `packages/luca-studio/components/rules/rule-tab-container.tsx`
- `packages/luca-studio/components/rules/rule-config-form.tsx`
