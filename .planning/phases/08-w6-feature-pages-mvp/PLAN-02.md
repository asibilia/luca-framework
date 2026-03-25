---
phase: 08
plan: 02
type: feature
autonomous: true
wave: 1
depends_on: []
---

# Phase 8 Plan 2: Pipeline Editor Page

## Objective

Evolve the existing read-only workflow canvas into an interactive pipeline editor with controlled state management, drag persistence, step configuration in the detail panel, and a canvas toolbar. This is the core "wow moment" of the Studio -- users see their actual workflow as an interactive DAG, click steps to configure them, and toggle step behavior per complexity level. The implementation follows the 4-phase approach from R11 research: controlled state migration, drag persistence, insert/delete nodes, and connection drawing.

> Appetite: Large (200000 tokens remaining of 200000 ceiling)

## Context

@packages/luca-studio/app/pipeline/page.tsx (current page with read-only WorkflowCanvas)
@packages/luca-studio/components/workflow-editor/workflow-canvas.tsx (existing React Flow canvas -- read-only, computed layout, custom node types, sidebar inspection)
@packages/luca-studio/components/workflow-editor/workflow-sidebar.tsx (existing inspection sidebar with type-aware details)
@packages/luca-studio/components/workflow-editor/auto-layout.ts (applyGroupedColumnLayout -- computes positions from topology)
@packages/luca-studio/components/workflow-editor/edge-styles.ts (applyEdgeStyles)
@packages/luca-studio/components/workflow-editor/nodes/agent-node.tsx (custom AgentNode)
@packages/luca-studio/components/workflow-editor/nodes/gate-node.tsx (custom GateNode)
@packages/luca-studio/components/workflow-editor/nodes/skill-node.tsx (custom SkillNode)
@packages/luca-studio/components/workflow-editor/nodes/stage-group-node.tsx (custom StageGroupNode)
@packages/luca-studio/components/workflow/workflow-node.tsx (WorkflowNode from W5 component library -- 280px card with domain accent, metadata, status pill)
@packages/luca-studio/components/workflow/workflow-edge.tsx (WorkflowEdge from W5 -- animated smooth step path)
@packages/luca-studio/components/layout/detail-panel.tsx (right-side panel with docked/floating/closed states)
@packages/luca-studio/components/layout/layout-shell.tsx (three-zone CSS grid)
@packages/luca-studio/components/feedback/save-bar.tsx (sticky save/discard bar)
@packages/luca-studio/stores/config-atoms.ts (configAtom, configDraftAtom)
@packages/luca-studio/stores/dirty-tracking.ts (dirtySetAtom, markDirtyAtom)
@packages/luca-studio/stores/layout.ts (layoutContextAtom, detailPanelStateAtom)
@packages/luca-studio/hooks/use-workflow-graph.ts (existing hook that fetches /api/workflow/topology)
@packages/luca-studio/app/api/config/route.ts (GET config.json)
@packages/luca-studio/app/api/config/workflow/route.ts (PUT workflow section)
@docs/brainstorm/observer-studio-rework/3.ui-architecture.md (Workflow Editor UI spec)
@docs/brainstorm/observer-studio-rework/9.research-frontend-tech.md (R11 -- React Flow v12 4-phase plan)

## Tasks

### 1. Controlled State Migration and Pipeline Canvas Refactor

**Type:** auto
**TDD:** false
**Depends on:** none

Migrate the existing workflow canvas from computed layout to controlled React Flow state, following R11 Phase A:

1. Create `pipeline-canvas.tsx` in `components/workflow/` as the new interactive canvas component (replacing the read-only `workflow-editor/workflow-canvas.tsx` for the pipeline page). The existing read-only canvas remains available for any non-editing contexts.
2. Use React Flow v12 controlled state: `useNodesState` and `useEdgesState` with `onNodesChange` and `onEdgesChange` handlers. Initialize from the topology API data via the existing `useWorkflowGraph` hook, applying `applyGroupedColumnLayout` only once as initialization (not per-render).
3. Store node positions and edge connections in Jotai atoms: create `pipeline-atoms.ts` with `pipelineNodesAtom` and `pipelineEdgesAtom` that hold the current React Flow state.
4. Refactor the pipeline page (`app/pipeline/page.tsx`) to:
   - Set `layoutContextAtom` to `"editor"` on mount
   - Use the new `pipeline-canvas.tsx` instead of the old WorkflowCanvas
   - Wrap with `ReactFlowProvider`
