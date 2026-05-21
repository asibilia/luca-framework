---
title: Replace inline SVG with Lucide X icon in sidebar
area: observer/workflow-editor
created: 2026-03-13
source: v4.3.0-MILESTONE-AUDIT.md
priority: MEDIUM
effort: Small
---

## Context

At `workflow-sidebar.tsx:284`, the sidebar close button uses an inline SVG instead of the Lucide `X` icon component. The rest of the observer uses Lucide icons consistently.

## Task

- Import `X` from `lucide-react`
- Replace the inline `<svg>` with `<X className="h-4 w-4" />`

## Files Affected

- `packages/luca-observer/components/workflow-editor/workflow-sidebar.tsx`

## Notes

- Audit source: ui + dx-advocate (MEDIUM severity)
- Trivial change, improves consistency with the rest of the icon system
