---
title: Add ARIA radiogroup/radio roles to complexity filter
area: observer/workflow-editor
created: 2026-03-13
source: v4.3.0-MILESTONE-AUDIT.md
priority: HIGH
effort: Small
---

## Context

The complexity filter at `complexity-filter.tsx:39` renders toggle buttons that function as a radio group (only one complexity level active at a time) but lacks proper ARIA semantics. Screen readers cannot identify the control pattern.

## Task

- Add `role="radiogroup"` and `aria-label="Complexity level"` to the container
- Add `role="radio"` and `aria-checked={isSelected}` to each button
- Ensure keyboard navigation (arrow keys to move between options)

## Files Affected

- `packages/luca-observer/components/workflow-editor/complexity-filter.tsx`

## Notes

- Audit source: ui reviewer (HIGH severity)
- This is a read-only visualization tool, but accessibility is still important for team compliance