5. Register the W5 `WorkflowNode` and `WorkflowEdge` as additional node/edge types alongside the existing workflow-editor node types, so both the old inspector nodes and the new pipeline nodes can coexist during migration.
6. Keep existing functionality: fit view, minimap, controls, complexity filter, background, keyboard shortcuts.

**Files to create/edit:**

- `packages/luca-studio/components/workflow/pipeline-canvas.tsx` (new interactive canvas)
- `packages/luca-studio/stores/pipeline-atoms.ts` (pipeline state atoms)
- `packages/luca-studio/app/pipeline/page.tsx` (refactor to use new canvas)

**Verification:**

- Pipeline page renders the same DAG as before
- Nodes and edges are in controlled state (React Flow v12 pattern)
- Existing features still work: zoom, fit view, minimap, complexity filter
- Layout context is "editor" (NavRail collapsed)

### 2. Step Configuration Detail Panel

**Type:** auto
**TDD:** false
**Depends on:** 1

Build the step configuration panel that opens in the right DetailPanel when a node is clicked:

1. Create `step-config-panel.tsx` with collapsible sections matching the spec:
   - **Identity**: Step name (editable input), description (textarea), step type badge, enabled toggle (switch)
   - **Model Routing**: Read-only table showing the step's model tier per complexity level (similar to agent routing display). Uses the existing `TIER_DISPLAY_CONFIG` and `COMPLEXITY_LEVELS` constants for color coding.
   - **Loop Budgets**: Numeric inputs with +/- controls (min 1, max 5) for iteration caps (plan verification iterations, harness fix iterations, verify fix iterations)
   - **Agents**: List of assigned agents as clickable links that navigate to `/agents?selected={name}`. Show agent count badge.
   - **Gates**: Toggle switches for applicable gates (premortem, process_data, etc.)
2. On node click, set `detailPanelStateAtom` to `"docked"` and render `StepConfigPanel` inside `DetailPanel`. Title: "Step: {step-name}".
3. On pane click (deselect), set `detailPanelStateAtom` to `"closed"`.
4. Configuration changes write to `configDraftAtom` (the workflow section of config.json) and trigger `markDirtyAtom("config")`.
5. Include `ValidationBanner` for the config entity key.

**Files to create/edit:**

- `packages/luca-studio/components/workflow/step-config-panel.tsx`
- `packages/luca-studio/components/workflow/step-identity-section.tsx`
- `packages/luca-studio/components/workflow/step-routing-section.tsx`
- `packages/luca-studio/components/workflow/step-budgets-section.tsx`
- `packages/luca-studio/components/workflow/step-agents-section.tsx`
- `packages/luca-studio/components/workflow/step-gates-section.tsx`

**Verification:**

- Clicking a node opens the detail panel with all 5 sections
- Identity fields are editable and update the config draft
- Enabled toggle changes step status (reflected on node)
- Loop budget controls clamp to valid range (1-5)
- Agent links navigate to agents page
- Gate toggles persist to config draft
- Clicking empty canvas closes the panel

### 3. Drag Persistence and Node Interaction

**Type:** auto
**TDD:** false
**Depends on:** 1

Implement drag persistence and node interaction following R11 Phase B and C:

1. **Drag persistence**: Add `onNodeDragStop` handler that persists the new position to `pipelineNodesAtom`. Following the R11 recommendation, avoid calling `setNodes` directly inside the handler -- let the atom update propagate through React render.
2. **Insert node**: Add a floating action button (FAB) in the canvas toolbar area that opens a dropdown with available step types. On selection, create a new node at the center of the viewport with default configuration, add edges connecting it to the nearest logical position, and trigger auto-relayout.
3. **Delete node**: Add delete action in the existing node overflow menu (already has "Delete" option via `WorkflowNode.onOverflowAction`). On delete, show a confirmation dialog (shadcn AlertDialog), then remove the node and reconnect surrounding edges.
4. **Edge reconnection**: Set `nodesConnectable={true}` on the ReactFlow component. Add `onConnect` handler for new edges with DAG cycle validation (reject connections that would create cycles). Add `onReconnect` handler using React Flow's `reconnectEdge` utility.
5. All structural changes (add/delete/reconnect) mark the config as dirty via `markDirtyAtom("config")`.

**Files to create/edit:**

- `packages/luca-studio/components/workflow/pipeline-canvas.tsx` (add drag/connect/delete handlers)
- `packages/luca-studio/components/workflow/add-step-menu.tsx` (step type selection dropdown)
- `packages/luca-studio/lib/dag-validation.ts` (acyclic constraint validator)

**Verification:**

