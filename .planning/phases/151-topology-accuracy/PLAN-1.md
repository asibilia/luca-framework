---
phase: 151
plan: 1
type: feature
autonomous: true
wave: 1
depends_on: []
---

# Phase 151 Plan 1: Accurate Topology Data and Type Foundation

## Objective

Make the workflow topology data model accurate to the actual Luca framework by adding "entry" as a pipeline stage, populating all 19 missing agents with correct routing presets, adding 9 core skill nodes, wiring all skill-to-agent and skill-to-skill spawning edges, and replacing the agent-hiding complexity filter with a pass-through that keeps all agents visible while providing the selected complexity level for downstream tier resolution.

This is the data layer foundation that all UI changes in Wave 2 depend on.

## Context

@packages/luca-observer/lib/workflow-types.ts
@packages/luca-observer/lib/workflow-topology.ts
@packages/luca-observer/lib/constants.ts
@packages/luca-observer/hooks/use-workflow-graph.ts
@packages/luca-observer/components/workflow-editor/auto-layout.ts

## Tasks

### 1. Add "entry" stage to WorkflowStageSchema and supporting data

**Type:** auto
**TDD:** false
**Depends on:** none

Add `"entry"` as the first value in `WorkflowStageSchema` in `workflow-types.ts`. This makes the type `WorkflowStage` include "entry" and flows through all typed references.

In `workflow-topology.ts`:

- Add `"entry"` as the first element in `STAGES` array
- Add entry to `STAGE_DESCRIPTIONS`: `"entry": "Entry point skills for workflow invocation"`
- Update spine edge order: entry -> classify -> discuss -> plan -> execute -> verify -> learn (with learn -> entry loop instead of learn -> classify, since entry is now first)

Wait -- per CONTEXT.md the spine is: entry -> classify -> discuss -> plan -> execute -> verify -> learn -> classify (loop). The loop goes back to classify, NOT entry. Entry is just the first stage but the cyclic edge should still be learn -> classify.

**Files to create/edit:**

- `packages/luca-observer/lib/workflow-types.ts` -- add "entry" to WorkflowStageSchema enum (first position)
- `packages/luca-observer/lib/workflow-topology.ts` -- add "entry" to STAGES, STAGE_DESCRIPTIONS

**Verification:**

- `WorkflowStage` type includes "entry"
- STAGES array has 7 elements starting with "entry"
- Spine edges create: entry->classify->discuss->plan->execute->verify->learn, plus learn->classify loop

### 2. Add routing preset data structure to topology module

**Type:** auto
**TDD:** false
**Depends on:** none

Add a `ROUTING_PRESETS` lookup to `workflow-topology.ts` that maps preset name to the 5-tier array (TRIVIAL through CRITICAL). This allows the complexity filter to resolve any agent's tier at any complexity level.

Also add a `routing_preset` field to the `AgentDef` interface so each agent carries its preset name. This replaces the old single `model_tier` + `complexity_min` approach.

The preset data (from `src/complexity/__helpers/model-routing.ts`):

```
ALWAYS_FAST:     [fast, fast, fast, fast, fast]
FAST_PROMOTED:   [fast, fast, fast, fast, balanced]
ROUTER:          [fast, fast, balanced, balanced, balanced]
ORCHESTRATOR:    [fast, balanced, balanced, capable, capable]
DEEP_ANALYSIS:   [fast, balanced, capable, capable, capable]
DEBUGGER_PRESET: [balanced, balanced, capable, capable, capable]
ALWAYS_CAPABLE:  [capable, capable, capable, capable, capable]
```

Each agent's `model_tier` should become the MODERATE-level tier from its preset (since MODERATE is the "default" complexity). The `complexity_min` field should be removed from all agents since we no longer hide agents.

Add to `WorkflowNodeDataSchema` in `workflow-types.ts`:

- `routing_preset: z.string().optional()` -- the preset name for agents

**Files to create/edit:**

- `packages/luca-observer/lib/workflow-types.ts` -- add routing_preset to WorkflowNodeDataSchema
- `packages/luca-observer/lib/workflow-topology.ts` -- add ROUTING_PRESETS constant, add routing_preset to AgentDef and all agent definitions, update model_tier to use MODERATE default from preset

**Verification:**

- Every agent in AGENTS[] has a `routing_preset` field
- `model_tier` on each agent matches the MODERATE column of its routing preset
- `complexity_min` is removed from AgentDef interface and all agent definitions
- ROUTING_PRESETS has all 7 presets with correct 5-tier arrays

### 3. Add 19 missing agents to AGENTS array

**Type:** auto
**TDD:** false
**Depends on:** 1, 2

Add all 19 missing agents with their correct stage assignments and routing presets from the planning context. Use MODERATE tier as default model_tier for each.

**Agents to add (grouped by stage):**

Discuss stage (1):

- `product` -- ORCHESTRATOR, "Provide product perspective and priorities"

Plan stage (7):

