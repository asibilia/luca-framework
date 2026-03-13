---
phase: 151
plan: 2
type: feature
autonomous: true
wave: 2
depends_on: [1]
---

# Phase 151 Plan 2: Complexity Filter Visualization and Sidebar Routing Preset

## Objective

Transform the complexity filter from an agent-hiding mechanism into a model tier visualization tool. When a complexity level is selected, agent card headers update their accent color and tier badge to reflect the agent's model tier at that complexity level (resolved from routing presets). Add routing preset display to the inspection sidebar. All agents remain visible at all complexity levels.

This plan depends on Plan 1 (Wave 1) which provides the routing preset data and removes the filtering behavior from the topology layer.

## Context

@packages/luca-observer/components/workflow-editor/complexity-filter.tsx
@packages/luca-observer/components/workflow-editor/nodes/agent-node.tsx
@packages/luca-observer/components/workflow-editor/workflow-sidebar.tsx
@packages/luca-observer/components/workflow-editor/workflow-canvas.tsx
@packages/luca-observer/hooks/use-workflow-graph.ts
@packages/luca-observer/lib/workflow-topology.ts
@packages/luca-observer/lib/workflow-types.ts

## Tasks

### 1. Thread selectedComplexity from canvas to agent nodes

**Type:** auto
**TDD:** false
**Depends on:** none (Plan 1 provides the data, this task wires it to UI)

The `useWorkflowGraph` hook (updated in Plan 1) now returns `selectedComplexity`. Thread this value through the canvas to agent nodes so they can resolve their dynamic tier.

In `workflow-canvas.tsx`:

