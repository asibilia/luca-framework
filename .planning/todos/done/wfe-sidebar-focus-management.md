---
title: Add focus management to workflow sidebar panel
area: observer/workflow-editor
created: 2026-03-13
source: v4.3.0-MILESTONE-AUDIT.md
priority: HIGH
effort: Small
---

## Context

At `workflow-sidebar.tsx:267`, the sidebar panel opens on node click but doesn't receive focus. Keyboard users cannot interact with the sidebar content without manually tabbing to it.

## Task

- Use a `useEffect` + ref to move focus to the sidebar panel (or its close button) when `selectedNode` changes from null to a value
- Ensure focus returns to the canvas (or previously focused element) when the sidebar closes
- Consider adding `aria-label` to the sidebar panel

## Files Affected

- `packages/luca-observer/components/workflow-editor/workflow-sidebar.tsx`

## Notes

- Audit source: ui reviewer (HIGH severity)
- Pairs well with the ARIA complexity filter todo — both are accessibility improvements
