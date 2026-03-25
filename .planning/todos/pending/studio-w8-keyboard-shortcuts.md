---
title: "Keyboard shortcuts + progressive disclosure"
area: ui
created: 2026-03-25
source: docs/brainstorm/observer-studio-rework
depends_on: [studio-w5-feedback-components, studio-w4-layout-components]
phase: studio-w8
estimated_size: S
priority: P3
---

## Context

Keyboard shortcuts and progressive disclosure are polish features that improve the experience for power users. Shortcuts make the Studio feel professional and efficient; progressive disclosure ensures complexity doesn't overwhelm newcomers.

## Task

**Keyboard shortcuts (7):**

- `Cmd+K` -- Open command palette (CommandPalette component)
- `Cmd+S` -- Save current entity
- `Cmd+\` -- Toggle navigation rail
- `Cmd+.` -- Toggle detail panel
- `Cmd+Z` / `Cmd+Shift+Z` -- Undo/redo (in editors)
- `Escape` -- Close detail panel or exit edit mode
- `Cmd+Shift+P` -- Preview compiled output

Implement using a centralized keyboard shortcut handler that respects input focus (don't trigger shortcuts when typing in form fields or code editors).

**Progressive disclosure:**

- Collapsed sections by default (Source Preview, Event Log details, Impact Preview)
- Contextual actions appear only on relevant pages ("Re-run Harness" only on Eval page)
- Tooltips for technical terms (complexity levels, model tiers, gate names)
- "(Advanced)" labels on State and Eval pages
- No explicit modes -- complexity emerges through depth of interaction

See `docs/brainstorm/observer-studio-rework/3.ui-architecture.md` (Keyboard Shortcuts section) and `docs/brainstorm/observer-studio-rework/1.product-vision.md` (Progressive Disclosure Strategy) for specs.

## Key Files

- New: `packages/luca-studio/hooks/use-keyboard-shortcuts.ts`
- Modified: LayoutShell (register global shortcuts)
- Modified: Various page components (add collapsed sections, tooltips, labels)

## Verification

- All 7 keyboard shortcuts work correctly
- Shortcuts don't fire when typing in input fields or code editors
- Collapsed sections expand/collapse smoothly
- Tooltips appear on hover for technical terms
- "(Advanced)" labels render on State and Eval pages
