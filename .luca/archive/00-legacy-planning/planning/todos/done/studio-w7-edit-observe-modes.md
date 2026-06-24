---
title: "Edit/observe visual mode distinction"
area: ui
created: 2026-03-25
source: docs/brainstorm/observer-studio-rework
depends_on: [studio-w5-feedback-components]
phase: studio-w7
estimated_size: M
priority: P2
---

## Context

The Studio needs clear visual distinction between viewing and editing states. Without this, users may not realize they're in edit mode or may miss unsaved changes. The distinction is contextual (per editing surface), not a global mode toggle.

## Task

Implement edit/observe visual mode distinction:

**View mode (default):**

- Standard background (`bg-background`)
- No save bar
- Fields rendered as text/badges, not inputs
- Detail panel header shows "Details" or entity name

**Edit mode (entered explicitly):**

- Thin accent bar (2px, `bg-primary`) at top of editing surface
- Detail panel header: "Editing: {entity name}" (editable inline)
- Fields transform from text to inputs (subtle animation, border appears)
- SaveBar slides up from bottom
- Background shifts slightly (`bg-background` -> `bg-card`)

**Transitions:**

- Observe -> Edit: Click "Edit" button (pencil icon). URL updates to include `/edit`
- Edit -> Observe: Click "Done" (after save) or "Discard". Dirty check dialog if unsaved.
- Navigation guard: Dialog on nav with dirty state: "You have unsaved changes."

**Five redundant unsaved-changes signals:** DirtyIndicator dot, SaveBar, browser tab title prefix, navigation guard, breadcrumb suffix "(edited)".

See `docs/brainstorm/observer-studio-rework/3.ui-architecture.md` (Visual Language: Edit vs. Observe section) for the full color language and transition spec.

## Key Files

- New: `packages/luca-studio/hooks/use-edit-mode.ts`
- Modified: Entity page components (agents, skills, rules, pipeline)
- Modified: LayoutShell (edit mode accent bar)
- Modified: Navigation (dirty check guard)

## Verification

- View mode shows fields as non-editable text
- Edit mode shows editable inputs with accent bar
- URL updates to include `/edit` segment
- Navigation guard dialog appears when leaving with unsaved changes
- All five unsaved-changes signals render correctly
