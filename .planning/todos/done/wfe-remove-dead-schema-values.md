---
title: Remove dead "step" and "invokes" schema values from workflow types
area: observer/workflow-editor
created: 2026-03-13
source: v4.3.0-MILESTONE-AUDIT.md
priority: LOW
effort: Small
---

## Context

`workflow-types.ts` contains vestigial enum values:

- `"step"` in `WorkflowNodeTypeSchema` — replaced by `"stage-group"` in phase 148
- `"invokes"` in edge type schema — removed when containment replaced invocation edges

These were kept for backward compat during development but are no longer used anywhere.

## Task

- Remove `"step"` from `WorkflowNodeTypeSchema`
- Remove `"invokes"` from the edge type schema
- Remove corresponding `NODE_WIDTH["step"]` / `NODE_HEIGHT["step"]` defensive fallbacks in `auto-layout.ts`
- Verify no runtime references remain (grep for "step" and "invokes" in workflow editor files)

## Files Affected

- `packages/luca-observer/lib/workflow-types.ts`
- `packages/luca-observer/components/workflow-editor/auto-layout.ts`

## Notes

- Audit source: code-architect (LOW severity)
- The audit noted these as "intentional backward compat" but since the milestone is complete, they can be cleaned up