- Dragging a node persists its new position
- "Add Step" creates a new node with default config
- Deleting a node shows confirmation, then removes and reconnects edges
- Drawing an edge that would create a cycle is rejected
- Edge reconnection works (drag edge endpoint to new node)
- All changes mark config as dirty

### 4. Canvas Toolbar and Save Integration

**Type:** auto
**TDD:** false
**Depends on:** 1, 2, 3

Build the canvas toolbar and wire up the save/discard workflow for pipeline changes:

1. Create `canvas-toolbar.tsx` as a floating toolbar rendered via React Flow's `Panel` component (position: top-center or top-right):
   - Zoom In / Zoom Out (using `useReactFlow().zoomIn/zoomOut`)
   - Fit View (using `useReactFlow().fitView`)
   - Minimap toggle (show/hide minimap)
   - Add Step button (triggers `AddStepMenu`)
   - Layout toggle: horizontal/vertical (switches `applyGroupedColumnLayout` direction and recalculates positions)
2. Add `SaveBar` at the bottom of the pipeline page, scoped to `entityFilter="config"`.
3. `onSave` handler: serialize the pipeline configuration changes and persist via `PUT /api/config/workflow`. Include ETag for optimistic concurrency. On success, also update `pipelineNodesAtom`/`pipelineEdgesAtom` to match the saved state and clear dirty tracking.
4. `onDiscard` handler: reset `configDraftAtom` to server state, re-initialize pipeline nodes/edges from the original topology, and clear dirty tracking.
5. Keyboard shortcuts: Cmd+S to save, Cmd+Z/Cmd+Shift+Z for undo/redo (using the existing undo/redo infrastructure from jotai-history if applicable to pipeline state).

**Files to create/edit:**

- `packages/luca-studio/components/workflow/canvas-toolbar.tsx`
- `packages/luca-studio/hooks/use-pipeline-save.ts` (save/discard logic)
- `packages/luca-studio/app/pipeline/page.tsx` (integrate SaveBar and toolbar)

**Verification:**

- Toolbar buttons work: zoom in/out, fit view, minimap toggle
- Layout toggle switches between horizontal and vertical DAG layout
- Add Step button opens step type menu
- Save persists all pipeline changes (positions, config edits, structural changes)
- Discard reverts to server state
- Cmd+S triggers save
- SaveBar shows correct dirty count

## Verification

1. Navigate to /pipeline -- page renders interactive DAG with all workflow steps
2. Click a step node -- detail panel opens with full configuration sections
3. Edit step configuration (name, toggle, budgets, gates) -- dirty indicator appears
4. Drag a node to new position -- position persists after release
5. Add a new step via toolbar -- node appears with edges
6. Delete a step -- confirmation dialog, node removed, edges reconnected
7. Draw a cyclic edge -- connection rejected with validation
8. Save all changes -- PUT request succeeds, dirty state clears
9. Discard changes -- canvas reverts to server state
10. Toolbar controls (zoom, fit, minimap, layout toggle) all function

## Success Criteria

- Pipeline renders as interactive React Flow v12 DAG with controlled state
- Node drag positions persist (R11 Phase B complete)
- Step configuration is editable via detail panel with 5 collapsible sections
- Add/delete node operations work with proper edge management (R11 Phase C complete)
- Connection drawing with DAG cycle validation works (R11 Phase D complete)
- Canvas toolbar provides zoom, fit, minimap, layout toggle, and add step
- Save/discard cycle completes without errors via config API
- All existing functionality preserved (complexity filter, minimap, keyboard shortcuts)

## Output Specification

- `components/workflow/pipeline-canvas.tsx` -- interactive React Flow canvas with controlled state
- `components/workflow/step-config-panel.tsx` -- step configuration detail panel
- `components/workflow/step-identity-section.tsx` -- identity section
- `components/workflow/step-routing-section.tsx` -- model routing display section
- `components/workflow/step-budgets-section.tsx` -- loop budget controls section
- `components/workflow/step-agents-section.tsx` -- agent list section
- `components/workflow/step-gates-section.tsx` -- gate toggles section
- `components/workflow/canvas-toolbar.tsx` -- floating canvas toolbar
- `components/workflow/add-step-menu.tsx` -- step type selection dropdown
- `stores/pipeline-atoms.ts` -- pipeline node/edge state atoms
- `hooks/use-pipeline-save.ts` -- save/discard logic
- `lib/dag-validation.ts` -- acyclic constraint validator
- `app/pipeline/page.tsx` -- refactored pipeline page with interactive editor
