---
title: Use cn() utility instead of string concatenation for classNames
area: observer/workflow-editor
created: 2026-03-13
source: v4.3.0-MILESTONE-AUDIT.md
priority: MEDIUM
effort: Small
---

## Context

Three files use manual string concatenation for conditional Tailwind classes instead of the project's `cn()` utility (from `clsx` + `tailwind-merge`):

- `complexity-filter.tsx:42`
- `agent-node.tsx:69`
- `stage-group-node.tsx:77`

## Task

- Import `cn` from `~/lib/utils` in each file
- Replace template literal / string concatenation patterns with `cn()` calls
- Ensures proper class merging and cleaner conditional logic

## Files Affected

- `packages/luca-observer/components/workflow-editor/complexity-filter.tsx`
- `packages/luca-observer/components/workflow-editor/nodes/agent-node.tsx`
- `packages/luca-observer/components/workflow-editor/nodes/stage-group-node.tsx`

## Notes

- Audit source: ui reviewer (MEDIUM severity)
- `cn()` is the standard pattern across luca-observer — these are just missed during initial implementation
