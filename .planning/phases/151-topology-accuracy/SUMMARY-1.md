# Phase 151 Plan 1 Summary: Accurate Topology Data and Type Foundation

## Status: COMPLETE

## Tasks Completed

### Task 1: Add "entry" stage to WorkflowStageSchema and supporting data

- Added `"entry"` as first value in `WorkflowStageSchema` in `workflow-types.ts`
- Added `"entry"` as first element in `STAGES` array in `workflow-topology.ts`
- Added entry to `STAGE_DESCRIPTIONS`: "Entry point skills for workflow invocation"
- Spine edges now flow: entry -> classify -> discuss -> plan -> execute -> verify -> learn
- Cyclic edge: learn -> classify (not learn -> entry, per plan)

### Task 2: Add routing preset data structure

- Added `ROUTING_PRESETS` lookup with all 7 named presets (ALWAYS_FAST, FAST_PROMOTED, ROUTER, ORCHESTRATOR, DEEP_ANALYSIS, DEBUGGER_PRESET, ALWAYS_CAPABLE)
- Added `resolveTierAtComplexity()` helper function
- Added `routing_preset` field to `AgentDef` interface, removed `complexity_min`
- Added `routing_preset` to `WorkflowNodeDataSchema`, removed `complexity_min`
- Updated all 20 existing agents with correct routing presets and model_tier values per the MODERATE column

### Task 3: Add 19 missing agents

- Discuss: product (ORCHESTRATOR)
- Plan: lu-codebase-mapper, lu-pm-planner, lu-project-researcher, lu-research-synthesizer, lu-roadmap-architect, lu-roadmap-prioritizer, lu-roadmap-synthesizer, lu-roadmapper (all ORCHESTRATOR)
- Execute: code-developer (DEEP_ANALYSIS), lu-debugger (DEBUGGER_PRESET)
- Verify: lu-integration-checker (DEEP_ANALYSIS), lu-pr-reviewer (ORCHESTRATOR), lu-repo-architect (ORCHESTRATOR), lu-roadmap-qa (ORCHESTRATOR), qa-plan-generator (ORCHESTRATOR), ui (DEEP_ANALYSIS), ux (DEEP_ANALYSIS)
- Learn: lu-process-data (FAST_PROMOTED)

### Task 4: Add 9 core skill nodes

- Entry: lu, autopilot, debug, quick
- Discuss: phase-discuss
- Plan: phase-plan, phase-research
- Execute: phase-execute
- Verify: verify

### Task 5: Add all 23 spawning edges

- 16 skill->agent invocations
- 4 skill->skill chains (lu->phase-discuss, lu->phase-plan, lu->phase-execute, autopilot->lu)
- 3 agent->agent spawns (lu-executor->lu-test-writer, lu-router->lu-router-fast, lu-verifier->lu-verifier-fast)
- Removed gate edge generation block (complexity_min no longer exists)

### Task 6: Adjust container sizing for expanded stages

- Updated `computeContainerSize()` to use 3-column grid for stages with 8+ children
- Updated `childPosition()` to accept `colCount` parameter for variable-column placement
- Child node loop now computes colCount dynamically

### Task 7: Fix getTopology to stop hiding agents by complexity

- Removed complexity-filtering block entirely
- All agents/skills always visible regardless of complexity parameter
- Added `selectedComplexity` to return value for downstream tier resolution
- Added `selected_complexity` to `WorkflowTopologyResponseSchema`
- Updated `WorkflowGraphData` interface with `selectedComplexity`
- Updated `useWorkflowGraph` hook to extract and return `selectedComplexity`
- Updated API route to map camelCase to snake_case in response

### Task 8: Verify type-checking passes

- `bunx --bun tsc --noEmit` passes clean with zero errors

## Deviations

- **[Rule 1 - Bug]** `agent-node.tsx` displayed `complexity_min` badge; updated to show `routing_preset` badge instead
- **[Rule 1 - Bug]** `workflow-sidebar.tsx` displayed "Min. Complexity" property row; updated to "Routing Preset" row
- **[Rule 3 - Blocking]** API route `topology/route.ts` needed explicit camelCase-to-snake_case mapping for the new `selectedComplexity` field to match `WorkflowTopologyResponseSchema`

## Files Modified

- `packages/luca-observer/lib/workflow-types.ts` — Schema changes (entry stage, routing_preset, selected_complexity)
- `packages/luca-observer/lib/workflow-topology.ts` — Routing presets, 39 agents + 9 skills + 1 gate, 23 spawn edges, 3-column layout, no complexity filtering
- `packages/luca-observer/hooks/use-workflow-graph.ts` — selectedComplexity state and return
- `packages/luca-observer/app/api/workflow/topology/route.ts` — snake_case mapping for selected_complexity
- `packages/luca-observer/components/workflow-editor/nodes/agent-node.tsx` — routing_preset badge
- `packages/luca-observer/components/workflow-editor/workflow-sidebar.tsx` — Routing Preset property row

## Verification

- TypeScript compilation: PASS (zero errors)
- Node counts: 39 agents, 9 skills, 1 gate, 7 stages = 56 total nodes
- Edge counts: 6 spine + 1 cyclic + 23 spawn = 30 total edges
