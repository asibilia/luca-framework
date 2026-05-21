---
title: "Feedback components (DirtyIndicator, SaveBar, ValidationBanner)"
area: ui
created: 2026-03-25
source: docs/brainstorm/observer-studio-rework
depends_on: [studio-w2-jotai-atom-model]
phase: studio-w5
estimated_size: M
priority: P1
---

## Context

The Studio editing workflow needs clear visual feedback for unsaved changes, save operations, and validation errors. These components consume the Jotai dirty tracking atoms (Layer 3) and are used across all editing surfaces.

## Task

Build five state/feedback components (P1 items first, P2 items second):

**P1 (required for editing):**

- **DirtyIndicator:** 6px amber dot/badge for unsaved changes. Used in entity tree, tab headers, and page titles. Consumes `dirtySetAtom`.
- **SaveBar:** Sticky bottom bar with change count, [Discard] and [Save] buttons. States: hidden (clean), visible (dirty), "Saving..." (in-flight), "Saved" (brief success flash). Consumes `canSaveAtom` and `dirtySetAtom`.
- **ValidationBanner:** Inline schema validation errors per field. Renders Zod error messages in a structured, dismissible banner. Consumes `validationErrorsAtom`.

**P2 (secondary):**

- **PublishDialog:** Confirmation dialog for compilation with full diff preview of changes about to be compiled.
- **CommandPalette:** Cmd+K command palette using shadcn's `CommandDialog` (wraps cmdk). Universal across all pages with commands like "Go to agent", "Toggle edit mode", "Save current changes".

See `docs/brainstorm/observer-studio-rework/3.ui-architecture.md` (State/Feedback Components and Visual Language sections) for the five redundant unsaved-changes signals and color language spec.

## Key Files

- New: `packages/luca-studio/components/feedback/dirty-indicator.tsx`
- New: `packages/luca-studio/components/feedback/save-bar.tsx`
- New: `packages/luca-studio/components/feedback/validation-banner.tsx`
- New: `packages/luca-studio/components/feedback/publish-dialog.tsx`
- New: `packages/luca-studio/components/feedback/command-palette.tsx`

## Verification

- DirtyIndicator renders amber dot when entity has unsaved changes
- SaveBar appears when dirty, hides when clean, shows "Saving..." during save
- ValidationBanner displays structured Zod errors per field
- All components correctly consume Jotai dirty tracking atoms
- Save/Discard buttons trigger appropriate atom updates
