---
title: "P2: Accessibility pass on observer dashboard"
area: ui
created: 2026-03-04
source: repo-review audit (uiux-reviewer)
priority: P2
---

## Context

Several accessibility gaps identified across the observer dashboard: missing focus indicators, missing aria attributes, color-only status indicators.

## Task

1. Add `focus:ring-2 focus:ring-offset-2` to all interactive elements lacking focus rings
2. Add `aria-expanded={isOpen}` to collapse toggles in:
   - `components/memory/memory-entries.tsx`
   - `components/tribunal/disagreements-panel.tsx`
   - `components/decisions/decision-timeline.tsx`
   - `app/notes/page.tsx:181-187`
3. Add `aria-label` to icon-only buttons (sidebar toggle, theme toggle)
4. Add `aria-label` to color-only status indicators: `aria-label={Status: ${status}}`
5. Ensure keyboard navigation works for all collapsible sections

## Notes

- Violates WCAG AA for keyboard accessibility
- Status indicators use color-only semantics — fails for colorblind users
- Low effort, high impact for inclusive design
