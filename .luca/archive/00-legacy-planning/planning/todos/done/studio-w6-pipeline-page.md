---
title: "Pipeline page — interactive React Flow workflow editor (4 phases)"
area: ui
created: 2026-03-25
source: docs/brainstorm/observer-studio-rework
depends_on:
  [
    studio-w3-config-write-routes,
    studio-w4-layout-components,
    studio-w4-navigation-restructure,
    studio-w5-visualization-components,
    studio-w5-editor-components,
    studio-w5-feedback-components,
  ]
phase: studio-w6
estimated_size: XL
priority: P1
---

## Context

The Pipeline page is the core "wow moment" of the Studio -- users see their actual workflow as an interactive DAG, click steps to configure them, and toggle step behavior per complexity level. This evolves the existing read-only React Flow canvas into a full interactive editor. Research (R11) defined a 4-phase implementation plan.

## Task

Build the Pipeline page in 4 phases:

1. **Controlled state migration:** Migrate React Flow to v12 controlled state patterns (nodes/edges in Jotai atoms, onNodesChange/onEdgesChange handlers)
2. **Drag persistence:** Enable `nodesDraggable`, persist positions via `onNodeDragStop`
3. **Insert/delete nodes:** Add step via floating action button or canvas toolbar, remove step with confirmation dialog
4. **Connection drawing:** Draw edges for conditional flows, validate acyclic constraint, edge reconnection

Three levels of detail: Pipeline Overview -> Step Focus (detail panel) -> Agent Drill-Down (navigation to agent editor).

Step configuration in right detail panel with collapsible sections: Identity, Model Routing (ModelRoutingGrid), Loop Budgets (numeric sliders), Agents (list with links to agent editor), Gates (toggle switches).

Canvas toolbar: Zoom In, Zoom Out, Fit View, Minimap, Undo/Redo, Add Step, Layout toggle (H/V).

See `docs/brainstorm/observer-studio-rework/3.ui-architecture.md` (Workflow Editor UI section) and `docs/brainstorm/observer-studio-rework/9.research-frontend-tech.md` (R11) for the 4-phase plan.

## Key Files

- Modified: `packages/luca-studio/app/pipeline/page.tsx` (or new route)
- New: `packages/luca-studio/components/workflow/pipeline-canvas.tsx`
- New: `packages/luca-studio/components/workflow/step-config-panel.tsx`
- New: `packages/luca-studio/components/workflow/canvas-toolbar.tsx`
- Uses: WorkflowNode, WorkflowEdge, ModelRoutingGrid, DetailPanel components

## Verification

- Pipeline renders workflow DAG from config.json data
- Clicking a step opens the detail panel with configuration
- Toggling "skip for TRIVIAL" grays out the step at that complexity level
- Drag-and-drop reorders steps with edge updates
- Add/remove step operations persist to config via API
- Canvas toolbar controls (zoom, fit, minimap) work correctly