- Extract `selectedComplexity` from the hook return value
- When mapping nodes for layout, inject `selectedComplexity` into each agent/gate node's `data` object so the node component can access it
- Add `selected_complexity` to `WorkflowNodeDataSchema` as optional string (already added in Plan 1's types update)

The approach: rather than passing a React context, inject the complexity value directly into each node's data when building `layoutNodes`. This keeps it simple -- agent nodes read `data.selected_complexity` and resolve their tier.

**Files to create/edit:**

- `packages/luca-observer/components/workflow-editor/workflow-canvas.tsx` -- inject selectedComplexity into node data

**Verification:**

- When complexity filter is set to "COMPLEX", every agent node's data includes `selected_complexity: "COMPLEX"`
- When filter is cleared, `selected_complexity` is undefined in node data
- Skill and gate nodes also receive the field (harmless, they ignore it)

### 2. Update AgentNode to resolve dynamic tier from routing preset

**Type:** auto
**TDD:** false
**Depends on:** 1

Update `agent-node.tsx` to resolve the displayed model tier dynamically based on `selected_complexity` and `routing_preset` fields in node data.

Logic:

1. If `data.selected_complexity` is set AND `data.routing_preset` is set:
   - Import the `ROUTING_PRESETS` constant from `workflow-topology.ts`
   - Look up `ROUTING_PRESETS[data.routing_preset]`
   - Map the complexity level to an index: TRIVIAL=0, SIMPLE=1, MODERATE=2, COMPLEX=3, CRITICAL=4
   - Read the tier at that index
   - Use that tier for TIER_CONFIG lookup
2. If no `selected_complexity` is set (filter cleared):
   - Fall back to `data.model_tier` (the default MODERATE tier from topology data)
3. If no `routing_preset` (skills, gates, or legacy):
   - Fall back to `data.model_tier` as before

Export the `ROUTING_PRESETS` from `workflow-topology.ts` (it is currently a module-level const -- add export).

Also export a helper function `resolveTierAtComplexity(preset: string, complexity: string): ModelTier` from the topology module for reuse.

Update the TIER_CONFIG to include human-readable labels that include the model name:

- fast: "Fast (Haiku)"
- balanced: "Balanced (Sonnet)"
- capable: "Capable (Opus)"

**Files to create/edit:**

- `packages/luca-observer/lib/workflow-topology.ts` -- export ROUTING_PRESETS, add resolveTierAtComplexity helper
- `packages/luca-observer/components/workflow-editor/nodes/agent-node.tsx` -- use dynamic tier resolution

**Verification:**

- When complexity filter is "TRIVIAL", ORCHESTRATOR agents show "Fast (Haiku)" tier badge with gray accent
- When complexity filter is "COMPLEX", ORCHESTRATOR agents show "Capable (Opus)" tier badge with amber accent
- When filter is cleared, agents show their default (MODERATE) tier
- ALWAYS_FAST agents always show "Fast" regardless of complexity selection
- DEBUGGER_PRESET agents show "Balanced" at TRIVIAL/SIMPLE, "Capable" at MODERATE+

### 3. Update complexity filter component tooltip text

**Type:** auto
**TDD:** false
**Depends on:** none

Update `complexity-filter.tsx` to clarify that selecting a complexity level shows model tier assignments, not filters agents. Update the tooltip text from "Filter to X complexity" to "Show model tiers at X complexity".

No structural changes needed -- the filter still toggles a complexity string that flows through to the hook/canvas. The behavior change is in the topology layer (Plan 1) and agent node (Task 2).

**Files to create/edit:**

- `packages/luca-observer/components/workflow-editor/complexity-filter.tsx` -- update tooltip text

**Verification:**

- Button titles say "Show model tiers at X complexity (Y tier)" instead of "Filter to X complexity"
- Component still toggles complexity value on click
- Clearing filter (clicking active level) still works

### 4. Add routing preset display to workflow sidebar

**Type:** auto
**TDD:** false
**Depends on:** none (uses routing_preset from node data, added in Plan 1)

Update `workflow-sidebar.tsx` to show the routing preset name in the agent details Routing section. This gives users full visibility into which routing preset determines an agent's model tier.

In `AgentDetails`:

- Below the tier badge, add a "Routing Preset" property row showing the preset name (e.g., "ORCHESTRATOR", "DEEP_ANALYSIS")
- If `data.routing_preset` is set, display it in a monospace font
- If not set, don't show the row (skills and gates have no preset)

Also update the tier badge to use the full labels ("Fast (Haiku)", "Balanced (Sonnet)", "Capable (Opus)") -- matching the existing TIER_LABELS config which already has these.

**Files to create/edit:**

- `packages/luca-observer/components/workflow-editor/workflow-sidebar.tsx` -- add routing preset row to AgentDetails

**Verification:**

- Clicking an agent shows "Routing Preset: ORCHESTRATOR" (or appropriate preset) in the sidebar
- Clicking a skill or gate does NOT show routing preset
- Tier badge still shows with full label ("Balanced (Sonnet)" etc.)

### 5. Add "entry" stage color to minimap and constants

**Type:** auto
**TDD:** false
**Depends on:** none

The minimap color function and stats bar both handle stage-group nodes generically, so they auto-work. However, the "entry" stage container needs a distinct visual identity.

In `workflow-canvas.tsx`, no minimap changes needed since the minimap colors by node_type, not stage.

In `edge-styles.ts`, no changes needed.

Verify that the stage-group-node component handles the "entry" stage label correctly (it uppercases the first letter of the stage name, so "entry" -> "Entry" -- correct).

If any stage color constants exist (they might be in stage-group-node), ensure "entry" has a color. Check and update if needed.

**Files to create/edit:**

- `packages/luca-observer/components/workflow-editor/nodes/stage-group-node.tsx` -- add "entry" to any stage color map if one exists

**Verification:**

- "Entry" stage container renders with a distinct color
- Minimap shows entry stage container in correct color
- No missing color references for the new stage

### 6. Verify full integration and type-checking

**Type:** auto
**TDD:** false
**Depends on:** 1, 2, 3, 4, 5

Run `bunx --bun tsc --noEmit` to verify all UI changes compile. Then verify the complete data flow:

1. Complexity filter sets value -> hook fetches with complexity param -> topology returns all agents + selectedComplexity -> canvas injects into node data -> agent nodes resolve dynamic tier -> correct badge/accent displayed

**Files to create/edit:**

- Any files with type errors

**Verification:**

- `bunx --bun tsc --noEmit` exits with code 0
- No runtime errors in the component tree
- Complexity filter + agent node + sidebar all work together correctly

## Verification

After all tasks complete:

1. Type-check passes
2. Selecting "TRIVIAL" in complexity filter: all agents visible, most show "Fast (Haiku)" badge, DEBUGGER_PRESET shows "Balanced (Sonnet)", ALWAYS_CAPABLE shows "Capable (Opus)"
3. Selecting "CRITICAL" in complexity filter: most agents show "Capable (Opus)" or "Balanced (Sonnet)", ALWAYS_FAST shows "Fast (Haiku)"
4. Clearing filter: agents show default MODERATE tier
5. Sidebar shows routing preset name for agents
6. Entry stage container has visual identity
7. Stats bar shows accurate counts (auto-updated from topology data)

## Success Criteria

- Complexity filter never hides agents -- only changes tier visualization
- Agent card header color + tier badge update dynamically when complexity changes
- Sidebar displays routing preset name
- All 7 stages (including entry) render correctly
- Type-checking passes with zero errors

## Output Specification

- Updated `workflow-canvas.tsx` with selectedComplexity threading
- Updated `agent-node.tsx` with dynamic tier resolution
- Updated `complexity-filter.tsx` with corrected tooltips
- Updated `workflow-sidebar.tsx` with routing preset display
- Updated `stage-group-node.tsx` with entry stage color (if needed)
