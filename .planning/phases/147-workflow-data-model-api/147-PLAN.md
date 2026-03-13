# Phase 147 Plan: Workflow Data Model & API

**Goal:** Define typed workflow graph structure, create static topology data, serve via API route, and hook into React Flow canvas.

**Complexity:** SIMPLE
**Context budget:** ~40% (small appetite)
**Wave count:** 1 (all tasks are sequential, small scope)

## Wave 1: Data Model, Topology, API, Hook

### Task 1: Create workflow type schemas

**File:** `packages/luca-observer/lib/workflow-types.ts`

Create Zod schemas for the workflow graph data model:

- `WorkflowNodeType` enum: `step`, `agent`, `skill`, `gate`
- `WorkflowEdgeType` enum: `invokes`, `spawns`, `gates`, `data-flow`
- `ModelTier` enum: `fast`, `balanced`, `capable`
- `WorkflowNodeDataSchema`: custom data for React Flow nodes (node_type, label, description, model_tier, complexity_min, purpose, color)
- `WorkflowEdgeDataSchema`: custom data for React Flow edges (edge_type, label, condition)
- `WorkflowTopologyResponseSchema`: API response shape (nodes, edges, stages)
- Export all types via `z.infer<typeof Schema>`

**Verification:** File exists, exports all schemas, `bunx --bun tsc --noEmit` passes.

### Task 2: Create static workflow topology data

**File:** `packages/luca-observer/lib/workflow-topology.ts`

Curate the autopilot pipeline as static data:

**Pipeline spine (step nodes):**

- classify, discuss, plan, execute, verify, learn

**Agent nodes (branching off spine):**

- lu-router (classify), lu-cognition (classify)
- phase-discuss researchers (discuss)
- lu-planner, lu-plan-checker (plan)
- lu-executor, lu-executor-capable, lu-test-writer (execute)
- lu-verifier, lu-verifier-fast, code-architect, security-auditor, dx-advocate, performance-auditor (verify)
- lu-learner (learn)

**Gate nodes:**

- complexity-gate (between classify and discuss — determines model tiers)

**Edges:**

- Spine connections: classify → discuss → plan → execute → verify → learn
- Invocations: step → agent
- Spawns: agent → sub-agent (e.g., lu-executor → lu-test-writer)
- Gates: complexity-gate → model tier routing

Include a `getTopology(complexity?: string)` function that optionally filters agents by complexity level.

**Verification:** File exists, exports topology function, type-checks clean.

### Task 3: Create API route

**File:** `packages/luca-observer/app/api/workflow/topology/route.ts`

GET endpoint following existing patterns:

- Parse optional `complexity` query param via `parseQueryParams` + Zod schema
- Call `getTopology(complexity)` from `lib/workflow-topology.ts`
- Return JSON response
- No MuninnDB dependency (static data)

**Verification:** File exists, exports GET function, type-checks clean.

### Task 4: Create data fetching hook

**File:** `packages/luca-observer/hooks/use-workflow-graph.ts`

Follow `use-dashboard.ts` pattern:

- `"use client"` directive
- `useAtomValue(vaultAtom)` for future vault scoping
- `useState` for nodes, edges, loading, error
- `useCallback` + `useEffect` for data fetching
- Fetch from `/api/workflow/topology`
- Transform API response into React Flow `Node[]` and `Edge[]`
- Return `{ nodes, edges, loading, error, refresh }`

**Verification:** File exists, exports `useWorkflowGraph`, type-checks clean.

### Task 5: Wire canvas to dynamic data

**File:** `packages/luca-observer/components/workflow-editor/workflow-canvas.tsx`

Replace hardcoded `initialNodes`/`initialEdges` with hook data:

- Import and call `useWorkflowGraph()`
- Pass `nodes` and `edges` to `<ReactFlow>`
- Show loading state while fetching
- Show error state on failure
- Keep `colorMode="dark"`, `fitView`, `Background`, `Controls`

**Verification:** File updated, uses hook, type-checks clean.

### Task 6: Type check

Run `bunx --bun tsc --noEmit` in observer package to verify zero errors.

**Verification:** Exit code 0.

## Success Criteria

- [ ] `lib/workflow-types.ts` exports WorkflowNodeData, WorkflowEdgeData, WorkflowTopologyResponse types via Zod
- [ ] `lib/workflow-topology.ts` exports `getTopology()` with 6 pipeline stages, 15+ agent nodes, proper edges
- [ ] `app/api/workflow/topology/route.ts` serves GET with optional complexity filter
- [ ] `hooks/use-workflow-graph.ts` fetches topology and returns React Flow-compatible data
- [ ] `workflow-canvas.tsx` uses dynamic data from hook instead of hardcoded nodes
- [ ] `bunx --bun tsc --noEmit` passes with zero errors
