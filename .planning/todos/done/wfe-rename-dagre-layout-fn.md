---
title: Rename applyDagreLayout to applyGroupedColumnLayout
area: observer/workflow-editor
created: 2026-03-13
source: v4.3.0-MILESTONE-AUDIT.md
priority: LOW
effort: Small
---

## Context

The function `applyDagreLayout` in `auto-layout.ts` no longer uses dagre — it was rewritten in phase 149 to use a custom grouped column layout algorithm. The name is now misleading.

## Task

- Rename `applyDagreLayout` to `applyGroupedColumnLayout` in `auto-layout.ts`
- Update the import in `workflow-canvas.tsx` (the only consumer)

## Files Affected

- `packages/luca-observer/components/workflow-editor/auto-layout.ts`
- `packages/luca-observer/components/workflow-editor/workflow-canvas.tsx`

## Notes

- Audit source: code-architect (LOW severity)
- Two-file rename, trivial change
