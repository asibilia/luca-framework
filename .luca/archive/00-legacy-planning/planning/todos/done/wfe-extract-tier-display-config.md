---
title: Extract shared TIER_DISPLAY_CONFIG constant
area: observer/workflow-editor
created: 2026-03-13
source: v4.3.0-MILESTONE-AUDIT.md
priority: HIGH
effort: Small
---

## Context

The v4.3.0 milestone audit identified TIER_CONFIG/TIER_LABELS duplicated between `agent-node.tsx:11` and `workflow-sidebar.tsx:16`. Both files define the same tier display mapping (color, label, description) independently.

## Task

Extract a shared `TIER_DISPLAY_CONFIG` constant into a dedicated file (e.g., `components/workflow-editor/constants.ts` or `lib/workflow-constants.ts`) and import it in both `agent-node.tsx` and `workflow-sidebar.tsx`.

## Files Affected

- `packages/luca-observer/components/workflow-editor/nodes/agent-node.tsx`
- `packages/luca-observer/components/workflow-editor/workflow-sidebar.tsx`

## Notes

- Audit source: dx-advocate (HIGH severity, cross-phase issue affecting phases 148 + 149)
- This is a DRY violation — the two copies can drift independently
