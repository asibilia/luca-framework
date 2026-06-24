---
title: Centralize NODE_TYPE_COLORS for minimap and stats bar
area: observer/workflow-editor
created: 2026-03-13
source: v4.3.0-MILESTONE-AUDIT.md
priority: MEDIUM
effort: Small
---

## Context

The node type color mapping (stage-group=blue, agent=gray, gate=amber, skill=violet) is duplicated between `workflow-canvas.tsx:43` (minimap color helper) and `workflow-stats-bar.tsx` (colored dots). Both define the same hex/Tailwind values independently.

## Task

- Create a shared `NODE_TYPE_COLORS` constant (e.g., in `lib/workflow-constants.ts` or alongside the TIER_DISPLAY_CONFIG extraction)
- Import and use in both `minimapNodeColor()` and `WorkflowStatsBar`
- Consider including both hex (for minimap) and Tailwind class (for stats bar) variants

## Files Affected

- `packages/luca-observer/components/workflow-editor/workflow-canvas.tsx`
- `packages/luca-observer/components/workflow-editor/workflow-stats-bar.tsx`

## Notes

- Audit source: code-simplifier (MEDIUM severity)
- Can be combined with the TIER_DISPLAY_CONFIG extraction into a single constants file
