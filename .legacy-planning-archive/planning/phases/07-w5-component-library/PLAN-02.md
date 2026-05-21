---
phase: 7
plan: 2
type: feature
autonomous: true
wave: 1
depends_on: []
---

# Phase 7 Plan 2: Feedback Components (DirtyIndicator, SaveBar, ValidationBanner)

## Objective

Build three P1 state/feedback components that provide visual signals for unsaved changes, save operations, and validation errors across all editing surfaces in the Studio. These consume the Jotai dirty tracking atoms from `stores/dirty-tracking.ts` and must exist before any feature page with editing capability. P2 feedback components (PublishDialog, CommandPalette) are deferred.

## Context

@packages/luca-studio/components/feedback/ (new directory -- all files created here)
@packages/luca-studio/stores/dirty-tracking.ts (dirtySetAtom, canSaveAtom, validationErrorsAtom, markCleanAtom)
@docs/brainstorm/observer-studio-rework/3.ui-architecture.md (Visual Language and State/Feedback Components sections)
@packages/luca-studio/components/ui/ (shadcn primitives: button, badge, alert)

## Tasks

### 1. Create DirtyIndicator component

**Type:** auto
**TDD:** false
**Depends on:** none

Build a minimal amber dot indicator at `packages/luca-studio/components/feedback/dirty-indicator.tsx`.

Requirements:

- "use client" directive (reads Jotai atoms)
- Two usage modes controlled by props:
  - **Atom-driven mode**: Pass `entityKey` string prop. Component reads `dirtySetAtom` and renders dot only when the key is in the dirty set. This is the primary mode for entity tree items and tab headers.
  - **Controlled mode**: Pass `isDirty` boolean prop directly. For contexts where the parent already knows dirty state (e.g., page title that aggregates multiple keys).
- If both props provided, `isDirty` takes precedence (explicit override).
- Visual: 6px diameter circle, `bg-amber-500`, with a subtle pulse animation on first appearance (one-time `animate-ping` then static)
- Accessible: `aria-label="Unsaved changes"` and `role="status"`
- Compact: inline-flex, no extra margin (consumer positions it)
- Optional `size` prop: "sm" (6px, default), "md" (8px) for use in page titles

**Files to create/edit:**

- `packages/luca-studio/components/feedback/dirty-indicator.tsx`

**Verification:**

- Dot renders when entityKey is in dirtySetAtom, hidden otherwise
- Dot renders when isDirty=true in controlled mode
- Animation plays once on appearance, then dot remains static
- Screen readers announce "Unsaved changes" status
- Both size variants render at correct dimensions

### 2. Create SaveBar component

**Type:** auto
**TDD:** false
**Depends on:** none

Build a sticky bottom bar at `packages/luca-studio/components/feedback/save-bar.tsx`.

Requirements:

- "use client" directive
- Consumes `dirtySetAtom` and `canSaveAtom` from dirty tracking store
- Props:
  - `onSave`: async callback invoked when Save is clicked. Returns a promise.
  - `onDiscard`: callback invoked when Discard is clicked.
  - Optional `entityFilter`: string or string[] to scope the bar to specific entity key prefixes (e.g., "agent:" shows only agent dirty count). If omitted, shows all dirty entities.
- Four visual states managed via internal Jotai atom or local state:
  1. **Hidden**: dirty set is empty (for filtered scope) -- bar not rendered (or height-0 with slide-down animation)
  2. **Visible/dirty**: shows change count (e.g., "3 unsaved changes"), [Discard] secondary button, [Save] primary button
  3. **Saving**: Save button shows spinner + "Saving..." text, both buttons disabled
  4. **Saved**: Brief success flash (green background, "Saved" text, checkmark icon) for 1.5s, then auto-hides
- Fixed to bottom of the editing area (use `sticky bottom-0` or `fixed` depending on layout context -- prefer sticky)
- Slide-up animation on appear, slide-down on hide (Tailwind transition on height/transform)
- Save button disabled when `canSaveAtom` is false (validation errors exist)
- Discard button calls `onDiscard` and then clears dirty state for filtered keys (or all keys)
- Error handling: if `onSave` rejects, show error state (red background, error message, retry button) for 3s then revert to dirty state

**Files to create/edit:**

- `packages/luca-studio/components/feedback/save-bar.tsx`

**Verification:**

- Bar appears when entities are dirty, hides when clean
- Change count matches number of dirty entity keys
- Save button is disabled when validation errors exist
- Clicking Save shows "Saving..." state, then "Saved" flash on success
- Clicking Discard calls onDiscard and clears dirty state
- Failed save shows error state with retry
- entityFilter correctly scopes the bar to matching keys

### 3. Create ValidationBanner component

**Type:** auto
**TDD:** false
**Depends on:** none

Build an inline validation error banner at `packages/luca-studio/components/feedback/validation-banner.tsx`.

Requirements:

- "use client" directive
- Two usage modes:
  - **Atom-driven mode**: Pass `entityKey` string. Reads `validationErrorsAtom` for that key.
  - **Controlled mode**: Pass `errors` string array directly.
- Renders nothing when there are no errors
- When errors exist, renders a structured banner:
  - Red/destructive left border accent (2px, matching the app error color language)
  - Alert icon (Lucide `AlertCircle`) in header
  - Header text: "Validation errors" (or custom `title` prop)
  - Each error rendered as a list item with bullet
  - Dismissible: X button in top-right corner sets a local `dismissed` state. Banner re-appears if errors change (new errors added or existing errors modified).
- Uses shadcn Alert component as the base if it fits, or builds from Tailwind primitives
- Compact: max-height with overflow-y-auto for cases with many errors (cap at ~120px visible, scroll for rest)
- Accessible: `role="alert"`, errors are in a `<ul>` with `aria-label="Validation errors"`

**Files to create/edit:**

- `packages/luca-studio/components/feedback/validation-banner.tsx`

**Verification:**

- Banner renders error list when entity key has validation errors
- Banner hidden when no errors exist
- Dismissing banner hides it until errors change
- Controlled mode works with direct errors array
- Scrollable when many errors present
- Screen readers announce errors via role="alert"

### 4. Create feedback barrel export

**Type:** auto
**TDD:** false
**Depends on:** 1, 2, 3

Create the barrel index file for the feedback components directory.

**Files to create/edit:**

- `packages/luca-studio/components/feedback/index.ts`

**Verification:**

- All three components are re-exported from the barrel
- Import `{ DirtyIndicator, SaveBar, ValidationBanner } from "@/components/feedback"` resolves correctly

## Verification

- All three components render without errors in a Next.js page
- `bunx --bun tsc --noEmit` passes with no type errors in the new files
- Components correctly consume Jotai dirty tracking atoms (dirtySetAtom, canSaveAtom, validationErrorsAtom)
- No classes used -- functional components with hooks only
- All files follow kebab-case naming convention
- Color language matches the spec: amber-500 for dirty, destructive for errors, green-500 for success

## Success Criteria

- DirtyIndicator provides a consistent unsaved-changes signal usable in trees, tabs, and titles
- SaveBar provides a complete save/discard workflow with optimistic state management
- ValidationBanner surfaces Zod schema errors in a structured, dismissible format
- All three components integrate with the Layer 3 dirty tracking atom model
- Components are ready to be composed into feature pages in Phase 8

## Output Specification

- `packages/luca-studio/components/feedback/dirty-indicator.tsx`
- `packages/luca-studio/components/feedback/save-bar.tsx`
- `packages/luca-studio/components/feedback/validation-banner.tsx`
- `packages/luca-studio/components/feedback/index.ts`