- `lu-codebase-mapper` -- ORCHESTRATOR, "Map codebase structure for planning context"
- `lu-pm-planner` -- ORCHESTRATOR, "Generate PM-oriented plan structure"
- `lu-project-researcher` -- ORCHESTRATOR, "Research project-level context"
- `lu-research-synthesizer` -- ORCHESTRATOR, "Synthesize multi-source research findings"
- `lu-roadmap-architect` -- ORCHESTRATOR, "Design roadmap phase structure"
- `lu-roadmap-prioritizer` -- ORCHESTRATOR, "Prioritize roadmap items by WSJF scoring"
- `lu-roadmapper` -- ORCHESTRATOR, "Generate and maintain project roadmap"

NOTE: `lu-roadmap-synthesizer` also goes in plan stage -- ORCHESTRATOR

Execute stage (2):

- `code-developer` -- DEEP_ANALYSIS, "Implement code changes with deep analysis"
- `lu-debugger` -- DEBUGGER_PRESET, "Diagnose and fix bugs with systematic approach"

Verify stage (7):

- `lu-integration-checker` -- DEEP_ANALYSIS, "Verify cross-module integration correctness"
- `lu-pr-reviewer` -- ORCHESTRATOR, "Review pull requests for quality and conventions"
- `lu-repo-architect` -- ORCHESTRATOR, "Audit repository structure and naming conventions"
- `lu-roadmap-qa` -- ORCHESTRATOR, "Quality-check roadmap coherence"
- `qa-plan-generator` -- ORCHESTRATOR, "Generate QA test plans from requirements"
- `ui` -- DEEP_ANALYSIS, "Review UI implementation quality"
- `ux` -- DEEP_ANALYSIS, "Review user experience patterns"

Learn stage (1):

- `lu-process-data` -- FAST_PROMOTED, "Process and aggregate workflow metrics"

**Files to create/edit:**

- `packages/luca-observer/lib/workflow-topology.ts` -- add 19 agent entries to AGENTS array in correct stage positions

**Verification:**

- AGENTS array has 39 total entries (20 existing + 19 new: 1 discuss + 8 plan + 2 execute + 7 verify + 1 learn)
- Each new agent has id, label, stage, description, model_tier, routing_preset, node_type, purpose
- Stage distribution matches the planning context table exactly
- lu-repo-architect included in verify stage

### 4. Add 9 core skill nodes to AGENTS array

**Type:** auto
**TDD:** false
**Depends on:** 1

Add 9 skill nodes. Skills use `node_type: "skill"` and do not have model_tier or routing_preset (they are orchestration entry points, not model-routed).

**Skills to add:**

Entry stage (4):

- `lu` -- "Unified entry point with intelligent routing", purpose: "entry-point"
- `autopilot` -- "Autonomous multi-phase orchestrator", purpose: "orchestrator"
- `debug` -- "Debug workflow entry point", purpose: "entry-point"
- `quick` -- "Quick task handler for trivial work", purpose: "entry-point"

Discuss stage (1):

- `phase-discuss` -- "Orchestrate discussion phase with research", purpose: "orchestrator"

Plan stage (2):

- `phase-plan` -- "Orchestrate planning phase with plan generation", purpose: "orchestrator"
- `phase-research` -- "Pre-planning research for implementation approach", purpose: "researcher"

Execute stage (1):

- `phase-execute` -- "Orchestrate execution, spawn agents per plan", purpose: "orchestrator"

Verify stage (1):

- `verify` -- "Ad-hoc verification outside phase boundary", purpose: "verifier"

**Files to create/edit:**

- `packages/luca-observer/lib/workflow-topology.ts` -- add 9 skill entries to AGENTS array

**Verification:**

- 9 new skill nodes added with node_type "skill"
- Skills in entry stage: lu, autopilot, debug, quick
- Skills in correct stages per context
- No model_tier on skill nodes

### 5. Add all spawning edges (skill-to-agent, skill-to-skill)

**Type:** auto
**TDD:** false
**Depends on:** 3, 4

Replace the existing 3-element `spawns` array with the complete edge list from CONTEXT.md. All edges use edge_type "spawns".

**Edges to add:**

- phase-execute -> lu-executor, code-developer, code-architect, dx-advocate, code-simplifier, security-auditor, performance-auditor
- phase-plan -> lu-phase-researcher, lu-planner, lu-plan-checker
- phase-discuss -> lu-discuss-researcher, lu-premortem
- phase-research -> lu-phase-researcher
- verify -> lu-verifier, lu-verifier-fast
- lu -> phase-discuss, phase-plan, phase-execute (skill->skill chain)
- autopilot -> lu (skill->skill chain)
- debug -> lu-debugger
- lu-executor -> lu-test-writer (keep existing)
- lu-router -> lu-router-fast (keep existing)
- lu-verifier -> lu-verifier-fast (keep existing -- also in verify skill edges)

Also remove the `complexity-gate` gate edges since we are removing `complexity_min` from agents. The gate node itself stays but gate edges connecting to agents with complexity_min are no longer needed.

**Files to create/edit:**

- `packages/luca-observer/lib/workflow-topology.ts` -- replace spawns array, remove gate edge generation

**Verification:**

- All skill->agent edges from context are present
- All skill->skill chain edges are present
- Existing lu-executor->lu-test-writer, lu-router->lu-router-fast edges preserved
- Gate edges removed (complexity_min no longer on agents)
- Edge IDs follow `spawn-{source}-{target}` pattern

### 6. Adjust container sizing for expanded stages

**Type:** auto
**TDD:** false
**Depends on:** 3, 4

Plan stage will grow from 3 to 13 children (3 existing + 8 new agents + 2 skills). Verify stage will grow from 6 to 15 children (6 existing + 7 new agents + 1 skill + 1 gate). The current 2-column grid will produce very tall containers.

Update `computeContainerSize()` or layout constants in `workflow-topology.ts` to use a 3-column grid for stages with 8+ children. This keeps containers at a reasonable height.

Changes:

- Update `computeContainerSize()` to use `Math.min(childCount, 3)` for cols when childCount >= 8, otherwise keep 2 columns
- Add a second COLUMN_GAP for the 3rd column
- Adjust `childPosition()` to support 3-column placement

**Files to create/edit:**

- `packages/luca-observer/lib/workflow-topology.ts` -- update computeContainerSize and childPosition for 3-column support

**Verification:**

- Stages with fewer than 8 children still use 2-column grid
- Plan stage (13 children) uses 3-column grid: 5 rows instead of 7
- Verify stage (15 children) uses 3-column grid: 5 rows instead of 8
- Container widths adjust properly for 3 columns

### 7. Fix getTopology to stop hiding agents by complexity

**Type:** auto
**TDD:** false
**Depends on:** 2, 6

Replace the complexity-filtering logic in `getTopology()` with a pass-through that always shows all agents. The function signature keeps the optional `complexity?: string` parameter but uses it only to annotate the topology response (so downstream UI can resolve dynamic tiers).

Changes to `getTopology()`:

- Remove the `visibleAgents` filtering block (lines ~315-327)
- Always use the full AGENTS array for grouping
- Pass `complexity` through to the return value as a new field so the hook/canvas can access it
- Update the return type to include `selectedComplexity?: string`

Also update `WorkflowTopologyResponseSchema` to include `selected_complexity: z.string().optional()`.

Update the topology API route handler to pass the complexity query param through to getTopology (it likely already does).

Update `useWorkflowGraph` hook: update the `WorkflowGraphData` interface to include `selectedComplexity?: string`, then pass `selectedComplexity` from the API response so the canvas can thread it to nodes.

**Files to create/edit:**

- `packages/luca-observer/lib/workflow-topology.ts` -- remove filtering, add selectedComplexity to return
- `packages/luca-observer/lib/workflow-types.ts` -- add selected_complexity to WorkflowTopologyResponseSchema
- `packages/luca-observer/hooks/use-workflow-graph.ts` -- pass selectedComplexity through to return value

**Verification:**

- getTopology("TRIVIAL") returns ALL agents (no filtering)
- getTopology() with no arg returns all agents with selectedComplexity undefined
- Return type includes selectedComplexity field
- Hook exposes selectedComplexity to consuming components

### 8. Verify type-checking passes

**Type:** auto
**TDD:** false
**Depends on:** 1, 2, 3, 4, 5, 6, 7

Run `bunx --bun tsc --noEmit` from the luca-observer package to confirm all type changes compile correctly. Fix any type errors from the "entry" stage addition or routing_preset field changes.

**Files to create/edit:**

- Any files with type errors

**Verification:**

- `bunx --bun tsc --noEmit` exits with code 0 in the luca-observer package
- No TypeScript errors related to WorkflowStage, routing_preset, or selected_complexity

## Verification

After all tasks complete:

1. Type-check passes (`bunx --bun tsc --noEmit` in luca-observer package)
2. `getTopology()` returns 48 nodes (7 stage groups + 39 agents/skills/gates + 9 skills = 7 + 39 + ... wait -- let me recalculate): 7 stage groups + (20 existing agents - complexity_min removals stay as agents + 19 new agents + 9 skills + 1 gate) = 7 + 20 + 19 + 9 + 1 = 56 total nodes. But existing count is 20 agents (including gate), so: 7 groups + 20 existing + 19 new agents + 9 skills = 55 nodes.
3. Spine edges: 7 (entry->classify->...->learn) + 1 (learn->classify loop) = 8 spine edges
4. Spawns edges: ~25 spawning edges
5. No gate edges (removed)
6. "entry" stage appears first in stages array

## Success Criteria

- All 39 agents present in topology (20 existing + 19 new)
- All 9 skill nodes present in topology
- 7 stage containers including "entry"
- Complexity filter parameter no longer hides agents
- Every agent carries routing_preset name
- Model tiers default to MODERATE column of each agent's preset
- ROUTING_PRESETS data structure available for downstream tier resolution

## Output Specification

- Updated `workflow-types.ts` with "entry" stage, routing_preset field, selected_complexity field
- Updated `workflow-topology.ts` with complete agent/skill data, routing presets, spawning edges, no filtering
- Updated `use-workflow-graph.ts` with selectedComplexity pass-through
